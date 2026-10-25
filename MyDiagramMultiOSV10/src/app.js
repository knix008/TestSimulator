// Main window: menu bar, toolbar, drawing tabs, Shapes panel (left), the
// current view (drawing, pages, shape sheet, shape data, reports), the
// properties panel (right), status bar.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import * as D from './domain/diagram.js';
import { DiagramDocument } from './domain/document.js';
import {
  baseName, directoryOf, extensionOf, FormatError, isCsvFileName, isDiagramFileName, isImageFileName, isSvgFileName, isTemplateFileName, isVsdxFileName, parseDiagram, stripExtension, withExtension,
} from './domain/format.js';
import { buildSample, buildTemplate, TEMPLATES } from './domain/templates.js';
import { CATEGORIES, MASTERS, masterById, mastersIn, searchMasters, shapeParams } from './domain/stencils.js';
import { ARROWS, DASHES, DESIGNS, FONTS, resolveConnectorStyle, resolveShapeStyle, STANDARD_COLORS, variantColors, QUICK_VARIANTS } from './domain/designs.js';
import { layoutPage, LAYOUTS } from './domain/layout.js';
import { bytesToBase64, base64ToBytes, exportHtml, exportShapeDataCsv, exportVsdx, importVsdx, linkDataCsv, orgChartFromData, shapesFromText } from './domain/interop.js';
import { SHAPE_FIELD_MAP } from './domain/fields.js';
import { addRecent, loadRecent, loadRecentDirs, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import {
  loadSettings, PANEL_MIN, PRINT_KEY, RECENT_DIRS_KEY, RECENT_KEY, SESSION_KEY, STORAGE_KEY, storeSettings, VIEWS, ZOOM, CANVAS_ZOOM, zoomStep,
  dbConfig, dbDescribe, dbProblems, ANIMATIONS, MY_SHAPES_KEY, STENCIL_SIZES,
} from './domain/settings.js';
import { center, shapeBounds, unionBounds } from './domain/geometry.js';
import { switchFlag } from './flags.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { PopupHost } from './platform/popups.js';
import { applyFont, applyTheme, randomThemeId, resolveTheme, themeName } from './themes.js';
import { escapeHtml, frameThrottle, isMac, keyLabel, pointerDrag } from './ui/dom.js';
import { AnimatedBackground } from './ui/background.js';
import { startPageHtml } from './ui/startpage.js';
import { STEPS as TUTORIAL_STEPS, Tutorial } from './ui/tutorial.js';
import { CanvasView, canvasMeasure } from './views/canvas.js';
import appIcon from '../assets/icon-256.png';
import { ShapeSheetView, ShapeDataView } from './views/sheets.js';
import { PagesView } from './views/pages.js';
import { REPORTS, ReportsView, reportModel } from './views/reports.js';
import { reportFileName, reportToDocx, reportToHtml, reportToMarkdown } from './export/report-export.js';
import { chartPngs, pdfFromJpegs, reportToPdf } from './export/report-pdf.js';
import { encodeBmp, encodeTiff, imageFormat, rasterSize } from './export/image-encode.js';
import { renderPageSvg, masterIcon } from './render/svg.js';
import { renderPrintSheets } from './print/render.js';

const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const measure = canvasMeasure();

const state = {
  settings: loadSettings(globalThis.localStorage),
  recent: loadRecent(globalThis.localStorage),
  recentDirs: loadRecentDirs(globalThis.localStorage),
  samples: [],
  docs: [],
  active: null,
  selection: { ids: [], primary: null },
  tool: 'pointer',
  notice: null,
  info: null,
  openMenu: null,
  lastMenuClose: { name: null, at: 0 },
  quitting: false,
  untitled: 0,
  dropActive: false,
  minWidth: 0,
  clipboard: null,
  showStart: false,
  view: null,
  viewId: null,
  columnWidths: {},
  guide: null,
  painter: null,
  pointer: null,
  stencilQuery: '',
  collapsedStencils: new Set(),
  myShapes: [],
  presenting: null,
  reader: null,
  rightSections: new Set(['fill', 'line', 'text', 'size', 'data', 'pageProps', 'docProps', 'layers', 'arrows', 'route', 'quick', 'comments']),
};
try { state.columnWidths = JSON.parse(globalThis.localStorage?.getItem('mydiagram.columns.v1') ?? '{}') ?? {}; } catch { state.columnWidths = {}; }
const loadMyShapes = () => { try { const list = JSON.parse(globalThis.localStorage?.getItem(MY_SHAPES_KEY) ?? '[]'); return Array.isArray(list) ? list : []; } catch { return []; } };
state.myShapes = loadMyShapes();

const activeTab = () => state.docs.find((doc) => doc.id === state.active) ?? null;
const activeDoc = activeTab;
const currentPage = () => activeTab()?.page ?? null;
const docName = (tab) => (tab.path ? baseName(tab.path) : tab.name ?? tab.doc.title);

// ───────────────────────── notices & errors

let noticeTimer = 0;
function notify(kind, text) {
  state.notice = { kind, text, at: Date.now() };
  renderStatus();
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { state.notice = null; renderStatus(); }, kind === 'error' ? 12000 : 6000);
}

function formatError(error) {
  if (error instanceof FormatError || (error?.code && /^format\./.test(error.code))) return { message: t(error.code), detail: [error.detail, error.message !== error.code ? error.message : ''].filter(Boolean).join('\n') };
  const text = native.errorText(error);
  if (/^[a-z]+\.[a-zA-Z.]+$/.test(text) && t(text) !== text) return { message: t(text), detail: '' };
  return { message: text, detail: error?.stack && !String(error.stack).startsWith(text) ? error.stack : error?.stack?.split('\n').slice(1).join('\n') ?? '' };
}

/** Shows an error in its own popup (details can be copied) and in the status bar. */
function showError(titleKey, error, context = '') {
  const { message, detail } = formatError(error);
  console.error(titleKey, error);
  notify('error', `${t(titleKey)}: ${message}`);
  const info = state.info;
  return popups.open('error', {
    title: t(titleKey), message, detail: detail ?? '', context, time: new Date().toLocaleString(),
    app: info ? `${info.name} ${info.version} (${info.web ? 'web' : `${info.os}/${info.arch}`}, ${info.commit})` : `MyDiagram ${VERSION}`,
  });
}

window.addEventListener('error', (event) => showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''));
window.addEventListener('unhandledrejection', (event) => showError('error.unexpected', event.reason));

// ───────────────────────── documents (tabs)

function untitledName() {
  state.untitled += 1;
  return t('tabs.untitled', { n: state.untitled });
}

function addTab(tab, { view = null } = {}) {
  tab.view.id = view ?? state.settings.defaultView;
  tab.stencils = tab.doc.stencils?.length ? [...tab.doc.stencils] : [...state.settings.openStencils];
  state.docs.push(tab);
  activate(tab.id);
  persistSession();
  return tab;
}

function newDrawing(templateId = 'blank') {
  const s = state.settings;
  let doc;
  if (templateId === 'blank') {
    const name = untitledName();
    doc = D.createDocument({ title: name, language: getLanguage(), design: s.defaultDesign, paper: s.defaultPaper, orientation: s.defaultOrientation });
    doc.units = s.defaultUnits;
    doc.options.connectorRoute = s.defaultRoute;
    doc.stencils = [...s.openStencils];
  } else {
    doc = buildTemplate(templateId, { language: getLanguage() });
    doc.units = s.defaultUnits;
  }
  const tab = addTab(new DiagramDocument(doc, { name: templateId === 'blank' ? doc.title : doc.title, template: templateId !== 'blank' }), { view: 'drawing' });
  if (templateId !== 'blank') tab.markSaved(null);
  notify('success', t(templateId === 'blank' ? 'notice.newDrawing' : 'notice.fromTemplate', { name: doc.title }));
  return tab;
}

function openSampleBuiltin() {
  const doc = buildSample(getLanguage());
  const tab = addTab(new DiagramDocument(doc, { name: doc.title }), { view: 'drawing' });
  tab.markSaved(null);
  return tab;
}

function activate(id) {
  view()?.finishTextEdit?.(true);
  state.active = id;
  state.selection = { ids: [], primary: null };
  state.showStart = false;
  state.reader = null;
  mountView();
  renderAll();
}

function activateDoc(id) {
  if (state.active === id && !state.showStart) return;
  activate(id);
}

const view = () => state.view;

/** Applies a change to the active drawing as one undo step and redraws. mutate(doc, page). */
function change(labelKey, mutate, { right = true, left = false } = {}) {
  const tab = activeTab();
  if (!tab) return undefined;
  const pageId = tab.view.pageId;
  const result = tab.apply(t(labelKey), (doc) => mutate(doc, doc.pages.find((page) => page.id === pageId) ?? doc.pages[0]));
  afterChange({ right, left });
  return result;
}

function afterChange({ right = true, left = false } = {}) {
  pruneSelection();
  updateView();
  renderDocTitle();
  renderStatus();
  renderToolbarState();
  if (right) renderRight();
  if (left) renderLeft();
}

function persistSession() {
  try {
    globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify({ files: state.docs.filter((doc) => doc.path).map((doc) => doc.path) }));
  } catch { /* ignore */ }
}

// ───────────────────────── selection

const selectedIds = () => state.selection.ids;
const hasSelection = () => state.selection.ids.length > 0;
const selectedShapes = () => { const page = currentPage(); return page ? state.selection.ids.map((id) => D.findShape(page, id)).filter(Boolean) : []; };
const selected2D = () => selectedShapes().filter((shape) => !D.isConnector(shape));
const selectedConnectors = () => selectedShapes().filter(D.isConnector);
const isSelected = (id) => state.selection.ids.includes(id);

function select(ids, { primary = null } = {}) {
  const list = [...new Set(ids)].filter(Boolean);
  state.selection = { ids: list, primary: primary && list.includes(primary) ? primary : list[0] ?? null };
  selectionChanged();
}

function selectionChanged() {
  state.view?.selectionChanged?.();
  renderRight();
  renderStatus();
  renderToolbarState();
}

function clearSelection() {
  if (state.selection.ids.length) select([]);
}

function pruneSelection() {
  const page = currentPage();
  if (!page) return;
  state.selection.ids = state.selection.ids.filter((id) => D.findShape(page, id));
  if (!state.selection.ids.includes(state.selection.primary)) state.selection.primary = state.selection.ids[0] ?? null;
}

// ───────────────────────── shapes

/** Where a new shape goes when it is not dropped: the middle of the view. */
function viewCenter() {
  const page = currentPage();
  return state.view?.viewCenter?.() ?? { x: page.width / 2, y: page.height / 2 };
}

/** A shape from a master at a page point (Shapes panel click or drop). */
function dropMaster(masterId, point = null) {
  if (!activeTab()) newDrawing();
  if (state.showStart) showStartPage(false);
  ensureDrawingView();
  if (masterId.startsWith('my:')) return dropMyShape(masterId.slice(3), point);
  const at = point ?? viewCenter();
  const master = masterById(masterId);
  const snapped = snapCenter(at, master);
  const shape = change('op.addShape', (doc, page) => {
    const created = D.createShape(master.id, { cx: snapped.x, cy: snapped.y });
    // A shape dropped onto a container joins it (it is drawn in front of it).
    D.addShape(page, created);
    return created;
  });
  select([shape.id]);
  notify('success', t('notice.shapeAdded', { name: master.name[getLanguage()] }));
  return shape;
}

function snapCenter(p, master) {
  const s = state.settings;
  if (!s.snapToGrid) return p;
  const step = state.view?.gridStep?.() ?? 20;
  const x = Math.round((p.x - master.w / 2) / step) * step + master.w / 2;
  const y = Math.round((p.y - master.h / 2) / step) * step + master.h / 2;
  return { x, y };
}

function addShapeAt(masterId, rect) {
  const shape = change('op.addShape', (doc, page) => D.addShape(page, D.createShape(masterId, { x: rect.x, y: rect.y, w: Math.max(4, rect.w), h: Math.max(4, rect.h) })));
  select([shape.id]);
  return shape;
}

function addFreeform(points, closed) {
  const xs = points.map((p) => p.x); const ys = points.map((p) => p.y);
  const x = Math.min(...xs); const y = Math.min(...ys);
  const w = Math.max(1, Math.max(...xs) - x); const h = Math.max(1, Math.max(...ys) - y);
  const shape = change('op.draw', (doc, page) => {
    const created = D.createShape('freeform', { x, y, w, h });
    created.params = { points: points.map((p) => [Math.round(((p.x - x) / w) * 10000) / 10000, Math.round(((p.y - y) / h) * 10000) / 10000]), closed };
    if (!closed) created.style = { fill: 'none' };
    return D.addShape(page, created);
  });
  select([shape.id]);
}

function connectShapes(from, to, extra = {}) {
  const tab = activeTab();
  const route = extra.route ?? tab.doc.options.connectorRoute ?? state.settings.defaultRoute;
  const connector = change('op.connect', (doc, page) => D.addShape(page, D.createConnector(from, to, { ...extra, route })));
  select([connector.id]);
  return connector;
}

/** AutoConnect: a copy of the shape on that side, joined to it — or the shape already there. */
function autoConnect(id, side) {
  const page = currentPage();
  const shape = D.findShape(page, id);
  if (!shape) return;
  const gap = 60;
  const dir = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }[side];
  const b = shapeBounds(shape);
  const c = center(shape);
  const target = { x: c.x + dir[0] * (b.w + gap), y: c.y + dir[1] * (b.h + gap) };
  const existing = page.shapes.find((other) => other.id !== id && !D.isConnector(other) && !D.isGroup(other) && !other.groupId && Math.abs(center(other).x - target.x) < b.w * 0.6 && Math.abs(center(other).y - target.y) < b.h * 0.6);
  const result = change('op.autoConnect', (doc, pg) => {
    let other = existing;
    if (!other) {
      other = D.createShape(shape.master, { cx: target.x, cy: target.y, w: shape.w, h: shape.h });
      other.style = JSON.parse(JSON.stringify(shape.style ?? {}));
      other.qs = { ...(shape.qs ?? {}) };
      other.params = JSON.parse(JSON.stringify(shape.params ?? {}));
      other.layers = [...(shape.layers ?? [])];
      D.addShape(pg, other);
    }
    D.addShape(pg, D.createConnector({ id, pt: 'auto' }, { id: other.id, pt: 'auto' }, { route: doc.options.connectorRoute ?? 'orthogonal' }));
    return other;
  });
  select([result.id]);
}

function moveSelection(ids, dx, dy) {
  change('op.move', (doc, page) => D.moveShapes(page, ids, dx, dy));
  notify('info', t('notice.moved', { count: state.selection.ids.length, x: D.formatLength(dx, unitsOf()), y: D.formatLength(dy, unitsOf()) }));
}

function duplicateMoved(ids, dx, dy) {
  const added = change('op.duplicate', (doc, page) => D.pasteShapes(page, D.copyShapes(page, ids), { dx, dy }));
  select(added);
}

/** Commits shapes changed during a drag (after = Map(id → shape)). */
function commitShapes(labelKey, after) {
  change(labelKey, (doc, page) => {
    for (const [id, shape] of after) {
      const index = page.shapes.findIndex((s) => s.id === id);
      if (index >= 0) page.shapes[index] = shape;
    }
    D.refreshGroups(page);
  });
}

/** Live (no undo step) box change while dragging: the view restores and commits. */
function setBoxLive(id, box) { D.setBox(currentPage(), id, box); }
function scaleLive(ids, box, origin, sx, sy) {
  const page = currentPage();
  for (const id of ids) {
    const shape = D.findShape(page, id);
    if (!shape) continue;
    if (D.isConnector(shape)) {
      for (const key of ['from', 'to']) if (!shape[key].id) { shape[key].x = origin.x + (shape[key].x - box.x) * sx; shape[key].y = origin.y + (shape[key].y - box.y) * sy; }
      shape.waypoints = (shape.waypoints ?? []).map((p) => ({ x: origin.x + (p.x - box.x) * sx, y: origin.y + (p.y - box.y) * sy }));
      continue;
    }
    D.setBox(page, id, { x: origin.x + (shape.x - box.x) * sx, y: origin.y + (shape.y - box.y) * sy, w: shape.w * sx, h: shape.h * sy });
  }
}
function rotateLive(ids, deg, pivot) { D.rotateShapes(currentPage(), ids, deg, pivot); }

function setShapeText(id, text) {
  change('op.text', (doc, page) => D.setText(page, id, text));
}

function editShapeField(row, field, value) {
  try {
    const tab = activeTab();
    const pageId = row.info?.pageId ?? tab.view.pageId;
    tab.apply(t(`field.${field.id.startsWith('data:') ? 'data' : field.id}`), (doc) => {
      const page = doc.pages.find((p) => p.id === pageId);
      const shape = D.findShape(page, row.id);
      if (shape) field.set({ ...fieldCtx(), doc, page }, shape, value);
    });
    afterChange();
  } catch (error) {
    showError('error.input', error, field.label ?? t(`field.${field.id}`));
  }
}

function setStyle(patch, ids = selectedIds()) {
  if (!ids.length) return;
  change('op.format', (doc, page) => D.setStyle(page, ids, patch));
}

function deleteSelection() {
  const tab = activeTab();
  if (!tab) return;
  if (state.guide) {
    const id = state.guide;
    state.guide = null;
    change('op.guide', (doc, page) => { page.guides = page.guides.filter((g) => g.id !== id); });
    return;
  }
  const ids = selectedIds().filter((id) => !D.findShape(currentPage(), id)?.locked?.delete);
  if (!ids.length) return;
  const count = change('op.delete', (doc, page) => D.deleteShapes(page, ids));
  select([]);
  notify('success', t('notice.deleted', { count }));
}

function unitsOf() { return activeTab()?.doc.units ?? state.settings.defaultUnits; }

// ───────────────────────── clipboard

async function copySelection({ cut = false } = {}) {
  const page = currentPage();
  const ids = selectedIds();
  if (!page || !ids.length) return;
  const clip = D.copyShapes(page, ids);
  const text = clip.shapes.map((shape) => shape.text).filter(Boolean).join('\n') || `[${t('clip.shapes', { count: clip.shapes.length })}]`;
  state.clipboard = { clip, text };
  try { await native.clipboardWrite(text); } catch (error) { console.warn('clipboard', error); }
  if (cut) { change('op.cut', (doc, pg) => D.deleteShapes(pg, ids)); select([]); }
  notify('success', t(cut ? 'notice.cut' : 'notice.copied', { count: ids.length }));
}

async function pasteClipboard({ at = null } = {}) {
  if (!activeTab()) newDrawing();
  ensureDrawingView();
  let text = '';
  try { text = await native.clipboardRead(); } catch { text = state.clipboard?.text ?? ''; }
  const own = state.clipboard && (state.clipboard.text === text || !text);
  if (own) {
    const ids = change('op.paste', (doc, page) => D.pasteShapes(page, state.clipboard.clip, at ? { at } : { dx: 20, dy: 20 }));
    // The next paste lands a little further.
    state.clipboard.clip = { ...state.clipboard.clip, shapes: state.clipboard.clip.shapes.map((shape) => shiftCopy(shape, 20)), bounds: state.clipboard.clip.bounds ? { ...state.clipboard.clip.bounds, x: state.clipboard.clip.bounds.x + 20, y: state.clipboard.clip.bounds.y + 20 } : null };
    select(ids);
    return notify('success', t('notice.pasted', { count: ids.length }));
  }
  if (!text.trim()) return notify('info', t('notice.clipboardEmpty'));
  const ids = change('op.paste', (doc, page) => shapesFromText(page, text, { at: at ?? viewCenter(), list: false }));
  select(ids);
  return notify('success', t('notice.pastedText'));
}

function shiftCopy(shape, d) {
  const copy = JSON.parse(JSON.stringify(shape));
  if (D.isConnector(copy)) {
    for (const key of ['from', 'to']) if (!copy[key].id) { copy[key].x += d; copy[key].y += d; }
    copy.waypoints = (copy.waypoints ?? []).map((p) => ({ x: p.x + d, y: p.y + d }));
  } else { copy.x += d; copy.y += d; }
  return copy;
}

function duplicate() {
  const ids = selectedIds();
  if (!ids.length) return;
  const added = change('op.duplicate', (doc, page) => D.pasteShapes(page, D.copyShapes(page, ids), { dx: 20, dy: 20 }));
  select(added);
}

// ───────────────────────── format painter

function startFormatPainter() {
  const shape = selectedShapes()[0];
  if (!shape) return notify('info', t('notice.selectFirst'));
  state.painter = { style: JSON.parse(JSON.stringify(shape.style ?? {})), qs: { ...(shape.qs ?? {}) }, connector: D.isConnector(shape) };
  notify('info', t('notice.painter'));
  renderToolbarState();
  root.classList.add('painting');
  return undefined;
}

function paintFormat(id) {
  const painter = state.painter;
  state.painter = null;
  root.classList.remove('painting');
  if (!painter) return;
  change('op.paintFormat', (doc, page) => {
    for (const target of D.withMembers(page, [id])) {
      const shape = D.findShape(page, target);
      if (!shape || D.isGroup(shape)) continue;
      shape.style = JSON.parse(JSON.stringify(painter.style));
      if (!D.isConnector(shape)) shape.qs = { ...painter.qs };
    }
  });
  select([id]);
  renderToolbarState();
}

// ───────────────────────── arrange

function align(how) { const n = change('op.align', (doc, page) => D.alignShapes(page, selectedIds(), how)); if (!n) notify('info', t('notice.selectTwo')); }
function distribute(axis) { const n = change('op.distribute', (doc, page) => D.distributeShapes(page, selectedIds(), axis)); if (!n) notify('info', t('notice.selectThree')); }
function reorder(how) { change('op.order', (doc, page) => D.reorder(page, selectedIds(), how)); }
function rotateBy(deg) { change('op.rotate', (doc, page) => D.rotateShapes(page, selectedIds(), deg)); }
function flip(axis) { change('op.flip', (doc, page) => D.flipShapes(page, selectedIds(), axis)); }

function groupSelection() {
  const group = change('op.group', (doc, page) => D.groupShapes(page, selectedIds()));
  if (group) { select([group.id]); notify('success', t('notice.grouped')); } else notify('info', t('notice.selectTwo'));
}

function ungroupSelection() {
  const ids = change('op.ungroup', (doc, page) => D.ungroupShapes(page, selectedIds()));
  if (ids?.length) select(ids);
}

function sameSize(which) { change('op.size', (doc, page) => D.sameSize(page, selectedIds(), which)); }

// ───────────────────────── connectors

function setRoute(route) {
  const ids = selectedConnectors().map((c) => c.id);
  if (!ids.length) {
    change('op.route', (doc) => { doc.options.connectorRoute = route; });
    return notify('info', t('notice.defaultRoute', { name: t(`route.${route}`) }));
  }
  change('op.route', (doc, page) => ids.forEach((id) => { const c = D.findShape(page, id); c.route = route; c.waypoints = []; }));
  return undefined;
}

function reverseConnectors() {
  change('op.reverse', (doc, page) => selectedConnectors().forEach((c) => {
    const shape = D.findShape(page, c.id);
    [shape.from, shape.to] = [shape.to, shape.from];
    shape.waypoints = [...(shape.waypoints ?? [])].reverse();
    const st = shape.style ?? {};
    if (st.startArrow !== undefined || st.endArrow !== undefined) [st.startArrow, st.endArrow] = [st.endArrow, st.startArrow];
  }));
}

function clearBends() { change('op.bend', (doc, page) => selectedConnectors().forEach((c) => { D.findShape(page, c.id).waypoints = []; })); }
function removeBend(id, index) { change('op.bend', (doc, page) => { const c = D.findShape(page, id); if (c) c.waypoints = c.waypoints.filter((_, i) => i !== index); }); }

// ───────────────────────── pages

function goToPage(pageId, { keepView = false } = {}) {
  const tab = activeTab();
  if (!tab || !tab.doc.pages.some((page) => page.id === pageId)) return;
  if (tab.view.pageId === pageId) return;
  state.view?.finishTextEdit?.();
  tab.view.pageId = pageId;
  tab.view.zoom = tab.view.pageZoom?.[pageId] ?? tab.view.zoom;
  state.selection = { ids: [], primary: null };
  state.guide = null;
  if (!keepView) ensureDrawingView();
  if (state.view?.render) state.view.render();
  renderRight();
  renderStatus();
  renderToolbarState();
}

function pageStep(direction) {
  const tab = activeTab();
  const pages = tab.doc.pages;
  const index = pages.findIndex((page) => page.id === tab.view.pageId);
  const next = pages[(index + direction + pages.length) % pages.length];
  if (next) goToPage(next.id, { keepView: true });
}

function addPage({ background = false } = {}) {
  const tab = activeTab();
  const index = background ? tab.doc.pages.length : tab.doc.pages.findIndex((page) => page.id === tab.view.pageId) + 1;
  const page = change('op.addPage', (doc) => D.addPage(doc, { name: background ? t('page.defaultBackground') : t('page.defaultName'), background }, Math.max(0, index)));
  goToPage(page.id, { keepView: true });
  state.view?.fitPage?.();
  notify('success', t('notice.pageAdded', { name: page.name }));
}

function duplicatePage() {
  const page = change('op.duplicatePage', (doc) => D.duplicatePage(doc, activeTab().view.pageId));
  if (page) goToPage(page.id, { keepView: true });
}

async function deletePage(pageId = activeTab()?.view.pageId) {
  const tab = activeTab();
  if (!tab || tab.doc.pages.length < 2) return notify('info', t('notice.lastPage'));
  const page = D.pageById(tab.doc, pageId);
  if (page.shapes.length && !(await confirmDelete([page.name], 'page'))) return undefined;
  const index = tab.doc.pages.indexOf(page);
  change('op.deletePage', (doc) => D.deletePage(doc, pageId));
  const next = tab.doc.pages[Math.min(index, tab.doc.pages.length - 1)];
  tab.view.pageId = null;
  goToPage(next.id, { keepView: true });
  return notify('success', t('notice.pageDeleted', { name: page.name }));
}

function renamePage(pageId, name) {
  change('op.renamePage', (doc) => { const page = D.pageById(doc, pageId); if (page) page.name = D.uniquePageName({ pages: doc.pages.filter((p) => p.id !== pageId) }, name); });
  state.view?.renderTabs?.();
}

async function promptRenamePage(pageId = activeTab()?.view.pageId) {
  const page = D.pageById(activeTab().doc, pageId);
  const result = await popups.open('prompt', { title: t('action.pageRename'), icon: 'pageRename', label: t('page.name'), value: page.name });
  if (result?.value?.trim()) renamePage(pageId, result.value.trim());
}

function movePageTo(pageId, index) {
  change('op.movePage', (doc) => D.movePage(doc, pageId, index));
  state.view?.renderTabs?.();
}

function setBackgroundPage(backgroundId) {
  change('op.pageSetup', (doc, page) => { page.backgroundId = backgroundId; });
}

/** Visio "Borders & Titles": a background page with a frame and a title block, used by every page without one. */
function insertTitleBlock() {
  const tab = activeTab();
  const result = change('op.titleBlock', (doc) => {
    const ref = tab.page;
    let bg = doc.pages.find((page) => page.background && page.shapes.some((s) => s.name === 'title-block'));
    if (!bg) {
      bg = D.addPage(doc, { name: t('page.defaultBackground'), background: true, width: ref.width, height: ref.height }, doc.pages.length);
      D.addShape(bg, D.createShape('rect', { x: 18, y: 18, w: ref.width - 36, h: ref.height - 36, style: { fill: 'none', line: '#64748b', lineWidth: 1.5 }, name: 'border' }));
      D.addShape(bg, D.createShape('rect', { x: ref.width - 378, y: ref.height - 96, w: 360, h: 78, text: '{title}\n{pageName} · {page}/{pages} · {date}', style: { fill: '#f8fafc', line: '#64748b', fontSize: 12, textColor: '#1f2937' }, name: 'title-block' }));
    }
    for (const page of doc.pages) if (!page.background && !page.backgroundId) page.backgroundId = bg.id;
    return bg;
  });
  notify('success', t('notice.titleBlock', { name: result.name }));
}

// ───────────────────────── guides

function addGuide(orient, pos) { change('op.guide', (doc, page) => D.addGuide(page, orient, Math.round(pos * 10) / 10)); }
function setGuide(id, pos) {
  change('op.guide', (doc, page) => {
    if (pos == null) page.guides = page.guides.filter((g) => g.id !== id);
    else { const g = page.guides.find((x) => x.id === id); if (g) g.pos = Math.round(pos * 10) / 10; }
  });
}

// ───────────────────────── layers, data, links, comments

function assignLayer(layerId, mode = 'only') {
  change('op.layer', (doc, page) => D.assignLayer(page, selectedIds(), layerId, mode));
}

function addDataField() {
  const ids = selectedIds();
  if (!ids.length) return notify('info', t('notice.selectFirst'));
  return openShapeData();
}

function followHyperlink(shape) {
  const link = String(shape?.hyperlink ?? '').trim();
  if (!link) return;
  if (link.startsWith('page:')) {
    const target = link.slice(5);
    const page = activeTab().doc.pages.find((p) => p.id === target || p.name === target);
    if (page) { goToPage(page.id); notify('info', t('notice.jumped', { name: page.name })); } else notify('error', t('notice.noPage', { name: target }));
    return;
  }
  native.openExternal(link).catch((error) => showError('error.link', error, link));
}

function addComment(text, id = selectedIds()[0] ?? null) {
  if (!String(text).trim()) return;
  const author = activeTab().doc.author || t('comment.me');
  change('op.comment', (doc, page) => {
    const comment = { id: D.newId('cmt'), author, text: String(text).trim(), at: new Date().toISOString(), done: false };
    const target = id ? D.findShape(page, id) : page;
    target.comments = [...(target.comments ?? []), comment];
  });
}

function showComments() {
  if (!state.settings.showRightPanel) updateSettings({ showRightPanel: true });
  state.rightSections.add('comments');
  renderRight();
  root.querySelector('#right-panel [data-comment-input]')?.focus();
}

// ───────────────────────── my shapes

function storeMyShapes() {
  try { globalThis.localStorage?.setItem(MY_SHAPES_KEY, JSON.stringify(state.myShapes)); } catch (error) { showError('error.myShapes', error); }
}

async function saveToMyShapes() {
  const page = currentPage();
  const ids = selectedIds();
  if (!ids.length) return notify('info', t('notice.selectFirst'));
  const first = D.findShape(page, ids[0]);
  const result = await popups.open('prompt', { title: t('action.saveShape'), icon: 'saveShape', label: t('myShapes.name'), value: first?.name || String(first?.text ?? '').split('\n')[0] || t('myShapes.defaultName') });
  if (!result?.value?.trim()) return undefined;
  const clip = D.copyShapes(page, ids);
  const doc = activeTab().doc;
  const { svg } = renderPageSvg(doc, page, { area: 'selection', ids: clip.shapes.map((s) => s.id), measure, padding: 4, transparent: true });
  state.myShapes = [...state.myShapes, { id: D.newId('my'), name: result.value.trim(), clip, svg, design: doc.design }];
  storeMyShapes();
  if (!activeTab().stencils.includes('my')) activeTab().stencils.push('my');
  renderLeft();
  return notify('success', t('notice.myShapeSaved', { name: result.value.trim() }));
}

function dropMyShape(id, point) {
  const item = state.myShapes.find((x) => x.id === id);
  if (!item) return null;
  const ids = change('op.addShape', (doc, page) => D.pasteShapes(page, item.clip, { at: point ?? viewCenter() }));
  select(ids);
  return ids;
}

// ───────────────────────── views

function ensureDrawingView() {
  const tab = activeTab();
  if (tab && tab.view.id !== 'drawing') switchView('drawing');
}

function switchView(id) {
  const tab = activeTab();
  if (!tab || !VIEWS.includes(id)) return;
  state.view?.finishTextEdit?.();
  state.showStart = false;
  state.reader = null;
  tab.view.id = id;
  mountView();
  renderAll();
  notify('info', t('notice.view', { name: t(`view.${id}`) }));
}

function mountView() {
  state.view?.destroy?.();
  state.view = null;
  const old = root.querySelector('#view-host');
  if (!old) return;
  // A new host element for every view: the views listen on their host (clicks, context menu, drops),
  // and listeners left on a shared host kept acting after a switch (a click on a page tab of the
  // drawing ran the Pages view's handler, which drew the page cards over the canvas).
  const host = old.cloneNode(false);
  old.replaceWith(host);
  host.className = 'view-host';
  const tab = activeTab();
  if (!tab || state.showStart) return;
  const id = tab.view.id;
  state.viewId = id;
  const make = {
    drawing: () => new CanvasView(appApi, host),
    pages: () => new PagesView(appApi, host),
    shapeSheet: () => new ShapeSheetView(appApi, host),
    shapeData: () => new ShapeDataView(appApi, host),
    reports: () => new ReportsView(appApi, host),
  }[id] ?? (() => new CanvasView(appApi, host));
  state.view = make();
}

function updateView() {
  try {
    state.view?.update?.();
  } catch (error) {
    showError('error.view', error, state.viewId ?? '');
  }
}

function renderView() {
  const host = root.querySelector('#view-host');
  const start = root.querySelector('#start-page');
  const reader = root.querySelector('#reader-page');
  const reading = Boolean(state.reader);
  const showStart = !reading && (state.showStart || !activeTab());
  root.classList.toggle('on-start', showStart || reading);
  root.classList.toggle('on-reader', reading);
  start.hidden = !showStart;
  reader.hidden = !reading;
  host.hidden = showStart || reading;
  if (reading) { renderReader(); return; }
  if (showStart) { renderStartPage(); return; }
  try {
    state.view?.render?.();
  } catch (error) {
    showError('error.view', error, state.viewId ?? '');
  }
}

function columnWidths(key) {
  state.columnWidths[key] ??= {};
  return state.columnWidths[key];
}

function saveColumnWidths() {
  try { globalThis.localStorage?.setItem('mydiagram.columns.v1', JSON.stringify(state.columnWidths)); } catch { /* ignore */ }
}

const rowHeight = () => Math.round(state.settings.rowHeight * (state.settings.zoom / 100));

function fieldCtx() {
  const tab = activeTab();
  return { doc: tab?.doc, page: tab?.page, units: unitsOf(), language: getLanguage(), t };
}

// ───────────────────────── zoom

function zoomPercent() { return Math.round(activeTab()?.view.zoom ?? 100); }

function setCanvasZoom(percent) {
  const tab = activeTab();
  if (!tab) return;
  ensureDrawingView();
  const value = Math.max(CANVAS_ZOOM.min, Math.min(CANVAS_ZOOM.max, Math.round(percent)));
  if (state.view?.zoomTo) state.view.zoomTo(value);
  else { tab.view.zoom = value; zoomChanged(); }
}

function zoomChanged() {
  const tab = activeTab();
  if (tab) { tab.view.pageZoom = { ...(tab.view.pageZoom ?? {}), [tab.view.pageId]: tab.view.zoom }; }
  renderToolbarState();
  renderStatus();
}

function setUiZoom(value) {
  const zoom = Math.max(ZOOM.min, Math.min(ZOOM.max, Math.round(value / ZOOM.step) * ZOOM.step));
  if (zoom === state.settings.zoom) return;
  updateSettings({ zoom });
}

// ───────────────────────── tools

const TOOLS = ['pointer', 'pan', 'connector', 'text', 'rect', 'ellipse', 'line', 'pencil', 'polyline'];

function setTool(tool) {
  if (!TOOLS.includes(tool)) return;
  if (!activeTab()) newDrawing();
  ensureDrawingView();
  state.view?.cancelTool?.();
  state.tool = tool;
  root.dataset.tool = tool;
  renderToolbarState();
  renderLeft();
  renderStatus();
  if (tool !== 'pointer') notify('info', t('notice.tool', { name: t(`tool.${tool}`) }));
}

// ───────────────────────── commands

const hasDoc = () => Boolean(activeTab());
const drawing = () => hasDoc() && !state.showStart && !state.reader && activeTab().view.id === 'drawing';
const has2D = () => selected2D().length > 0;
const hasConnector = () => selectedConnectors().length > 0;
const multi = () => selectedIds().length > 1;
const toggle = (key) => updateSettings({ [key]: !state.settings[key] });
const docOption = (key) => change('op.options', (doc) => { doc.options[key] = !doc.options[key]; });

const VIEW_ICONS = { drawing: 'viewDrawing', pages: 'viewPages', shapeSheet: 'viewShapeSheet', shapeData: 'viewShapeData', reports: 'viewReports' };
const TOOL_ICONS = { pointer: 'pointer', pan: 'hand', connector: 'connectorTool', text: 'textTool', rect: 'rectTool', ellipse: 'ellipseTool', line: 'lineTool', pencil: 'pencil', polyline: 'polyline' };
const TOOL_KEYS = { pointer: 'Ctrl+1', connector: 'Ctrl+3', text: 'Ctrl+2', rect: 'Ctrl+8', ellipse: 'Ctrl+9', line: 'Ctrl+6', pencil: 'Ctrl+4', polyline: 'Ctrl+5', pan: 'Ctrl+Shift+Space' };

const commands = {
  // file
  new: { icon: 'fileNew', label: 'action.new', key: 'Ctrl+N', run: () => newDrawing() },
  open: { icon: 'folderOpen', label: 'action.open', key: 'Ctrl+O', run: () => openWithDialog() },
  startPage: { icon: 'home', label: 'action.startPage', key: 'Ctrl+Shift+H', checked: () => state.showStart || !hasDoc(), run: () => showStartPage(!state.showStart || !hasDoc()) },
  save: { icon: 'save', label: 'action.save', key: 'Ctrl+S', enabled: hasDoc, run: () => saveDoc(activeTab()) },
  saveAs: { icon: 'saveAs', label: 'action.saveAs', key: 'Ctrl+Shift+S', enabled: hasDoc, run: () => saveDoc(activeTab(), { saveAs: true }) },
  saveAll: { icon: 'saveAll', label: 'action.saveAll', key: 'Ctrl+Alt+S', enabled: () => state.docs.some((doc) => doc.dirty), run: () => saveAll() },
  saveTemplate: { icon: 'template', label: 'action.saveTemplate', enabled: hasDoc, run: () => exportAs('mdgt') },
  dbSave: { icon: 'dbSave', label: 'action.dbSave', enabled: () => desktop && hasDoc(), run: () => saveToDatabase(activeTab()) },
  dbOpen: { icon: 'dbOpen', label: 'action.dbOpen', enabled: () => desktop, run: () => openFromDatabase() },
  importVisio: { icon: 'importFile', label: 'action.importVisio', run: () => openWithDialog() },
  exportVsdx: { icon: 'vsdxFile', label: 'action.exportVsdx', enabled: hasDoc, run: () => exportAs('vsdx') },
  exportSvg: { icon: 'svgFile', label: 'action.exportSvg', enabled: hasDoc, run: () => exportAs('svg') },
  exportPdf: { icon: 'pdfFile', label: 'action.exportPdf', enabled: hasDoc, run: () => exportPdf() },
  exportHtml: { icon: 'htmlFile', label: 'action.exportHtml', enabled: hasDoc, run: () => exportAs('html') },
  exportImage: { icon: 'exportImage', label: 'action.exportImage', enabled: hasDoc, run: () => exportImage() },
  recent: { icon: 'recent', label: 'action.recent', key: 'Ctrl+R', run: () => popups.open('recent', {}) },
  recentFolders: { icon: 'recentFolder', label: 'action.recentFolders', run: (context) => recentFoldersMenu(context?.anchor) },
  clearRecent: { icon: 'clearHistory', label: 'action.clearRecent', enabled: () => state.recent.length > 0 || state.recentDirs.length > 0, run: () => clearRecentAll() },
  print: { icon: 'print', label: 'action.print', key: 'Ctrl+P', enabled: hasDoc, run: () => openPrint() },
  docProps: { icon: 'docProps', label: 'action.docProps', enabled: hasDoc, run: () => openDocumentProps() },
  closeTab: { icon: 'closeTab', label: 'action.closeTab', key: 'Ctrl+W', enabled: hasDoc, run: () => closeDoc(activeTab()) },
  closeAll: { icon: 'closeAll', label: 'action.closeAll', enabled: () => state.docs.length > 0, run: () => closeAll() },
  exit: { icon: 'exit', label: 'action.exit', key: isMac ? 'Ctrl+Q' : 'Alt+F4', run: () => requestExit() },
  // edit
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: () => Boolean(activeTab()?.history.canUndo), run: () => undo() },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: () => Boolean(activeTab()?.history.canRedo), run: () => redo() },
  cut: { icon: 'cut', label: 'action.cut', key: 'Ctrl+X', enabled: hasSelection, run: () => copySelection({ cut: true }) },
  copy: { icon: 'copy', label: 'action.copy', key: 'Ctrl+C', enabled: hasSelection, run: () => copySelection() },
  paste: { icon: 'paste', label: 'action.paste', key: 'Ctrl+V', run: (context) => pasteClipboard({ at: context?.point ?? null }) },
  duplicate: { icon: 'duplicate', label: 'action.duplicate', key: 'Ctrl+D', enabled: hasSelection, run: () => duplicate() },
  delete: { icon: 'trash', label: 'action.delete', key: 'Delete', enabled: () => hasSelection() || Boolean(state.guide), run: () => deleteSelection() },
  selectAll: { icon: 'selectAll', label: 'action.selectAll', key: 'Ctrl+A', enabled: hasDoc, run: () => selectWhere(() => true) },
  selectShapes: { icon: 'selectShapes', label: 'action.selectShapes', enabled: hasDoc, run: () => selectWhere((s) => !D.isConnector(s)) },
  selectConnectors: { icon: 'selectConnectors', label: 'action.selectConnectors', enabled: hasDoc, run: () => selectWhere(D.isConnector) },
  selectSameMaster: { icon: 'stencilMore', label: 'action.selectSameMaster', enabled: has2D, run: () => { const m = selected2D()[0].master; selectWhere((s) => s.master === m); } },
  clearSelection: { icon: 'deselect', label: 'action.clearSelection', key: 'Esc', enabled: hasSelection, run: () => clearSelection() },
  find: { icon: 'search', label: 'action.find', key: 'Ctrl+F', enabled: hasDoc, run: () => openFind('find') },
  replace: { icon: 'replace', label: 'action.replace', key: 'Ctrl+H', enabled: hasDoc, run: () => openFind('replace') },
  goToPage: { icon: 'goTo', label: 'action.goToPage', key: 'Ctrl+G', enabled: hasDoc, run: (context) => pagesMenu(context?.anchor) },
  formatPainter: { icon: 'formatPainter', label: 'action.formatPainter', key: 'Ctrl+Shift+C', enabled: () => hasSelection() || Boolean(state.painter), checked: () => Boolean(state.painter), run: () => (state.painter ? (state.painter = null, root.classList.remove('painting'), renderToolbarState()) : startFormatPainter()) },
  // tools
  ...Object.fromEntries(TOOLS.map((tool) => [`tool:${tool}`, { icon: TOOL_ICONS[tool], label: `tool.${tool}`, key: TOOL_KEYS[tool], checked: () => state.tool === tool, run: () => setTool(tool) }])),
  // insert
  insertText: { icon: 'textBox', label: 'action.insertText', run: () => { const shape = dropMaster('textBox'); setTimeout(() => state.view?.startTextEdit?.(shape.id), 40); } },
  insertPicture: { icon: 'picture', label: 'action.insertPicture', run: () => insertPicture() },
  insertContainer: { icon: 'container', label: 'action.insertContainer', run: () => insertContainer() },
  insertCallout: { icon: 'callout', label: 'action.insertCallout', run: () => insertCallout() },
  insertHyperlink: { icon: 'hyperlink', label: 'action.insertHyperlink', key: 'Ctrl+K', enabled: hasSelection, run: () => openHyperlink() },
  insertComment: { icon: 'comment', label: 'action.insertComment', enabled: hasDoc, run: () => showComments() },
  insertField: { icon: 'field', label: 'action.insertField', enabled: hasDoc, run: (context) => fieldsMenu(context?.anchor) },
  insertTitleBlock: { icon: 'titleBlock', label: 'action.insertTitleBlock', enabled: hasDoc, run: () => insertTitleBlock() },
  saveShape: { icon: 'saveShape', label: 'action.saveShape', enabled: hasSelection, run: () => saveToMyShapes() },
  myShapes: { icon: 'myShapes', label: 'action.myShapes', run: () => openMyShapes() },
  // format
  formatShape: { icon: 'formatShape', label: 'action.formatShape', enabled: hasSelection, run: (context) => openFormat(context?.tab) },
  fillColor: { icon: 'fillColor', label: 'action.fillColor', enabled: has2D, run: (context) => pickColor('fill', context?.anchor) },
  lineColor: { icon: 'lineColor', label: 'action.lineColor', enabled: hasSelection, run: (context) => pickColor('line', context?.anchor) },
  textColor: { icon: 'textColor', label: 'action.textColor', enabled: hasSelection, run: (context) => pickColor('textColor', context?.anchor) },
  lineWeight: { icon: 'lineWeight', label: 'action.lineWeight', enabled: hasSelection, run: (context) => lineWeightMenu(context?.anchor) },
  linePattern: { icon: 'linePattern', label: 'action.linePattern', enabled: hasSelection, run: (context) => dashMenu(context?.anchor) },
  arrowStart: { icon: 'arrowStart', label: 'action.arrowStart', enabled: hasConnector, run: (context) => arrowMenu('startArrow', context?.anchor) },
  arrowEnd: { icon: 'arrowEnd', label: 'action.arrowEnd', enabled: hasConnector, run: (context) => arrowMenu('endArrow', context?.anchor) },
  bold: { icon: 'bold', label: 'action.bold', key: 'Ctrl+B', enabled: hasSelection, checked: () => styleAll('bold'), run: () => setStyle({ bold: !styleAll('bold') }) },
  italic: { icon: 'italic', label: 'action.italic', key: 'Ctrl+I', enabled: hasSelection, checked: () => styleAll('italic'), run: () => setStyle({ italic: !styleAll('italic') }) },
  underline: { icon: 'underline', label: 'action.underline', key: 'Ctrl+U', enabled: hasSelection, checked: () => styleAll('underline'), run: () => setStyle({ underline: !styleAll('underline') }) },
  strike: { icon: 'strike', label: 'action.strike', enabled: hasSelection, checked: () => styleAll('strike'), run: () => setStyle({ strike: !styleAll('strike') }) },
  textAlignLeft: { icon: 'textAlignLeft', label: 'action.textAlignLeft', enabled: hasSelection, checked: () => styleIs('align', 'left'), run: () => setStyle({ align: 'left' }) },
  textAlignCenter: { icon: 'textAlignCenter', label: 'action.textAlignCenter', enabled: hasSelection, checked: () => styleIs('align', 'center'), run: () => setStyle({ align: 'center' }) },
  textAlignRight: { icon: 'textAlignRight', label: 'action.textAlignRight', enabled: hasSelection, checked: () => styleIs('align', 'right'), run: () => setStyle({ align: 'right' }) },
  valignTop: { icon: 'valignTop', label: 'action.valignTop', enabled: has2D, checked: () => styleIs('valign', 'top'), run: () => setStyle({ valign: 'top' }) },
  valignMiddle: { icon: 'valignMiddle', label: 'action.valignMiddle', enabled: has2D, checked: () => styleIs('valign', 'middle'), run: () => setStyle({ valign: 'middle' }) },
  valignBottom: { icon: 'valignBottom', label: 'action.valignBottom', enabled: has2D, checked: () => styleIs('valign', 'bottom'), run: () => setStyle({ valign: 'bottom' }) },
  fontUp: { icon: 'fontUp', label: 'action.fontUp', key: 'Ctrl+Shift+>', enabled: hasSelection, run: () => stepFont(1) },
  fontDown: { icon: 'fontDown', label: 'action.fontDown', key: 'Ctrl+Shift+<', enabled: hasSelection, run: () => stepFont(-1) },
  shadow: { icon: 'shadow', label: 'action.shadow', enabled: has2D, checked: () => styleAll('shadow'), run: () => setStyle({ shadow: !styleAll('shadow') }) },
  quickStyle: { icon: 'quickStyle', label: 'action.quickStyle', enabled: has2D, run: () => openDesign('quick') },
  clearFormat: { icon: 'clearFormat', label: 'action.clearFormat', enabled: hasSelection, run: () => change('op.clearFormat', (doc, page) => D.clearStyle(page, selectedIds())) },
  routeOrtho: { icon: 'routeOrtho', label: 'action.routeOrtho', checked: () => routeIs('orthogonal'), run: () => setRoute('orthogonal') },
  routeStraight: { icon: 'routeStraight', label: 'action.routeStraight', checked: () => routeIs('straight'), run: () => setRoute('straight') },
  routeCurved: { icon: 'routeCurved', label: 'action.routeCurved', checked: () => routeIs('curved'), run: () => setRoute('curved') },
  reverse: { icon: 'reverse', label: 'action.reverse', enabled: hasConnector, run: () => reverseConnectors() },
  clearBends: { icon: 'clearBends', label: 'action.clearBends', enabled: () => selectedConnectors().some((c) => c.waypoints?.length), run: () => clearBends() },
  // arrange
  bringFront: { icon: 'bringFront', label: 'action.bringFront', key: 'Ctrl+Shift+F', enabled: hasSelection, run: () => reorder('front') },
  sendBack: { icon: 'sendBack', label: 'action.sendBack', key: 'Ctrl+Shift+K', enabled: hasSelection, run: () => reorder('back') },
  bringForward: { icon: 'bringForward', label: 'action.bringForward', enabled: hasSelection, run: () => reorder('forward') },
  sendBackward: { icon: 'sendBackward', label: 'action.sendBackward', enabled: hasSelection, run: () => reorder('backward') },
  alignMenu: { icon: 'alignMenu', label: 'action.alignMenu', enabled: multi, run: (context) => showMenu(menuItems(SUBMENUS.align.items), context?.anchor ?? anchorFor('alignMenu'), 'context', { header: { icon: 'alignCenter', title: t('submenu.align') } }) },
  alignLeft: { icon: 'alignLeft', label: 'action.alignLeft', enabled: multi, run: () => align('left') },
  alignCenter: { icon: 'alignCenter', label: 'action.alignCenter', enabled: multi, run: () => align('center') },
  alignRight: { icon: 'alignRight', label: 'action.alignRight', enabled: multi, run: () => align('right') },
  alignTop: { icon: 'alignTop', label: 'action.alignTop', enabled: multi, run: () => align('top') },
  alignMiddle: { icon: 'alignMiddle', label: 'action.alignMiddle', enabled: multi, run: () => align('middle') },
  alignBottom: { icon: 'alignBottom', label: 'action.alignBottom', enabled: multi, run: () => align('bottom') },
  distributeH: { icon: 'distributeH', label: 'action.distributeH', enabled: () => selectedIds().length > 2, run: () => distribute('h') },
  distributeV: { icon: 'distributeV', label: 'action.distributeV', enabled: () => selectedIds().length > 2, run: () => distribute('v') },
  sameSize: { icon: 'sameSize', label: 'action.sameSize', enabled: multi, run: () => sameSize('both') },
  group: { icon: 'groupShapes', label: 'action.group', key: 'Ctrl+Shift+G', enabled: multi, run: () => groupSelection() },
  ungroup: { icon: 'ungroup', label: 'action.ungroup', key: 'Ctrl+Shift+U', enabled: () => selectedShapes().some(D.isGroup), run: () => ungroupSelection() },
  rotateRight: { icon: 'rotateRight', label: 'action.rotateRight', key: 'Ctrl+R', enabled: hasSelection, run: () => rotateBy(90) },
  rotateLeft: { icon: 'rotateLeft', label: 'action.rotateLeft', key: 'Ctrl+L', enabled: hasSelection, run: () => rotateBy(-90) },
  flipH: { icon: 'flipH', label: 'action.flipH', key: 'Ctrl+J', enabled: hasSelection, run: () => flip('h') },
  flipV: { icon: 'flipV', label: 'action.flipV', key: 'Ctrl+M', enabled: hasSelection, run: () => flip('v') },
  position: { icon: 'position', label: 'action.position', enabled: has2D, run: () => openFormat('size') },
  layout: { icon: 'layout', label: 'action.layout', enabled: hasDoc, run: () => openLayout() },
  autoAlign: { icon: 'autoAlign', label: 'action.autoAlign', enabled: hasDoc, run: () => autoAlign() },
  protect: { icon: 'lock', label: 'action.protect', enabled: has2D, run: () => openFormat('protect') },
  // design
  design: { icon: 'design', label: 'action.design', enabled: hasDoc, run: () => openDesign('themes') },
  variantNext: { icon: 'variant', label: 'action.variantNext', enabled: hasDoc, run: () => change('op.design', (doc) => { doc.variant = (doc.variant + 1) % 4; }) },
  lineJumps: { icon: 'lineJumps', label: 'action.lineJumps', enabled: hasDoc, checked: () => activeTab()?.doc.options.lineJumps !== false, run: () => docOption('lineJumps') },
  avoidShapes: { icon: 'avoidShapes', label: 'action.avoidShapes', enabled: hasDoc, checked: () => activeTab()?.doc.options.avoidShapes !== false, run: () => docOption('avoidShapes') },
  glue: { icon: 'glue', label: 'action.glue', enabled: hasDoc, checked: () => activeTab()?.doc.options.glue !== false, run: () => docOption('glue') },
  // view
  ...Object.fromEntries(VIEWS.map((id) => [`view:${id}`, { icon: VIEW_ICONS[id], label: `view.${id}`, enabled: hasDoc, checked: () => hasDoc() && !state.showStart && activeTab().view.id === id, run: () => switchView(id) }])),
  viewMenu: { icon: 'viewSwitch', label: 'action.viewMenu', enabled: hasDoc, run: (context) => viewsMenu(context?.anchor) },
  zoomIn: { icon: 'zoomIn', label: 'action.zoomIn', key: 'Ctrl+=', enabled: () => hasDoc() && zoomPercent() < CANVAS_ZOOM.max, run: () => setCanvasZoom(zoomStep(zoomPercent(), 1)) },
  zoomOut: { icon: 'zoomOut', label: 'action.zoomOut', key: 'Ctrl+-', enabled: () => hasDoc() && zoomPercent() > CANVAS_ZOOM.min, run: () => setCanvasZoom(zoomStep(zoomPercent(), -1)) },
  zoomReset: { icon: 'zoomReset', label: 'action.zoomReset', key: 'Ctrl+0', enabled: hasDoc, run: () => setCanvasZoom(100) },
  fitPage: { icon: 'fitPage', label: 'action.fitPage', key: 'Ctrl+Shift+W', enabled: hasDoc, run: () => { ensureDrawingView(); state.view?.fitPage?.(); } },
  fitWidth: { icon: 'fitWidth', label: 'action.fitWidth', enabled: hasDoc, run: () => { ensureDrawingView(); state.view?.fitWidth?.(); } },
  fitHeight: { icon: 'fitHeight', label: 'action.fitHeight', enabled: hasDoc, run: () => { ensureDrawingView(); state.view?.fitHeight?.(); } },
  zoomSelection: { icon: 'zoomSelection', label: 'action.zoomSelection', enabled: hasSelection, run: () => { ensureDrawingView(); state.view?.zoomSelection?.(); } },
  rulers: { icon: 'rulers', label: 'action.rulers', checked: () => state.settings.showRulers, run: () => toggle('showRulers') },
  grid: { icon: 'grid', label: 'action.grid', checked: () => state.settings.showGrid, run: () => toggle('showGrid') },
  guides: { icon: 'guides', label: 'action.guides', checked: () => state.settings.showGuides, run: () => toggle('showGuides') },
  pageBreaks: { icon: 'pageBreaks', label: 'action.pageBreaks', checked: () => state.settings.showPageBreaks, run: () => toggle('showPageBreaks') },
  connectionPoints: { icon: 'connectionPoints', label: 'action.connectionPoints', checked: () => state.settings.showConnectionPoints, run: () => toggle('showConnectionPoints') },
  minimap: { icon: 'minimap', label: 'action.minimap', checked: () => state.settings.showMinimap, run: () => toggle('showMinimap') },
  snapGrid: { icon: 'snap', label: 'action.snapGrid', checked: () => state.settings.snapToGrid, run: () => toggle('snapToGrid') },
  smartGuides: { icon: 'smartGuides', label: 'action.smartGuides', checked: () => state.settings.smartGuides && state.settings.snapToShapes, run: () => updateSettings({ smartGuides: !(state.settings.smartGuides && state.settings.snapToShapes), snapToShapes: true }) },
  autoConnectToggle: { icon: 'autoConnect', label: 'action.autoConnectToggle', checked: () => state.settings.autoConnect, run: () => toggle('autoConnect') },
  presentation: { icon: 'presentation', label: 'action.presentation', key: 'F5', enabled: hasDoc, run: () => startPresentation() },
  leftPanel: { icon: 'panelLeft', label: 'action.leftPanel', key: 'Ctrl+Shift+1', checked: () => state.settings.showLeftPanel, run: () => toggle('showLeftPanel') },
  rightPanel: { icon: 'panelRight', label: 'action.rightPanel', key: 'Ctrl+Shift+2', checked: () => state.settings.showRightPanel, run: () => toggle('showRightPanel') },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => state.settings.showStatusBar, run: () => toggle('showStatusBar') },
  theme: { icon: 'palette', label: 'action.themeRandom', run: () => updateSettings({ theme: randomThemeId(state.settings.theme) }) },
  themeMenu: { icon: 'chevronDown', label: 'action.themeChoose', run: (context) => openThemePicker(context?.anchor) },
  exportMenu: { icon: 'chevronDown', label: 'action.exportMenu', enabled: hasDoc, run: (context) => showMenu(menuItems(SUBMENUS.exportTo.items), context?.anchor ?? anchorFor('exportMenu'), 'context', { header: { icon: 'exportFile', title: t('submenu.exportTo') } }) },
  language: { icon: 'globe', label: 'action.language', key: 'Ctrl+Shift+L', run: () => updateSettings({ language: getLanguage() === 'ko' ? 'en' : 'ko' }) },
  shuffleBackground: { icon: 'dice', label: 'action.shuffleBackground', key: 'Ctrl+Shift+B', run: () => shuffleBackground() },
  backgroundImage: { icon: 'imageBg', label: 'action.backgroundImage', run: () => chooseBackground() },
  clearBackground: { icon: 'imageClear', label: 'action.clearBackground', enabled: () => Boolean(state.settings.backgroundImage) || state.settings.backgroundKind !== 'none', run: () => removeBackground() },
  // data
  shapeData: { icon: 'shapeData', label: 'action.shapeData', key: 'Ctrl+Shift+D', enabled: hasSelection, run: () => openShapeData() },
  showData: { icon: 'showData', label: 'action.showData', enabled: has2D, checked: () => has2D() && selected2D().every((s) => s.showData), run: () => { const on = !selected2D().every((s) => s.showData); change('op.showData', (doc, page) => selected2D().forEach((s) => { D.findShape(page, s.id).showData = on; })); } },
  dataGraphics: { icon: 'dataGraphics', label: 'action.dataGraphics', enabled: hasDoc, checked: () => Boolean(activeTab()?.doc.options.dataGraphics), run: () => docOption('dataGraphics') },
  linkData: { icon: 'linkData', label: 'action.linkData', enabled: hasDoc, run: () => openImport('link') },
  exportData: { icon: 'exportData', label: 'action.exportData', enabled: hasDoc, run: () => exportAs('csv') },
  orgFromData: { icon: 'orgData', label: 'action.orgFromData', run: () => openImport('org') },
  shapesFromList: { icon: 'list', label: 'action.shapesFromList', run: () => openImport('list') },
  // page
  pageNew: { icon: 'pageAdd', label: 'action.pageNew', key: 'Shift+F11', enabled: hasDoc, run: () => addPage() },
  pageBackgroundNew: { icon: 'pageBg', label: 'action.pageBackgroundNew', enabled: hasDoc, run: () => addPage({ background: true }) },
  pageDuplicate: { icon: 'pageDuplicate', label: 'action.pageDuplicate', enabled: hasDoc, run: () => duplicatePage() },
  pageDelete: { icon: 'pageDelete', label: 'action.pageDelete', enabled: () => hasDoc() && activeTab().doc.pages.length > 1, run: () => deletePage() },
  pageRename: { icon: 'pageRename', label: 'action.pageRename', enabled: hasDoc, run: () => promptRenamePage() },
  pagePrev: { icon: 'pagePrev', label: 'action.pagePrev', key: 'Ctrl+PageUp', enabled: () => hasDoc() && activeTab().doc.pages.length > 1, run: () => pageStep(-1) },
  pageNext: { icon: 'pageNext', label: 'action.pageNext', key: 'Ctrl+PageDown', enabled: () => hasDoc() && activeTab().doc.pages.length > 1, run: () => pageStep(1) },
  pageSetup: { icon: 'pageSetup', label: 'action.pageSetup', enabled: hasDoc, run: (context) => openPageSetup(context?.tab) },
  layers: { icon: 'layerProps', label: 'action.layers', enabled: hasDoc, run: () => openLayers() },
  autoSize: { icon: 'autoSize', label: 'action.autoSize', enabled: hasDoc, checked: () => Boolean(currentPage()?.autoSize), run: () => change('op.pageSetup', (doc, page) => { page.autoSize = !page.autoSize; }) },
  backgroundMenu: { icon: 'backgroundMenu', label: 'action.backgroundMenu', enabled: () => hasDoc() && !currentPage()?.background, run: (context) => backgroundMenu(context?.anchor) },
  // report
  ...Object.fromEntries(REPORTS.map(([id, glyph]) => [`report:${id}`, { icon: glyph, label: `report.${id}`, enabled: hasDoc, checked: () => viewIs('reports') && (activeTab().view.report ?? 'inventory') === id, run: () => { activeTab().view.report = id; switchView('reports'); } }])),
  copyReport: { icon: 'copyReport', label: 'action.copyReport', enabled: () => viewIs('reports'), run: async () => { await native.clipboardWrite(state.view.text()); notify('success', t('notice.reportCopied')); } },
  exportReport: { icon: 'exportReport', label: 'action.exportReport', enabled: hasDoc, run: (context) => chooseReportFormat(context) },
  exportReportHtml: { icon: 'reportHtml', label: 'action.exportReportHtml', enabled: hasDoc, run: () => exportReport('html') },
  exportReportMd: { icon: 'reportMarkdown', label: 'action.exportReportMd', enabled: hasDoc, run: () => exportReport('md') },
  exportReportDocx: { icon: 'reportWord', label: 'action.exportReportDocx', enabled: hasDoc, run: () => exportReport('docx') },
  exportReportPdf: { icon: 'reportPdf', label: 'action.exportReportPdf', enabled: hasDoc, run: () => exportReport('pdf') },
  // help
  tutorial: { icon: 'tutorial', label: 'action.tutorial', key: 'F11', run: () => startTutorial() },
  userGuide: { icon: 'userGuide', label: 'action.userGuide', run: () => openUserGuide() },
  tutorialDoc: { icon: 'tutorialDoc', label: 'action.tutorialDoc', checked: () => state.reader?.doc === 'tutorial', run: () => openReader('tutorial') },
  shortcuts: { icon: 'keyboard', label: 'action.shortcuts', run: () => popups.open('settings', { tab: 'shortcuts' }) },
  settings: { icon: 'gear', label: 'action.settings', key: 'Ctrl+,', run: () => popups.open('settings', { tab: 'general' }) },
  about: { icon: 'info', label: 'action.about', key: 'F1', run: () => popups.open('about') },
};

function viewIs(...ids) { return hasDoc() && !state.showStart && ids.includes(activeTab().view.id); }

function selectWhere(test) {
  if (!activeTab()) return;
  ensureDrawingView();
  const page = currentPage();
  select(page.shapes.filter((s) => !s.groupId && D.layerState(page, s).visible && !D.layerState(page, s).locked && test(s)).map((s) => s.id));
}

function styleOf(shape) { return D.isConnector(shape) ? resolveConnectorStyle(activeTab().doc, shape) : resolveShapeStyle(activeTab().doc, shape); }
function styleAll(key) { const list = selectedShapes().filter((s) => !D.isGroup(s)); return list.length > 0 && list.every((s) => Boolean(styleOf(s)[key])); }
function styleIs(key, value) { const list = selectedShapes().filter((s) => !D.isGroup(s)); return list.length > 0 && list.every((s) => styleOf(s)[key] === value); }
function routeIs(route) { const list = selectedConnectors(); return list.length ? list.every((c) => c.route === route) : activeTab()?.doc.options.connectorRoute === route; }

function stepFont(direction) {
  const sizes = [6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72, 96];
  change('op.format', (doc, page) => {
    for (const shape of selectedShapes()) {
      const target = D.findShape(page, shape.id);
      if (!target || D.isGroup(target)) continue;
      const current = styleOf(target).fontSize ?? 13;
      const next = direction > 0 ? sizes.find((s) => s > current) ?? current + 12 : [...sizes].reverse().find((s) => s < current) ?? Math.max(4, current - 1);
      target.style = { ...(target.style ?? {}), fontSize: next };
    }
  });
}

function autoAlign() {
  const ids = selectedIds().length > 1 ? selectedIds() : null;
  const moved = change('op.layout', (doc, page) => layoutPage(page, { kind: 'flowTB', spacing: 50, ids }));
  notify('success', t('notice.layout', { count: moved }));
}

function commandEnabled(id) {
  const command = commands[id];
  return Boolean(command) && (!command.enabled || command.enabled());
}

function commandTip(id) {
  const command = commands[id];
  let label = t(command.label).replace(/…$/, '');
  const tab = activeTab();
  if (id === 'undo' && tab?.history.canUndo) label = t('tip.undoWith', { label: tab.history.undoLabel });
  if (id === 'redo' && tab?.history.canRedo) label = t('tip.redoWith', { label: tab.history.redoLabel });
  if (id === 'language') label = t('tip.language');
  if ((id === 'save' || id === 'saveAs') && dbActive()) label = t('tip.saveBoth', { label, where: dbDescribe(state.settings) });
  if (id === 'theme') label = t('tip.themeRandom', { current: themeName(state.settings.theme, getLanguage()) });
  if (id === 'viewMenu' && tab) label = t('tip.viewMenu', { name: t(`view.${tab.view.id}`) });
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

function undo() {
  const label = activeTab().undo();
  if (label) afterHistory(t('notice.undone', { label }));
}

function redo() {
  const label = activeTab().redo();
  if (label) afterHistory(t('notice.redone', { label }));
}

function afterHistory(text) {
  const tab = activeTab();
  if (!tab.doc.pages.some((page) => page.id === tab.view.pageId)) tab.view.pageId = tab.doc.pages[0].id;
  pruneSelection();
  if (state.view?.render) state.view.render();
  renderAll();
  notify('info', text);
}

// ───────────────────────── layout

// Long menus are grouped: a { sub } entry opens its items in a panel beside it (hover or click).
const SUBMENUS = {
  exportTo: { icon: 'exportFile', items: ['exportVsdx', 'exportPdf', 'exportSvg', 'exportImage', 'exportHtml', 'exportData'] },
  views: { icon: 'viewSwitch', items: VIEWS.map((id) => `view:${id}`) },
  zoom: { icon: 'zoomIn', items: ['zoomIn', 'zoomOut', 'zoomReset', '-', 'fitPage', 'fitWidth', 'fitHeight', 'zoomSelection'] },
  show: { icon: 'eye', items: ['rulers', 'grid', 'guides', 'pageBreaks', 'connectionPoints', 'minimap', '-', 'leftPanel', 'rightPanel', 'statusBar'] },
  snapping: { icon: 'snap', items: ['snapGrid', 'smartGuides', 'glue', 'autoConnectToggle'] },
  appearance: { icon: 'palette', items: ['theme', 'themeMenu', 'language', '-', 'shuffleBackground', 'backgroundImage', 'clearBackground'] },
  select: { icon: 'selectAll', items: ['selectAll', 'selectShapes', 'selectConnectors', 'selectSameMaster', 'clearSelection'] },
  tools: { icon: 'pointer', items: TOOLS.map((tool) => `tool:${tool}`) },
  text: { icon: 'textTool', items: ['bold', 'italic', 'underline', 'strike', '-', 'textAlignLeft', 'textAlignCenter', 'textAlignRight', '-', 'valignTop', 'valignMiddle', 'valignBottom', '-', 'fontUp', 'fontDown', 'textColor'] },
  line: { icon: 'lineColor', items: ['lineColor', 'lineWeight', 'linePattern', '-', 'arrowStart', 'arrowEnd'] },
  connector: { icon: 'connectorTool', items: ['routeOrtho', 'routeStraight', 'routeCurved', '-', 'reverse', 'clearBends', '-', 'lineJumps', 'avoidShapes'] },
  order: { icon: 'bringFront', items: ['bringFront', 'sendBack', 'bringForward', 'sendBackward'] },
  align: { icon: 'alignCenter', items: ['alignLeft', 'alignCenter', 'alignRight', '-', 'alignTop', 'alignMiddle', 'alignBottom', '-', 'distributeH', 'distributeV', 'sameSize'] },
  rotate: { icon: 'rotateRight', items: ['rotateRight', 'rotateLeft', 'flipH', 'flipV'] },
  reportExport: { icon: 'exportReport', items: ['exportReportHtml', 'exportReportMd', 'exportReportDocx', 'exportReportPdf'] },
};
const sub = (key) => ({ sub: key });
const MENUS = {
  file: ['new', 'open', 'startPage', 'recent', 'recentFolders', 'clearRecent', '-', 'save', 'saveAs', 'saveAll', 'saveTemplate', '-', ...(desktop ? ['dbOpen', 'dbSave', '-'] : []), 'importVisio', sub('exportTo'), '-', 'print', 'docProps', '-', 'closeTab', 'closeAll', '-', 'exit'],
  edit: ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'duplicate', 'delete', '-', sub('select'), '-', 'find', 'replace', 'goToPage', '-', 'formatPainter'],
  view: [sub('views'), 'viewMenu', '-', sub('zoom'), sub('show'), sub('snapping'), '-', 'presentation', '-', sub('appearance')],
  insert: [sub('tools'), '-', 'insertText', 'insertPicture', 'insertContainer', 'insertCallout', '-', 'insertHyperlink', 'insertComment', 'insertField', 'insertTitleBlock', '-', 'saveShape', 'myShapes'],
  format: ['formatShape', 'quickStyle', '-', 'fillColor', sub('line'), sub('text'), 'shadow', '-', sub('connector'), '-', 'clearFormat'],
  arrange: [sub('order'), sub('align'), sub('rotate'), '-', 'group', 'ungroup', '-', 'position', 'protect', '-', 'layout', 'autoAlign'],
  design: ['design', 'variantNext', 'quickStyle', '-', 'lineJumps', 'avoidShapes', 'glue', '-', 'insertTitleBlock', 'backgroundMenu'],
  data: ['shapeData', 'showData', 'dataGraphics', '-', 'linkData', 'exportData', 'orgFromData', 'shapesFromList', '-', 'view:shapeData', ...REPORTS.map(([id]) => `report:${id}`), '-', sub('reportExport'), 'copyReport'],
  page: ['pageNew', 'pageBackgroundNew', 'pageDuplicate', 'pageRename', 'pageDelete', '-', 'pagePrev', 'pageNext', 'goToPage', '-', 'pageSetup', 'layers', 'autoSize', 'backgroundMenu', '-', 'view:pages'],
  help: ['tutorial', 'tutorialDoc', 'userGuide', 'shortcuts', '-', 'settings', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', view: 'eye', insert: 'plus', format: 'formatShape', arrange: 'bringFront', design: 'design', data: 'shapeData', page: 'pageSetup', help: 'question' };

const TOOLBAR = [
  ['new', 'open', 'save', 'print', 'exportSplit'],
  ['undo', 'redo'],
  ['copy', 'paste', 'formatPainter'],
  ['tool:pointer', 'tool:connector', 'tool:text', 'tool:rect', 'tool:ellipse', 'tool:line'],
  ['fillSplit', 'lineSplit'],
  ['bringFront', 'sendBack', 'alignMenu', 'group'],
  ['viewSplit'],
  ['zoom', 'zoomReset', 'fitWidth', 'fitHeight', 'fitPage', 'zoomSelection'],
  ['rulers', 'grid', 'leftPanel', 'rightPanel'],
];
/** Right end of the toolbar: tutorial, theme (random + dropdown), language, settings, about. */
const TOOLBAR_RIGHT = ['tutorial', 'themeSplit', 'language', 'settings', 'about'];

function renderShell() {
  root.innerHTML = `
    <div class="app-bg" aria-hidden="true"><canvas class="anim-bg"></canvas><div class="image-bg"></div></div>
    <nav id="menubar" role="menubar"></nav>
    <div id="toolbar" role="toolbar"></div>
    <main id="workspace">
      <aside id="left-panel" class="side-panel" aria-label="${escapeHtml(t('panel.leftTitle'))}"></aside>
      <div class="splitter vertical panel-split" data-split="left" title="${escapeHtml(t('tip.panelSplitter'))}" role="separator" aria-orientation="vertical"></div>
      <section id="center">
        <div id="center-body">
          <div id="view-host" class="view-host"></div>
          <div id="start-page" hidden></div>
          <div id="reader-page" hidden></div>
          <div class="drop-overlay" aria-hidden="true"><div>${icon('drop')}<span></span></div></div>
        </div>
      </section>
      <div class="splitter vertical panel-split" data-split="right" title="${escapeHtml(t('tip.panelSplitter'))}" role="separator" aria-orientation="vertical"></div>
      <aside id="right-panel" class="side-panel" aria-label="${escapeHtml(t('panel.rightTitle'))}"></aside>
    </main>
    <footer id="statusbar" role="status"></footer>
    ${desktop ? `<div class="resize-grip" data-resize-grip title="${escapeHtml(t('tip.resize'))}" aria-label="${escapeHtml(t('tip.resize'))}" role="separator">${icon('grip')}</div>` : `<div class="resize-grip static" title="${escapeHtml(t('tip.resize'))}" aria-hidden="true">${icon('grip')}</div>`}
    <div id="presentation" hidden></div>
    <div id="tutorial-layer"></div>`;
}

function renderMenubar() {
  const menubar = root.querySelector('#menubar');
  const onStart = state.showStart || !activeTab();
  const home = `<button class="menubar-item menubar-home ${onStart ? 'current' : ''}" data-home title="${escapeHtml(t('tip.home'))}" aria-label="${escapeHtml(t('menu.home'))}" aria-pressed="${onStart}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button><span class="menubar-sep" aria-hidden="true"></span>`;
  // No OS title bar: icon, name and version, then the drawing's name; the empty part moves the window.
  const brand = `<span class="app-brand" data-drag-window><img src="${appIcon}" alt="" draggable="false" /><b>MyDiagram</b><span class="app-version">v${escapeHtml(state.info?.version ?? VERSION)}</span></span>`;
  const title = `<button class="doc-title" id="doc-title" data-doc-menu aria-haspopup="true" hidden>${icon('diagram')}<span class="doc-title-name"></span><span class="doc-title-dirty" aria-hidden="true">●</span><span class="doc-title-count"></span>${icon('chevronDown')}</button>`;
  const controls = desktop ? `<span class="win-controls">
    <button class="win-button" data-window="minimize" title="${escapeHtml(t('window.minimize'))}" aria-label="${escapeHtml(t('window.minimize'))}">${icon('winMinimize')}</button>
    <button class="win-button" data-window="maximize" title="${escapeHtml(t(windowMaximized ? 'window.restore' : 'window.maximize'))}" aria-label="${escapeHtml(t(windowMaximized ? 'window.restore' : 'window.maximize'))}">${icon(windowMaximized ? 'winRestore' : 'winMaximize')}</button>
    <button class="win-button close" data-window="close" title="${escapeHtml(t('window.close'))}" aria-label="${escapeHtml(t('window.close'))}">${icon('close')}</button></span>` : '';
  menubar.innerHTML = brand + title + '<span class="menubar-sep" aria-hidden="true"></span>' + home + Object.keys(MENUS).map((name) => `
    <button class="menubar-item ${state.openMenu === name ? 'open' : ''}" data-menu="${name}" role="menuitem" aria-haspopup="true" title="${escapeHtml(t(`menu.${name}`))}">${icon(MENU_ICONS[name])}<span>${escapeHtml(t(`menu.${name}`))}</span></button>`).join('') + '<span class="menubar-drag" data-drag-window></span>' + controls;
  renderDocTitle();
}

let windowMaximized = false;
async function syncMaximized() {
  if (!desktop) return;
  const maximized = await appWindow.isMaximized().catch(() => windowMaximized);
  if (maximized === windowMaximized) return;
  windowMaximized = maximized;
  document.documentElement.classList.toggle('window-maximized', maximized);
  const button = root.querySelector('[data-window="maximize"]');
  if (!button) return;
  const label = t(maximized ? 'window.restore' : 'window.maximize');
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = icon(maximized ? 'winRestore' : 'winMaximize');
}

function windowButton(action) {
  if (action === 'minimize') return appWindow?.minimize().catch(() => {});
  if (action === 'maximize') return appWindow?.toggleMaximize().then(syncMaximized).catch(() => {});
  return run('exit');
}

/** Language the toolbar was built in (renderAll rebuilds it only when that changes). */
let toolbarLanguage = null;

function renderToolbar() {
  const toolbar = root.querySelector('#toolbar');
  toolbarLanguage = getLanguage();
  const plain = (id, extra = '') => {
    const command = commands[id];
    const glyph = id === 'language' ? switchFlag(getLanguage()) : icon(command.icon);
    return `<button class="tool-button ${extra}" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(command.label))}">${glyph}</button>`;
  };
  const button = (id) => {
    if (id === 'zoom') {
      return `<span class="stepper toolbar-zoom" title="${escapeHtml(t('tip.zoomValue'))}">
        <button class="tool-button stepper-button-tool" data-command="zoomOut" title="${escapeHtml(commandTip('zoomOut'))}" aria-label="${escapeHtml(t('action.zoomOut'))}">${icon('minus')}</button>
        <input class="stepper-value" id="zoom-value" type="text" inputmode="decimal" value="${zoomPercent()}%" title="${escapeHtml(t('tip.zoomValue'))}" aria-label="${escapeHtml(t('tip.zoomValue'))}" />
        <button class="tool-button stepper-button-tool" data-command="zoomIn" title="${escapeHtml(commandTip('zoomIn'))}" aria-label="${escapeHtml(t('action.zoomIn'))}">${icon('plus')}</button>
      </span>`;
    }
    if (id === 'exportSplit') return `<span class="split-button">${plain('exportImage')}<button class="tool-button split-arrow" data-command="exportMenu" title="${escapeHtml(commandTip('exportMenu'))}" aria-label="${escapeHtml(t('action.exportMenu'))}" aria-haspopup="true" ${commandEnabled('exportMenu') ? '' : 'disabled'}>${icon('chevronDown')}</button></span>`;
    if (id === 'themeSplit') return `<span class="split-button">${plain('theme')}<button class="tool-button split-arrow" data-command="themeMenu" title="${escapeHtml(commandTip('themeMenu'))}" aria-label="${escapeHtml(t('action.themeChoose'))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
    if (id === 'fillSplit' || id === 'lineSplit') {
      const cmd = id === 'fillSplit' ? 'fillColor' : 'lineColor';
      return `<span class="split-button color-split"><button class="tool-button color-button" data-command="${cmd}" data-color-apply="${id === 'fillSplit' ? 'fill' : 'line'}" title="${escapeHtml(commandTip(cmd))}" aria-label="${escapeHtml(t(commands[cmd].label))}">${icon(commands[cmd].icon)}<i class="color-bar" data-color-bar="${id === 'fillSplit' ? 'fill' : 'line'}"></i></button><button class="tool-button split-arrow" data-command="${cmd}" title="${escapeHtml(commandTip(cmd))}" aria-label="${escapeHtml(t(commands[cmd].label))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
    }
    if (id === 'viewSplit') {
      const current = activeTab()?.view.id ?? 'drawing';
      return `<span class="split-button view-split"><button class="tool-button wide" data-command="viewMenu" title="${escapeHtml(commandTip('viewMenu'))}" aria-label="${escapeHtml(t('action.viewMenu'))}" aria-haspopup="true" data-view-icon="${current}">${icon(VIEW_ICONS[current])}<span class="view-name">${Object.keys(VIEW_ICONS).map((v) => `<span data-view-name="${v}" class="${v === current ? '' : 'off'}" aria-hidden="${v !== current}">${escapeHtml(t(`view.${v}`))}</span>`).join('')}</span>${icon('chevronDown', 'icon tiny')}</button></span>`;
    }
    return plain(id);
  };
  toolbar.innerHTML = `<div class="toolbar-inner">
    <div class="toolbar-left">${TOOLBAR.map((group) => `<div class="tool-group">${group.map(button).join('')}</div>`).join('<span class="tool-sep" aria-hidden="true"></span>')}</div>
    <span class="grow"></span>
    <div class="toolbar-right tool-group">${TOOLBAR_RIGHT.map(button).join('')}</div>
  </div>`;
  renderToolbarState();
  updateMinimumWidth();
}

/** The last fill / line colours used from the toolbar (the left half of the split buttons applies them). */
const lastColors = { fill: '#4472c4', line: '#1f2937' };

function renderToolbarState() {
  for (const element of root.querySelectorAll('#toolbar [data-command]')) {
    const id = element.dataset.command;
    element.disabled = !commandEnabled(id);
    element.title = commandTip(id);
    const checked = commands[id].checked?.();
    element.classList.toggle('active', Boolean(checked));
    if (checked !== undefined) element.setAttribute('aria-pressed', String(Boolean(checked)));
  }
  for (const bar of root.querySelectorAll('[data-color-bar]')) bar.style.background = lastColors[bar.dataset.colorBar];
  const zoom = root.querySelector('#zoom-value');
  if (zoom && document.activeElement !== zoom) zoom.value = `${zoomPercent()}%`;
  const current = activeTab()?.view.id ?? 'drawing';
  const viewButton = root.querySelector('.view-split [data-view-icon]');
  if (viewButton && viewButton.dataset.viewIcon !== current) {
    viewButton.querySelector('svg').outerHTML = icon(VIEW_ICONS[current]);
    viewButton.dataset.viewIcon = current;
  }
  for (const name of root.querySelectorAll('.view-split [data-view-name]')) { const off = name.dataset.viewName !== current; name.classList.toggle('off', off); name.setAttribute('aria-hidden', String(off)); }
}

/** The window can never be so narrow that toolbar buttons or menus are hidden. */
function updateMinimumWidth() {
  const left = root.querySelector('.toolbar-left');
  const right = root.querySelector('.toolbar-right');
  if (!left || !right) return;
  requestAnimationFrame(() => {
    const toolbar = root.querySelector('#toolbar');
    const style = getComputedStyle(toolbar);
    // The menu bar also holds the program's name, room for the drawing's name (it shortens) and the window buttons.
    const fixed = ['.app-brand', '.win-controls'].reduce((sum, selector) => sum + (root.querySelector(selector)?.offsetWidth ?? 0), 0);
    const menus = [...root.querySelectorAll('.menubar-item')].reduce((sum, el) => sum + el.offsetWidth + 2, 24 + fixed + 200);
    const width = Math.ceil(Math.max(menus, left.scrollWidth + right.scrollWidth + 24 + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2));
    if (Math.abs(width - state.minWidth) < 1) return;
    state.minWidth = width;
    document.documentElement.style.setProperty('--min-width', `${width}px`);
    native.setMinimumSize(width, 600).catch(() => {});
  });
}

// ───────────────────────── tabs

/** The drawing's name in the menu bar (with ● while it has unsaved changes). */
function renderDocTitle() {
  const title = root.querySelector('#doc-title');
  if (!title) return;
  const tab = state.showStart ? null : activeTab();
  title.hidden = !tab;
  if (!tab) return;
  title.classList.toggle('dirty', Boolean(tab.dirty));
  title.title = `${tab.path ?? docName(tab)}${state.docs.length > 1 ? ` — ${t('doc.switchTip', { count: state.docs.length })}` : ''}`;
  title.querySelector('.doc-title-name').textContent = docName(tab);
  title.querySelector('.doc-title-count').textContent = state.docs.length > 1 ? String(state.docs.length) : '';
}

/** Open drawings (switch to one) and the drawing's file commands. */
function docMenu(anchor) {
  const items = state.docs.map((doc) => ({ id: `custom:doc:${doc.id}`, label: `${docName(doc)}${doc.dirty ? ' ●' : ''}`, icon: doc.fromTemplate ? 'template' : 'diagram', checked: doc.id === state.active && !state.showStart }));
  const handlers = Object.fromEntries(state.docs.map((doc) => [`custom:doc:${doc.id}`, () => activateDoc(doc.id)]));
  return showMenu([...items, { separator: true }, ...menuItems(['save', 'saveAs', 'saveTemplate', '-', 'docProps', 'print', '-', 'closeTab', 'closeAll', '-', 'new'])], anchor ?? anchorBelow(root.querySelector('#doc-title')), 'context', { handlers, header: { icon: 'diagram', title: t('doc.menu') } });
}

function cycleTab(direction) {
  const index = state.docs.findIndex((doc) => doc.id === state.active);
  const next = state.docs[(index + direction + state.docs.length) % state.docs.length];
  if (next) activateDoc(next.id);
}

// ───────────────────────── left panel (Shapes)

const tileSize = () => ({ small: 30, medium: 40, large: 52 }[state.settings.stencilSize] ?? 40);

function stencilTiles(masters) {
  const size = tileSize();
  const doc = activeTab()?.doc;
  const lang = getLanguage();
  return `<div class="stencil-grid size-${state.settings.stencilSize}">${masters.map((m) => `<button class="stencil-tile" data-master="${m.id}" title="${escapeHtml(m.name[lang])}" aria-label="${escapeHtml(m.name[lang])}">${masterIcon(m.id, { size, doc })}${state.settings.stencilSize === 'small' ? '' : `<span>${escapeHtml(m.name[lang])}</span>`}</button>`).join('')}</div>`;
}

function myShapesTiles() {
  if (!state.myShapes.length) return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('myShapes.empty'))}</span></p>`;
  const size = tileSize();
  return `<div class="stencil-grid size-${state.settings.stencilSize}">${state.myShapes.map((item) => `<button class="stencil-tile" data-master="my:${item.id}" title="${escapeHtml(item.name)}" aria-label="${escapeHtml(item.name)}"><span class="my-shape-icon" style="width:${size}px;height:${size}px">${item.svg.replace('<svg ', '<svg preserveAspectRatio="xMidYMid meet" ').replace(/ width="\d+" height="\d+"/, ` width="${size}" height="${size}"`)}</span>${state.settings.stencilSize === 'small' ? '' : `<span>${escapeHtml(item.name)}</span>`}</button>`).join('')}</div>`;
}

function renderLeft() {
  const panel = root.querySelector('#left-panel');
  const tab = activeTab();
  const lang = getLanguage();
  if (!state.settings.showLeftPanel) {
    panel.innerHTML = `<div class="panel-rail">
      <button class="rail-button expand" data-command="leftPanel" title="${escapeHtml(t('panel.expandLeft'))}" aria-label="${escapeHtml(t('panel.expandLeft'))}">${icon('chevronRight')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button>
      <div class="rail-title" title="${escapeHtml(t('panel.leftTitle'))}">${icon('stBasic')}<span>${escapeHtml(t('panel.shapesShort'))}</span></div>
      ${TOOLS.slice(0, 7).map((tool) => `<button class="rail-button ${state.tool === tool ? 'active' : ''}" data-command="tool:${tool}" title="${escapeHtml(commandTip(`tool:${tool}`))}">${icon(TOOL_ICONS[tool])}<span class="rail-label">${escapeHtml(t(`toolShort.${tool}`))}</span></button>`).join('')}
    </div>`;
    return;
  }
  const open = tab?.stencils ?? state.settings.openStencils;
  const query = state.stencilQuery;
  const results = query ? searchMasters(query) : [];
  const section = (id, title, glyph, body, closable = true) => {
    const collapsed = state.collapsedStencils.has(id);
    return `<section class="stencil ${collapsed ? 'collapsed' : ''}" data-stencil="${id}">
      <header class="stencil-head"><button class="stencil-toggle" data-stencil-toggle="${id}" title="${escapeHtml(title)}" aria-expanded="${!collapsed}">${icon(collapsed ? 'caretRight' : 'caretDown', 'icon tiny')}${icon(glyph)}<span>${escapeHtml(title)}</span></button>
      ${closable ? `<button class="icon-button" data-stencil-close="${id}" title="${escapeHtml(t('stencil.close'))}" aria-label="${escapeHtml(t('stencil.close'))}">${icon('close')}</button>` : ''}</header>
      ${collapsed ? '' : body}
    </section>`;
  };
  panel.innerHTML = `
    <div class="panel-header">${icon('stBasic')}<span>${escapeHtml(t('panel.leftTitle'))}</span>
      <button class="icon-button" data-command="leftPanel" title="${escapeHtml(t('panel.collapseLeft'))}" aria-label="${escapeHtml(t('panel.collapseLeft'))}">${icon('chevronLeft')}</button></div>
    <div class="shapes-tools">
      <label class="search-box" title="${escapeHtml(t('stencil.searchTip'))}">${icon('search')}<input id="stencil-search" type="search" value="${escapeHtml(query)}" placeholder="${escapeHtml(t('stencil.search'))}" aria-label="${escapeHtml(t('stencil.searchTip'))}" /></label>
      <div class="shapes-actions">
        <button class="small-button" data-stencil-more title="${escapeHtml(t('stencil.moreTip'))}">${icon('stencilMore')}<span>${escapeHtml(t('stencil.more'))}</span></button>
        <span class="segmented small" role="radiogroup" title="${escapeHtml(t('stencil.size'))}">${STENCIL_SIZES.map((size) => `<button class="segment ${state.settings.stencilSize === size ? 'active' : ''}" data-stencil-size="${size}" role="radio" aria-checked="${state.settings.stencilSize === size}" title="${escapeHtml(t(`stencil.size.${size}`))}">${escapeHtml(t(`stencil.sizeShort.${size}`))}</button>`).join('')}</span>
      </div>
      <div class="tool-strip">${TOOLS.map((tool) => `<button class="tool-chip ${state.tool === tool ? 'active' : ''}" data-command="tool:${tool}" title="${escapeHtml(commandTip(`tool:${tool}`))}" aria-label="${escapeHtml(t(`tool.${tool}`))}" aria-pressed="${state.tool === tool}">${icon(TOOL_ICONS[tool])}</button>`).join('')}</div>
    </div>
    <div class="stencils">
      ${query ? section('search', t('stencil.results', { count: results.length }), 'search', results.length ? stencilTiles(results) : `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('stencil.noResults'))}</span></p>`, false) : ''}
      ${open.map((id) => (id === 'my' ? section('my', t('stencil.my'), 'myShapes', myShapesTiles()) : CATEGORIES.some((c) => c.id === id) ? section(id, CATEGORIES.find((c) => c.id === id).name[lang], CATEGORIES.find((c) => c.id === id).icon, stencilTiles(mastersIn(id))) : '')).join('')}
      ${open.length ? '' : `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('stencil.none'))}</span></p>`}
    </div>`;
}

function setStencils(list) {
  const tab = activeTab();
  const clean = [...new Set(list)];
  if (tab) tab.stencils = clean;
  updateSettings({ openStencils: clean }, { quiet: true });
  renderLeft();
}

function moreShapesMenu(anchor) {
  const open = activeTab()?.stencils ?? state.settings.openStencils;
  const lang = getLanguage();
  const items = [...CATEGORIES.map((c) => ({ id: `custom:${c.id}`, label: c.name[lang], icon: c.icon, checked: open.includes(c.id) })), { separator: true }, { id: 'custom:my', label: t('stencil.my'), icon: 'myShapes', checked: open.includes('my') }, { separator: true }, { id: 'custom:all', label: t('stencil.openAll'), icon: 'stencilMore' }, { id: 'custom:none', label: t('stencil.closeAll'), icon: 'close' }];
  const handlers = Object.fromEntries([...CATEGORIES.map((c) => c.id), 'my'].map((id) => [`custom:${id}`, () => setStencils(open.includes(id) ? open.filter((x) => x !== id) : [...open, id])]));
  handlers['custom:all'] = () => setStencils([...CATEGORIES.map((c) => c.id), 'my']);
  handlers['custom:none'] = () => setStencils([]);
  return showMenu(items, anchor, 'context', { handlers, header: { icon: 'stencilMore', title: t('stencil.more') } });
}

// ───────────────────────── right panel (properties)

const propRow = (glyph, label, control, tall = false) => `<div class="prop-row ${tall ? 'tall' : ''}" title="${escapeHtml(label)}"><span class="prop-label">${icon(glyph)}<span>${escapeHtml(label)}</span></span><span class="prop-control">${control}</span></div>`;
const propValue = (value) => `<span class="prop-value" title="${escapeHtml(value)}">${escapeHtml(value)}</span>`;
const propInput = (key, value, label, attrs = '') => `<input type="text" data-prop="${key}" value="${escapeHtml(value)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" ${attrs} />`;
const propSelect = (key, options, current, label) => `<select data-prop="${key}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${options.map(([value, text]) => `<option value="${escapeHtml(value)}" ${String(value) === String(current) ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select>`;
const propCheck = (key, checked, label) => `<label class="check-row" title="${escapeHtml(label)}"><input type="checkbox" data-prop-check="${key}" ${checked ? 'checked' : ''} /><span>${escapeHtml(label)}</span></label>`;
const colorButton = (key, value, label) => `<button class="color-swatch-button" data-prop-color="${key}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><i style="background:${value && value !== 'none' ? escapeHtml(value) : 'transparent'}" class="${value && value !== 'none' ? '' : 'none'}"></i><span>${escapeHtml(value === 'none' || !value ? t('color.none') : value)}</span></button>`;
const iconToggle = (command) => `<button class="icon-button ${commands[command].checked?.() ? 'active' : ''}" data-command="${command}" title="${escapeHtml(commandTip(command))}" aria-label="${escapeHtml(t(commands[command].label))}" aria-pressed="${Boolean(commands[command].checked?.())}">${icon(commands[command].icon)}</button>`;

function section(id, glyph, title, body) {
  const open = state.rightSections.has(id);
  return `<section class="prop-section ${open ? 'open' : ''}" data-section="${id}">
    <button class="prop-section-head" data-section-toggle="${id}" aria-expanded="${open}" title="${escapeHtml(title)}">${icon(open ? 'caretDown' : 'caretRight', 'icon tiny')}${icon(glyph)}<span>${escapeHtml(title)}</span></button>
    ${open ? `<div class="prop-section-body">${body}</div>` : ''}
  </section>`;
}

function renderRight() {
  const panel = root.querySelector('#right-panel');
  if (!panel) return;
  if (!state.settings.showRightPanel) {
    panel.innerHTML = `<div class="panel-rail">
      <button class="rail-button expand" data-command="rightPanel" title="${escapeHtml(t('panel.expandRight'))}" aria-label="${escapeHtml(t('panel.expandRight'))}">${icon('chevronLeft')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button>
      <div class="rail-title" title="${escapeHtml(t('panel.rightTitle'))}">${icon('formatShape')}<span>${escapeHtml(t('panel.propsShort'))}</span></div>
      ${['formatShape', 'shapeData', 'layers', 'pageSetup', 'design', 'insertComment'].map((id) => `<button class="rail-button" data-command="${id}" title="${escapeHtml(commandTip(id))}" ${commandEnabled(id) ? '' : 'disabled'}>${icon(commands[id].icon)}<span class="rail-label">${escapeHtml(t(`toolShort.${id}`))}</span></button>`).join('')}
    </div>`;
    return;
  }
  const tab = activeTab();
  const scroll = panel.querySelector('.props')?.scrollTop ?? 0;
  let title = t('panel.rightTitle');
  let body = `<div class="panel-hint">${icon('info')}<span>${escapeHtml(t('props.noDrawing'))}</span></div>`;
  if (tab && !state.showStart) {
    const shapes = selectedShapes();
    if (shapes.length === 1 && D.isConnector(shapes[0])) ({ title, body } = connectorProps(shapes[0]));
    else if (shapes.length === 1) ({ title, body } = shapeProps(shapes[0]));
    else if (shapes.length > 1) ({ title, body } = multiProps(shapes));
    else ({ title, body } = pageProps());
  }
  panel.innerHTML = `
    <div class="panel-header">${icon('formatShape')}<span>${escapeHtml(title)}</span>
      <button class="icon-button" data-command="rightPanel" title="${escapeHtml(t('panel.collapseRight'))}" aria-label="${escapeHtml(t('panel.collapseRight'))}">${icon('chevronRight')}</button></div>
    <div class="props">${body}</div>`;
  const props = panel.querySelector('.props');
  if (props) props.scrollTop = scroll;
}

function quickSection(shapes) {
  const doc = activeTab().doc;
  const colors = variantColors(doc.design, doc.variant);
  const current = shapes[0]?.qs ?? {};
  const variants = QUICK_VARIANTS.filter((v) => v !== 'none');
  return section('quick', 'quickStyle', t('props.quickStyle'), `<div class="quick-grid">${variants.map((variant) => colors.map((color, i) => {
    const sample = { fill: color, subtle: `${color}33`, outline: 'transparent', intense: color, gradient: `linear-gradient(${color}88, ${color})` }[variant];
    const active = (current.color ?? 1) === i + 1 && (current.variant ?? 'fill') === variant;
    return `<button class="quick-swatch ${active ? 'active' : ''} v-${variant}" data-quick="${i + 1}:${variant}" style="--qs:${color};--qs-bg:${sample}" title="${escapeHtml(t('props.quickTip', { n: i + 1, variant: t(`quick.${variant}`) }))}"></button>`;
  }).join('')).join('')}</div>
    <div class="prop-actions"><button class="small-button" data-command="clearFormat" title="${escapeHtml(commandTip('clearFormat'))}">${icon('clearFormat')}<span>${escapeHtml(t('toolShort.clearFormat'))}</span></button>
    <button class="small-button" data-command="formatPainter" title="${escapeHtml(commandTip('formatPainter'))}">${icon('formatPainter')}<span>${escapeHtml(t('toolShort.formatPainter'))}</span></button>
    <button class="small-button" data-command="formatShape" title="${escapeHtml(commandTip('formatShape'))}">${icon('formatShape')}<span>${escapeHtml(t('props.more'))}</span></button></div>`);
}

function fillSection(style) {
  return section('fill', 'fillColor', t('props.fill'), [
    propRow('fillColor', t('props.fillColor'), colorButton('fill', style.fill, t('props.fillColor'))),
    propRow('quickStyle', t('props.fillPattern'), propSelect('fillPattern', ['solid', 'linear', 'radial', 'hatch', 'cross', 'dots', 'none'].map((p) => [p, t(`pattern.${p}`)]), style.fill === 'none' ? 'none' : style.fillPattern ?? 'solid', t('props.fillPattern'))),
    style.fillPattern && style.fillPattern !== 'solid' && style.fill !== 'none' ? propRow('fillColor', t('props.fill2'), colorButton('fill2', style.fill2, t('props.fill2'))) : '',
    propRow('opacity', t('props.fillOpacity'), `<span class="range-wrap"><input type="range" min="0" max="100" step="5" value="${style.fillOpacity ?? 100}" data-prop-range="fillOpacity" aria-label="${escapeHtml(t('props.fillOpacity'))}" /><output>${style.fillOpacity ?? 100}%</output></span>`),
  ].join(''));
}

function lineSection(style, { rounding = true } = {}) {
  return section('line', 'lineColor', t('props.line'), [
    propRow('lineColor', t('props.lineColor'), colorButton('line', style.line, t('props.lineColor'))),
    propRow('lineWeight', t('props.lineWidth'), propSelect('lineWidth', [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8].map((w) => [w, `${w} px`]).concat(String([0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8]).split(',').includes(String(style.lineWidth)) ? [] : [[style.lineWidth, `${style.lineWidth} px`]]), style.lineWidth, t('props.lineWidth'))),
    propRow('linePattern', t('props.dash'), propSelect('dash', DASHES.map((d) => [d, t(`dash.${d}`)]), style.dash ?? 'solid', t('props.dash'))),
    rounding ? propRow('rounding', t('props.rounding'), propSelect('rounding', [0, 2, 4, 6, 8, 12, 16, 24].map((r) => [r, r ? `${r} px` : t('props.none')]).concat([0, 2, 4, 6, 8, 12, 16, 24].includes(Number(style.rounding)) ? [] : [[style.rounding, `${style.rounding} px`]]), style.rounding ?? 0, t('props.rounding'))) : '',
  ].join(''));
}

function textSection(style, { valign = true } = {}) {
  const lang = getLanguage();
  void lang;
  return section('text', 'textTool', t('props.text'), [
    propRow('font', t('props.font'), propSelect('font', FONTS.map((f) => [f, f || t('props.fontDefault')]).concat(FONTS.includes(style.font ?? '') ? [] : [[style.font, style.font]]), style.font ?? '', t('props.font'))),
    propRow('fontUp', t('props.fontSize'), propSelect('fontSize', [6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72].map((s) => [s, `${s}`]).concat([6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72].includes(Number(style.fontSize)) ? [] : [[style.fontSize, `${style.fontSize}`]]), style.fontSize ?? 13, t('props.fontSize'))),
    propRow('textColor', t('props.textColor'), colorButton('textColor', style.textColor, t('props.textColor'))),
    `<div class="prop-buttons">${['bold', 'italic', 'underline', 'strike'].map(iconToggle).join('')}<span class="prop-gap"></span>${['textAlignLeft', 'textAlignCenter', 'textAlignRight'].map(iconToggle).join('')}${valign ? `<span class="prop-gap"></span>${['valignTop', 'valignMiddle', 'valignBottom'].map(iconToggle).join('')}` : ''}</div>`,
    propRow('rotateRight', t('props.textAngle'), propSelect('textAngle', [0, 90, 180, 270].map((a) => [a, `${a}°`]), style.textAngle ?? 0, t('props.textAngle'))),
  ].join(''));
}

function sizeSection(shape) {
  const u = unitsOf();
  const len = (v) => D.formatLength(v, u);
  return section('size', 'position', t('props.size'), [
    `<div class="prop-grid2">${propRow('position', 'X', propInput('x', len(shape.x), 'X'))}${propRow('position', 'Y', propInput('y', len(shape.y), 'Y'))}${propRow('sameSize', t('field.width'), propInput('w', len(shape.w), t('field.width')))}${propRow('sameSize', t('field.height'), propInput('h', len(shape.h), t('field.height')))}</div>`,
    propRow('rotateRight', t('field.angle'), propInput('angle', `${Math.round((shape.angle ?? 0) * 10) / 10}°`, t('field.angle'))),
    `<div class="prop-buttons">${['rotateLeft', 'rotateRight', 'flipH', 'flipV'].map((id) => `<button class="icon-button" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(commands[id].label))}">${icon(commands[id].icon)}</button>`).join('')}<span class="prop-gap"></span>${['bringFront', 'sendBack'].map((id) => `<button class="icon-button" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(commands[id].label))}">${icon(commands[id].icon)}</button>`).join('')}</div>`,
    propCheck('lockAspect', Boolean(shape.locked?.aspect), t('props.lockAspect')),
  ].join(''));
}

function dataSection(shape) {
  const fields = shape.data ?? [];
  return section('data', 'shapeData', t('props.data', { count: fields.length }), [
    fields.length ? fields.map((f, i) => propRow('tag', f.label || f.key, f.type === 'list' && f.options?.length ? `<select data-prop-data="${i}" title="${escapeHtml(f.label || f.key)}">${f.options.map((o) => `<option ${o === f.value ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>` : f.type === 'bool' ? `<input type="checkbox" data-prop-data="${i}" ${['1', 'true', 'yes', 'y'].includes(String(f.value).toLowerCase()) ? 'checked' : ''} aria-label="${escapeHtml(f.label || f.key)}" />` : `<input type="text" data-prop-data="${i}" value="${escapeHtml(f.value)}" title="${escapeHtml(f.label || f.key)}" aria-label="${escapeHtml(f.label || f.key)}" />`)).join('') : `<p class="panel-hint">${escapeHtml(t('props.noData'))}</p>`,
    `<div class="prop-actions"><button class="small-button" data-command="shapeData" title="${escapeHtml(commandTip('shapeData'))}">${icon('shapeData')}<span>${escapeHtml(t('props.editData'))}</span></button>${iconToggle('showData')}</div>`,
  ].join(''));
}

function layersSection(shape) {
  const page = currentPage();
  return section('layers', 'layerProps', t('props.layers'), [
    page.layers.length ? page.layers.map((layer) => `<label class="check-row" title="${escapeHtml(layer.name)}"><input type="checkbox" data-prop-layer="${layer.id}" ${shape.layers?.includes(layer.id) ? 'checked' : ''} /><span>${icon(layer.visible ? 'eye' : 'close')}${escapeHtml(layer.name)}</span></label>`).join('') : `<p class="panel-hint">${escapeHtml(t('props.noLayers'))}</p>`,
    `<div class="prop-actions"><button class="small-button" data-command="layers" title="${escapeHtml(commandTip('layers'))}">${icon('layerProps')}<span>${escapeHtml(t('toolShort.layers'))}</span></button></div>`,
  ].join(''));
}

function linkSection(shape) {
  return section('link', 'hyperlink', t('props.link'), [
    propRow('hyperlink', t('props.address'), propInput('hyperlink', shape.hyperlink ?? '', t('props.address'), `placeholder="${escapeHtml(t('props.addressHint'))}"`)),
    `<div class="prop-actions"><button class="small-button" data-command="insertHyperlink" title="${escapeHtml(commandTip('insertHyperlink'))}">${icon('hyperlink')}<span>${escapeHtml(t('props.editLink'))}</span></button>${shape.hyperlink ? `<button class="small-button" data-follow-link title="${escapeHtml(t('props.followLink'))}">${icon('readerExternal')}<span>${escapeHtml(t('props.followLink'))}</span></button>` : ''}</div>`,
  ].join(''));
}

function commentsSection(target, onPage = false) {
  const list = target?.comments ?? [];
  return section('comments', 'comment', t('props.comments', { count: list.length }), [
    list.map((c) => `<div class="comment ${c.done ? 'done' : ''}"><div class="comment-head"><b>${escapeHtml(c.author || t('comment.me'))}</b><small class="muted">${escapeHtml(new Date(c.at).toLocaleString(getLanguage() === 'en' ? 'en-US' : 'ko-KR'))}</small><span class="grow"></span>
      <button class="icon-button" data-comment-done="${escapeHtml(c.id)}" title="${escapeHtml(t(c.done ? 'comment.reopen' : 'comment.resolve'))}" aria-label="${escapeHtml(t(c.done ? 'comment.reopen' : 'comment.resolve'))}">${icon(c.done ? 'refresh' : 'check')}</button>
      <button class="icon-button" data-comment-delete="${escapeHtml(c.id)}" title="${escapeHtml(t('comment.delete'))}" aria-label="${escapeHtml(t('comment.delete'))}">${icon('trash')}</button></div><p>${escapeHtml(c.text)}</p></div>`).join(''),
    `<textarea data-comment-input rows="2" placeholder="${escapeHtml(t(onPage ? 'comment.pagePlaceholder' : 'comment.placeholder'))}" aria-label="${escapeHtml(t('comment.add'))}"></textarea>
     <div class="prop-actions"><button class="small-button" data-comment-add title="${escapeHtml(t('comment.add'))}">${icon('comment')}<span>${escapeHtml(t('comment.add'))}</span></button></div>`,
  ].join(''));
}

function shapeProps(shape) {
  const lang = getLanguage();
  if (D.isGroup(shape)) {
    const members = D.membersOf(currentPage(), shape.id).length;
    return {
      title: `${t('shape.group')} (${members})`,
      body: [
        propRow('edit', t('field.name'), propInput('name', shape.name ?? '', t('field.name'))),
        propRow('textTool', t('field.text'), `<textarea data-prop="text" rows="2" aria-label="${escapeHtml(t('field.text'))}">${escapeHtml(shape.text ?? '')}</textarea>`, true),
        `<div class="prop-actions"><button class="small-button" data-command="ungroup" title="${escapeHtml(commandTip('ungroup'))}">${icon('ungroup')}<span>${escapeHtml(t('toolShort.ungroup'))}</span></button></div>`,
        sizeSection(shape), dataSection(shape), layersSection(shape), linkSection(shape), commentsSection(shape),
      ].join(''),
    };
  }
  const master = masterById(shape.master);
  const style = resolveShapeStyle(activeTab().doc, shape);
  const params = Object.entries(master.params ?? {}).filter(([, def]) => typeof def.def === 'number');
  return {
    title: `${master.name[lang]}${shape.name ? `: ${shape.name}` : ''}`,
    body: [
      `<div class="prop-master">${masterIcon(master.id, { size: 34, doc: activeTab().doc })}<div><b>${escapeHtml(master.name[lang])}</b><small class="muted">${escapeHtml(t(`stencil.${master.cat ?? 'custom'}`, null, master.cat ?? ''))}</small></div></div>`,
      propRow('edit', t('field.name'), propInput('name', shape.name ?? '', t('field.name'))),
      propRow('textTool', t('field.text'), `<textarea data-prop="text" rows="3" aria-label="${escapeHtml(t('field.text'))}">${escapeHtml(shape.text ?? '')}</textarea>`, true),
      params.length ? params.map(([key, def]) => propRow('edit', t(`param.${key}`, null, key), `<span class="range-wrap"><input type="range" min="0" max="${def.def <= 1 ? 1 : 100}" step="0.01" value="${shapeParams(shape, master)[key]}" data-prop-param="${key}" aria-label="${escapeHtml(t(`param.${key}`, null, key))}" /><output>${Math.round(shapeParams(shape, master)[key] * 100)}%</output></span>`)).join('') : '',
      master.id === 'image' ? `<div class="prop-actions"><button class="small-button" data-replace-picture title="${escapeHtml(t('props.replacePicture'))}">${icon('picture')}<span>${escapeHtml(t('props.replacePicture'))}</span></button></div>` : '',
      quickSection([shape]), fillSection(style), lineSection(style), textSection(style),
      section('effects', 'shadow', t('props.effects'), [
        propCheck('shadow', Boolean(style.shadow), t('action.shadow')),
        propRow('opacity', t('props.opacity'), `<span class="range-wrap"><input type="range" min="10" max="100" step="5" value="${style.opacity ?? 100}" data-prop-range="opacity" aria-label="${escapeHtml(t('props.opacity'))}" /><output>${style.opacity ?? 100}%</output></span>`),
      ].join('')),
      sizeSection(shape), dataSection(shape), layersSection(shape), linkSection(shape), commentsSection(shape),
      section('protect', 'lock', t('props.protect'), ['move', 'size', 'rotate', 'delete', 'text', 'aspect'].map((key) => propCheck(`lock:${key}`, Boolean(shape.locked?.[key]), t(`lock.${key}`))).join('')),
    ].join(''),
  };
}

function connectorProps(connector) {
  const style = resolveConnectorStyle(activeTab().doc, connector);
  const page = currentPage();
  const end = (e) => (e.id ? (() => { const s = D.findShape(page, e.id); return `${s?.name || String(s?.text ?? '').split('\n')[0] || masterById(s?.master).name[getLanguage()]}${typeof e.pt === 'number' ? ` · ${t('props.point', { n: e.pt + 1 })}` : ` · ${t('props.dynamic')}`}`; })() : t('props.free'));
  return {
    title: t('shape.connector'),
    body: [
      propRow('connectorTool', t('props.from'), propValue(end(connector.from))),
      propRow('connectorTool', t('props.to'), propValue(end(connector.to))),
      propRow('textTool', t('field.text'), `<textarea data-prop="text" rows="2" aria-label="${escapeHtml(t('field.text'))}">${escapeHtml(connector.text ?? '')}</textarea>`, true),
      section('route', 'routeOrtho', t('props.route'), `<div class="prop-buttons">${['routeOrtho', 'routeStraight', 'routeCurved'].map(iconToggle).join('')}<span class="prop-gap"></span>${['reverse', 'clearBends'].map((id) => `<button class="icon-button" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(commands[id].label))}" ${commandEnabled(id) ? '' : 'disabled'}>${icon(commands[id].icon)}</button>`).join('')}</div>${propCheck('lineJumpsShape', connector.style?.lineJumps !== false, t('props.jumpsHere'))}`),
      section('arrows', 'arrowEnd', t('props.arrows'), [
        propRow('arrowStart', t('props.startArrow'), propSelect('startArrow', ARROWS.map((a) => [a, t(`arrow.${a}`)]), style.startArrow, t('props.startArrow'))),
        propRow('arrowEnd', t('props.endArrow'), propSelect('endArrow', ARROWS.map((a) => [a, t(`arrow.${a}`)]), style.endArrow, t('props.endArrow'))),
        propRow('zoomIn', t('props.arrowSize'), propSelect('arrowSize', [0.6, 0.8, 1, 1.3, 1.6, 2].map((s) => [s, `${Math.round(s * 100)}%`]), style.arrowSize ?? 1, t('props.arrowSize'))),
      ].join('')),
      lineSection(style, { rounding: false }), textSection(style, { valign: false }), dataSection(connector), layersSection(connector), commentsSection(connector),
    ].join(''),
  };
}

function multiProps(shapes) {
  const two = shapes.filter((s) => !D.isConnector(s) && !D.isGroup(s));
  const style = two.length ? resolveShapeStyle(activeTab().doc, two[0]) : resolveConnectorStyle(activeTab().doc, shapes[0]);
  const box = unionBounds(shapes.map((s) => (D.isConnector(s) ? null : shapeBounds(s))));
  const u = unitsOf();
  return {
    title: t('props.multi', { count: shapes.length }),
    body: [
      box ? propRow('sameSize', t('props.selectionSize'), propValue(`${D.formatLength(box.w, u)} × ${D.formatLength(box.h, u)}`)) : '',
      `<div class="prop-buttons wrap">${['alignLeft', 'alignCenter', 'alignRight', 'alignTop', 'alignMiddle', 'alignBottom', 'distributeH', 'distributeV', 'sameSize', 'group', 'bringFront', 'sendBack'].map((id) => `<button class="icon-button" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(commands[id].label))}" ${commandEnabled(id) ? '' : 'disabled'}>${icon(commands[id].icon)}</button>`).join('')}</div>`,
      two.length ? quickSection(two) : '', two.length ? fillSection(style) : '', lineSection(style), textSection(style),
    ].join(''),
  };
}

function pageProps() {
  const tab = activeTab();
  const doc = tab.doc;
  const page = tab.page;
  const u = doc.units;
  const lang = getLanguage();
  const backgrounds = doc.pages.filter((p) => p.background && p.id !== page.id);
  return {
    title: `${t('props.page')}: ${page.name}`,
    body: [
      section('pageProps', 'pageSetup', t('props.page'), [
        propRow('edit', t('page.name'), propInput('pageName', page.name, t('page.name'))),
        propRow('pageSetup', t('page.paper'), propSelect('paper', [...Object.keys(D.PAGE_SIZES).map((p) => [p, p]), ['custom', t('page.custom')]], page.paper ?? 'custom', t('page.paper'))),
        propRow('rotateRight', t('page.orientation'), `<span class="segmented">${['portrait', 'landscape'].map((o) => `<button class="segment ${page.orientation === o ? 'active' : ''}" data-page-orientation="${o}" title="${escapeHtml(t(`page.${o}`))}">${escapeHtml(t(`page.${o}`))}</button>`).join('')}</span>`),
        `<div class="prop-grid2">${propRow('sameSize', t('field.width'), propInput('pageWidth', D.formatLength(page.width, u), t('field.width')))}${propRow('sameSize', t('field.height'), propInput('pageHeight', D.formatLength(page.height, u), t('field.height')))}</div>`,
        propCheck('autoSize', Boolean(page.autoSize), t('action.autoSize')),
        propCheck('pageGrid', page.grid !== false, t('page.showGrid')),
        propCheck('isBackground', Boolean(page.background), t('page.backgroundPage')),
        page.background ? '' : propRow('pageBg', t('page.background'), propSelect('backgroundId', [['', t('page.noBackground')], ...backgrounds.map((p) => [p.id, p.name])], page.backgroundId ?? '', t('page.background'))),
        propRow('fillColor', t('page.color'), colorButton('pageColor', page.color || designById(doc.design).page, t('page.color'))),
        `<div class="prop-actions"><button class="small-button" data-command="pageSetup" title="${escapeHtml(commandTip('pageSetup'))}">${icon('pageSetup')}<span>${escapeHtml(t('props.more'))}</span></button><button class="small-button" data-command="pageNew" title="${escapeHtml(commandTip('pageNew'))}">${icon('pageAdd')}<span>${escapeHtml(t('toolShort.pageNew'))}</span></button></div>`,
      ].join('')),
      section('docProps', 'design', t('props.drawing'), [
        propRow('edit', t('doc.title'), propInput('docTitle', doc.title, t('doc.title'))),
        propRow('design', t('props.design'), propSelect('design', DESIGNS.map((d) => [d.id, d.name[lang]]), doc.design, t('props.design'))),
        `<div class="variant-row">${[0, 1, 2, 3].map((v) => `<button class="variant-chip ${doc.variant === v ? 'active' : ''}" data-variant="${v}" title="${escapeHtml(t('props.variant', { n: v + 1 }))}">${variantColors(doc.design, v).slice(0, 4).map((c) => `<i style="background:${c}"></i>`).join('')}</button>`).join('')}</div>`,
        propRow('rulers', t('doc.units'), propSelect('units', D.UNITS.map((x) => [x, t(`unit.${x}`)]), u, t('doc.units'))),
        propRow('routeOrtho', t('doc.route'), propSelect('route', D.ROUTES.map((r) => [r, t(`route.${r}`)]), doc.options.connectorRoute ?? 'orthogonal', t('doc.route'))),
        `<div class="prop-buttons">${['lineJumps', 'avoidShapes', 'glue', 'dataGraphics'].map(iconToggle).join('')}</div>`,
        `<div class="prop-actions"><button class="small-button" data-command="design" title="${escapeHtml(commandTip('design'))}">${icon('design')}<span>${escapeHtml(t('toolShort.design'))}</span></button><button class="small-button" data-command="docProps" title="${escapeHtml(commandTip('docProps'))}">${icon('docProps')}<span>${escapeHtml(t('toolShort.docProps'))}</span></button></div>`,
      ].join('')),
      section('layers', 'layerProps', t('props.layers'), [
        page.layers.map((layer) => `<div class="layer-row" title="${escapeHtml(layer.name)}">
          <button class="icon-button ${layer.visible ? 'active' : ''}" data-layer-toggle="visible:${layer.id}" title="${escapeHtml(t('layer.visible'))}" aria-label="${escapeHtml(t('layer.visible'))}">${icon(layer.visible ? 'eye' : 'close')}</button>
          <button class="icon-button ${layer.locked ? 'active' : ''}" data-layer-toggle="locked:${layer.id}" title="${escapeHtml(t('layer.locked'))}" aria-label="${escapeHtml(t('layer.locked'))}">${icon('lock')}</button>
          <span class="layer-name ${page.activeLayer === layer.id ? 'active' : ''}">${escapeHtml(layer.name)}</span><small class="muted">${page.shapes.filter((s) => s.layers?.includes(layer.id)).length}</small></div>`).join('') || `<p class="panel-hint">${escapeHtml(t('props.noLayers'))}</p>`,
        `<div class="prop-actions"><button class="small-button" data-command="layers" title="${escapeHtml(commandTip('layers'))}">${icon('layerProps')}<span>${escapeHtml(t('toolShort.layers'))}</span></button></div>`,
      ].join('')),
      commentsSection(page, true),
      `<div class="props-stats muted">${escapeHtml(t('props.stats', { shapes: page.shapes.filter((s) => !D.isConnector(s) && !D.isGroup(s)).length, connectors: page.shapes.filter(D.isConnector).length, pages: doc.pages.length }))}</div>`,
      `<p class="panel-hint">${escapeHtml(t('props.hint'))}</p>`,
    ].join(''),
  };
}

function designById(id) { return DESIGNS.find((d) => d.id === id) ?? DESIGNS[0]; }

/** A property edited in the right panel. */
function onProp(target) {
  const key = target.dataset.prop;
  const value = target.value;
  const tab = activeTab();
  if (!tab) return;
  const ids = selectedIds();
  try {
    switch (key) {
      case 'name': return change('op.name', (doc, page) => ids.forEach((id) => { const s = D.findShape(page, id); if (s) s.name = value; }));
      case 'text': return ids.length === 1 ? setShapeText(ids[0], value) : undefined;
      case 'x': case 'y': case 'w': case 'h': {
        const px = D.parseLength(value, unitsOf());
        if (px == null) throw new Error(t('field.badNumber'));
        return change('op.resize', (doc, page) => { const s = D.findShape(page, ids[0]); D.setBox(page, s.id, { x: s.x, y: s.y, w: s.w, h: s.h, [key]: key === 'w' || key === 'h' ? Math.max(1, px) : px }); });
      }
      case 'angle': { const a = Number(String(value).replace(/[^\d.+-]/g, '')); if (!Number.isFinite(a)) throw new Error(t('field.badNumber')); return change('op.rotate', (doc, page) => D.setAngle(page, ids, a)); }
      case 'fillPattern': return setStyle(value === 'none' ? { fillPattern: 'none' } : { fillPattern: value, ...(selected2D()[0] && resolveShapeStyle(tab.doc, selected2D()[0]).fill === 'none' ? { fill: lastColors.fill } : {}) });
      case 'lineWidth': case 'fontSize': case 'rounding': case 'arrowSize': case 'textAngle': return setStyle({ [key]: Number(value) });
      case 'dash': case 'font': case 'startArrow': case 'endArrow': return setStyle({ [key]: value });
      case 'hyperlink': return change('op.link', (doc, page) => ids.forEach((id) => { const s = D.findShape(page, id); if (s) s.hyperlink = value.trim(); }));
      case 'pageName': return value.trim() ? renamePage(tab.view.pageId, value.trim()) : undefined;
      case 'paper': return change('op.pageSetup', (doc, page) => { if (value !== 'custom') { Object.assign(page, D.paperSize(value, page.orientation), { paper: value }); } else page.paper = 'custom'; });
      case 'pageWidth': case 'pageHeight': {
        const px = D.parseLength(value, unitsOf());
        if (px == null || px < 20) throw new Error(t('field.badNumber'));
        return change('op.pageSetup', (doc, page) => { page[key === 'pageWidth' ? 'width' : 'height'] = px; page.paper = 'custom'; });
      }
      case 'backgroundId': return setBackgroundPage(value || null);
      case 'docTitle': return change('op.docProps', (doc) => { doc.title = value; });
      case 'design': return change('op.design', (doc) => { doc.design = value; });
      case 'units': return change('op.docProps', (doc) => { doc.units = value; });
      case 'route': return change('op.route', (doc) => { doc.options.connectorRoute = value; });
      default: return undefined;
    }
  } catch (error) {
    return showError('error.input', error, key);
  }
}

// ───────────────────────── status bar

function renderStatus() {
  const bar = root.querySelector('#statusbar');
  if (!bar) return;
  const tab = activeTab();
  const s = state.settings;
  const notice = state.notice;
  const items = [];
  items.push(`<span class="status-notice ${notice?.kind ?? ''}" title="${escapeHtml(notice?.text ?? t('status.ready'))}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(notice?.text ?? t('status.ready'))}</span></span>`);
  if (tab && !state.showStart) {
    const doc = tab.doc;
    const page = tab.page;
    const index = doc.pages.indexOf(page);
    const u = doc.units;
    items.push(`<button class="status-item" data-command="goToPage" title="${escapeHtml(t('status.pageTip'))}">${icon('pageSetup')}<span>${escapeHtml(t('status.page', { n: index + 1, total: doc.pages.length }))}</span></button>`);
    items.push(`<span class="status-item ${tab.dirty ? 'modified' : 'saved'}" title="${escapeHtml(tab.path ?? t('status.unsavedFile'))}">${icon(tab.dirty ? 'edit' : 'save')}<span>${escapeHtml(tab.dirty ? t('status.modified') : t('status.saved'))}</span></span>`);
    const shapes = selectedShapes();
    if (shapes.length === 1 && !D.isConnector(shapes[0])) {
      const sh = shapes[0];
      items.push(`<span class="status-item" title="${escapeHtml(t('status.sizeTip'))}">${icon('sameSize')}<span>${escapeHtml(`${t('status.w')} ${D.formatLength(sh.w, u)} · ${t('status.h')} ${D.formatLength(sh.h, u)} · ${t('status.angle')} ${Math.round(sh.angle ?? 0)}°`)}</span></span>`);
    } else if (shapes.length) items.push(`<span class="status-item" title="${escapeHtml(t('status.selectedTip'))}">${icon('selectAll')}<span>${escapeHtml(t('status.selected', { count: shapes.length }))}</span></span>`);
    else items.push(`<span class="status-item" title="${escapeHtml(t('status.shapesTip'))}">${icon('stBasic')}<span>${escapeHtml(t('status.shapes', { count: page.shapes.filter((x) => !D.isGroup(x)).length }))}</span></span>`);
    if (state.pointer) items.push(`<span class="status-item pointer-pos" title="${escapeHtml(t('status.pointerTip'))}">${icon('position')}<span id="status-pointer">${escapeHtml(`${D.formatLength(state.pointer.x, u)}, ${D.formatLength(state.pointer.y, u)}`)}</span></span>`);
    if (state.tool !== 'pointer') items.push(`<button class="status-item warn" data-command="tool:pointer" title="${escapeHtml(t('status.toolTip'))}">${icon(TOOL_ICONS[state.tool])}<span>${escapeHtml(t(`tool.${state.tool}`))}</span></button>`);
  }
  items.push(`<span class="status-item" title="${escapeHtml(t('status.theme', { name: themeName(s.theme, getLanguage()) }))}">${icon('palette')}<span>${escapeHtml(themeName(s.theme, getLanguage()))}</span></span>`);
  items.push(`<span class="status-item" title="${escapeHtml(t('status.language'))}">${icon('globe')}<span>${escapeHtml(t('status.language'))}</span></span>`);
  if (tab && !state.showStart) {
    const z = zoomPercent();
    const steps = CANVAS_ZOOM.steps;
    items.push(`<label class="status-item zoom-slider" title="${escapeHtml(t('status.zoomTip'))}">${icon('zoomIn')}<input type="range" id="zoom-slider" min="0" max="${steps.length - 1}" step="1" value="${Math.max(0, steps.findIndex((v) => v >= z))}" aria-label="${escapeHtml(t('status.zoomTip'))}" /><span id="status-zoom">${z}%</span></label>`);
    items.push(`<button class="status-item" data-command="fitPage" title="${escapeHtml(commandTip('fitPage'))}">${icon('fitPage')}</button>`);
  }
  if (s.statusClock) items.push(`<span class="status-item clock" title="${escapeHtml(t('status.clock'))}">${icon('clock')}<span id="status-clock">${escapeHtml(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span></span>`);
  bar.innerHTML = items.join('');
}

/** Pointer position on the page (rulers and status bar). */
function pointerAt(p) {
  state.pointer = p;
  state.view?.setPointer?.(p);
  const el = root.querySelector('#status-pointer');
  if (el) el.textContent = `${D.formatLength(p.x, unitsOf())}, ${D.formatLength(p.y, unitsOf())}`;
  else if (!pointerAt.pending) { pointerAt.pending = true; requestAnimationFrame(() => { pointerAt.pending = false; renderStatus(); }); }
}

function renderAll() {
  root.classList.toggle('no-status', !state.settings.showStatusBar);
  root.classList.toggle('no-left', !state.settings.showLeftPanel);
  root.classList.toggle('no-right', !state.settings.showRightPanel);
  root.style.setProperty('--left-width', `${state.settings.leftWidth}px`);
  root.style.setProperty('--right-width', `${state.settings.rightWidth}px`);
  root.style.setProperty('--zoom', String(state.settings.zoom / 100));
  root.style.setProperty('--row-height', `${rowHeight()}px`);
  root.dataset.tool = state.tool;
  renderMenubar();
  if (toolbarLanguage !== getLanguage()) renderToolbar(); else renderToolbarState();
  renderDocTitle();
  renderLeft();
  renderView();
  renderRight();
  renderStatus();
  updateBackgroundState();
}

// ───────────────────────── start page

function renderStartPage() {
  const host = root.querySelector('#start-page');
  host.innerHTML = startPageHtml(appApi);
  const canvas = host.querySelector('.start-bg');
  startBackground?.destroy();
  startBackground = new AnimatedBackground(canvas, { colors: backgroundColors, speed: () => state.settings.animationSpeed / 100, kind: state.settings.animation, vivid: true });
  if (state.settings.backgroundKind === 'animated') startBackground.start();
  else startBackground.draw();
  canvas.classList.toggle('static', state.settings.backgroundKind !== 'animated');
  host.querySelector('.start-scroll').style.setProperty('--start-image', state.backgroundUrl && state.settings.backgroundKind === 'image' ? `url("${state.backgroundUrl}")` : 'none');
  host.classList.toggle('with-image', Boolean(state.backgroundUrl) && state.settings.backgroundKind === 'image');
}

function showStartPage(show = true) {
  state.view?.finishTextEdit?.();
  state.showStart = show;
  state.reader = null;
  if (show) { state.view?.destroy?.(); state.view = null; } else mountView();
  renderAll();
}

async function onStartAction(target) {
  const value = target.dataset.value;
  switch (target.dataset.start) {
    case 'template': return newDrawing(value);
    case 'open': return openWithDialog();
    case 'import': return openWithDialog();
    case 'open-recent': return openRecent(value);
    case 'remove-recent': state.recent = removeRecent(state.recent, value); storeRecent(globalThis.localStorage, state.recent); return renderStartPage();
    case 'clear-recent': state.recent = []; storeRecent(globalThis.localStorage, []); notify('success', t('notice.recentCleared')); return renderStartPage();
    case 'open-folder': return openWithDialog(value);
    case 'remove-folder': state.recentDirs = removeRecent(state.recentDirs, value); storeRecentDirs(globalThis.localStorage, state.recentDirs); return renderStartPage();
    case 'clear-folders': state.recentDirs = []; storeRecentDirs(globalThis.localStorage, []); return renderStartPage();
    case 'open-sample': return openPath(value);
    case 'builtin-sample': return openSampleBuiltin();
    case 'tutorial': return startTutorial();
    case 'guide': return openUserGuide();
    case 'tutorial-doc': return openReader('tutorial');
    case 'shortcuts': return run('shortcuts');
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
  appBackground.speed = () => state.settings.animationSpeed / 100;
  appBackground.setKind(s.animation);
  if (startBackground && startBackground.kind !== s.animation) startBackgroundChangedAt = Date.now();
  startBackground?.setKind(s.animation);
  const showStart = state.showStart || !activeTab();
  const animated = s.backgroundKind === 'animated' && !showStart && !s.animationOnStartOnly && s.backgroundOpacity > 0;
  layer.classList.toggle('animated', animated);
  layer.classList.toggle('image', s.backgroundKind === 'image' && Boolean(state.backgroundUrl));
  layer.style.setProperty('--bg-opacity', String(s.backgroundOpacity / 100));
  const image = layer.querySelector('.image-bg');
  const fit = s.backgroundFit;
  image.style.backgroundImage = state.backgroundUrl && s.backgroundKind === 'image' ? `url("${state.backgroundUrl}")` : 'none';
  image.style.backgroundSize = { cover: 'cover', contain: 'contain', tile: 'auto', center: 'auto', stretch: '100% 100%' }[fit];
  image.style.backgroundRepeat = fit === 'tile' ? 'repeat' : 'no-repeat';
  if (animated) appBackground.start(); else appBackground.stop();
  if (showStart && startBackground) {
    if (s.backgroundKind === 'animated') startBackground.start(); else { startBackground.stop(); startBackground.draw(); }
  }
}

let startBackgroundChangedAt = Date.now();

function randomAnimation(current) {
  const others = ANIMATIONS.filter((kind) => kind !== current);
  return others[Math.floor(Math.random() * others.length)];
}

function rotateStartBackground() {
  startBackgroundChangedAt = Date.now();
  const next = randomAnimation(state.settings.animation);
  const canvas = root.querySelector('#start-page .start-bg');
  if (!canvas) return updateSettings({ animation: next }, { quiet: true });
  canvas.classList.add('fading');
  setTimeout(() => {
    updateSettings({ animation: next }, { quiet: true });
    root.querySelector('#start-page .start-bg')?.classList.remove('fading');
  }, 450);
  return undefined;
}

function tickStartBackground() {
  const s = state.settings;
  const showing = (state.showStart || !activeTab()) && s.backgroundKind === 'animated' && s.animationInterval > 0 && !document.hidden && !tutorial?.state().active;
  if (!showing) { startBackgroundChangedAt = Date.now(); return; }
  if (Date.now() - startBackgroundChangedAt >= s.animationInterval * 1000) rotateStartBackground();
}

function shuffleBackground() {
  const next = (startBackground ?? appBackground)?.shuffle() ?? 'aurora';
  updateSettings({ animation: next, backgroundKind: 'animated' });
  notify('info', t('notice.animation', { name: t(`animation.${next}`) }));
}

async function loadBackground() {
  try {
    state.backgroundUrl = await native.backgroundUrl(state.settings);
  } catch (error) {
    state.backgroundUrl = null;
    showError('error.background', error);
  }
  updateBackgroundState();
  if (state.showStart || !activeTab()) renderStartPage();
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
  rememberDirectory(directoryOf(path));
  updateSettings({ backgroundImage: stored, backgroundName: baseName(path), backgroundKind: 'image', lastDirectory: directoryOf(path) || state.settings.lastDirectory });
  await loadBackground();
  notify('success', t('notice.background'));
}

async function setBackgroundFromFile(file) {
  await withProgress('progress.background', file.name, async () => native.storeWebBackground(file));
  updateSettings({ backgroundImage: `web:${file.name}:${Date.now()}`, backgroundName: file.name, backgroundKind: 'image' });
  await loadBackground();
  notify('success', t('notice.background'));
}

async function removeBackground() {
  await native.clearBackground();
  state.backgroundUrl = null;
  updateSettings({ backgroundImage: null, backgroundName: '', backgroundKind: state.settings.backgroundKind === 'image' ? 'animated' : 'none' });
  notify('success', t('notice.backgroundCleared'));
}

// ───────────────────────── settings, theme

function updateSettings(patch, { quiet = false } = {}) {
  const previous = state.settings;
  state.settings = { ...state.settings, ...patch };
  storeSettings(globalThis.localStorage, state.settings);
  if (quiet) return;
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
  const needsRemount = ['zoom', 'rowHeight', 'language'].some((key) => s[key] !== previous[key]);
  if (needsRemount && !state.showStart) mountView();
  renderAll();
  updateMinimumWidth();
}

async function openThemePicker(anchor) {
  const element = root.querySelector('.split-button [data-command="themeMenu"]')?.closest('.split-button') ?? root.querySelector('[data-command="themeMenu"]');
  const result = await popups.open('theme', { current: state.settings.theme }, { anchor: anchor ?? anchorBelow(element) });
  if (result?.theme) updateSettings({ theme: result.theme });
}

// ───────────────────────── progress

async function withProgress(titleKey, name, task) {
  const op = D.newId('op');
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
      setTimeout(() => popups.close('progress'), 300);
    }
  }
}

// ───────────────────────── files

const findOpenDoc = (path) => state.docs.find((doc) => doc.path && doc.path.replace(/\\/g, '/').toLowerCase() === path.replace(/\\/g, '/').toLowerCase());

function rememberRecent(entry) {
  state.recent = addRecent(state.recent, entry);
  storeRecent(globalThis.localStorage, state.recent);
  if (!entry.web) rememberDirectory(directoryOf(entry.path));
}

function rememberDirectory(dir) {
  if (!dir) return;
  state.recentDirs = addRecent(state.recentDirs, { path: dir });
  storeRecentDirs(globalThis.localStorage, state.recentDirs);
  if (state.settings.lastDirectory !== dir) updateSettings({ lastDirectory: dir }, { quiet: true });
}

/** A drawing from file contents by its type: .mdg/.mdgt/.json text, or Visio bytes. */
async function parseAny(name, content) {
  if (isVsdxFileName(name) || (content instanceof Uint8Array && content[0] === 0x50 && content[1] === 0x4b)) {
    const bytes = content instanceof Uint8Array ? content : new TextEncoder().encode(content);
    const doc = await importVsdx(bytes, { language: getLanguage(), title: stripExtension(name) });
    return { doc, template: ['vstx'].includes(extensionOf(name)), imported: true };
  }
  const text = content instanceof Uint8Array ? new TextDecoder().decode(content) : content;
  const parsed = parseDiagram(text, getLanguage());
  return { doc: parsed.doc, template: parsed.template || isTemplateFileName(name), imported: false };
}

async function openPath(path, { quiet = false } = {}) {
  const name = baseName(path);
  if (isImageFileName(name) && !isSvgFileName(name)) return insertPictureFromPath(path);
  if (isSvgFileName(name)) return insertPictureFromPath(path);
  if (isCsvFileName(name)) return openImport('link', { path });
  const existing = findOpenDoc(path);
  if (existing) {
    activateDoc(existing.id);
    if (!quiet) notify('info', t('notice.alreadyOpen', { name }));
    return existing;
  }
  try {
    const content = isVsdxFileName(name)
      ? base64ToBytes(await withProgress('progress.open', name, (op) => native.readBase64File(path, op)))
      : await withProgress('progress.open', name, (op) => native.readTextFile(path, op));
    const { doc, template, imported } = await parseAny(name, content);
    const tab = new DiagramDocument(doc, { path: template || imported ? null : path, name: template || imported ? doc.title : null, template });
    if (imported) tab.saved = '';
    addTab(tab, { view: 'drawing' });
    rememberRecent({ path, title: doc.title });
    if (!quiet) notify('success', t(imported ? 'notice.imported' : 'notice.opened', { name }));
    return tab;
  } catch (error) {
    showError('error.open', error, path);
    return null;
  }
}

async function openContent(name, content, handle = null) {
  try {
    const { doc, template, imported } = await parseAny(name, content);
    const tab = new DiagramDocument(doc, { name: template || imported ? doc.title : name, handle: template || imported ? null : handle, template });
    if (imported) tab.saved = '';
    addTab(tab, { view: 'drawing' });
    rememberRecent({ path: name, title: doc.title, web: true });
    notify('success', t(imported ? 'notice.imported' : 'notice.opened', { name }));
    return tab;
  } catch (error) {
    showError('error.open', error, name);
    return null;
  }
}

async function openWithDialog(directory = null) {
  try {
    if (desktop) {
      const paths = await native.chooseDiagramsToOpen(directory ?? state.settings.lastDirectory);
      for (const path of paths) await openPath(path);
    } else {
      const files = await native.pickDiagramFilesWeb();
      for (const file of files) await openContent(file.name, file.content, file.handle);
    }
  } catch (error) {
    showError('error.open', error);
  }
}

async function openRecent(path) {
  const item = state.recent.find((entry) => entry.path === path);
  if (item?.web || !desktop) {
    const handle = await native.loadWebHandle(path);
    if (handle?.getFile) {
      try {
        if ((await handle.queryPermission?.({ mode: 'read' })) !== 'granted') await handle.requestPermission?.({ mode: 'read' });
        const file = await handle.getFile();
        return openContent(file.name, isVsdxFileName(file.name) ? new Uint8Array(await file.arrayBuffer()) : await file.text(), handle);
      } catch (error) {
        return showError('error.open', error, path);
      }
    }
    return notify('info', t('notice.webRecent'));
  }
  const [exists] = await native.pathsExist([path]);
  if (!exists) {
    const choice = await ask({
      icon: 'warning', title: t('recent.missingTitle'), message: t('recent.missingMessage', { path }),
      buttons: [{ id: 'keep', label: t('recent.keep') }, { id: 'remove', label: t('recent.removeEntry'), icon: 'trash', primary: true }],
    });
    if (choice === 'remove') { state.recent = removeRecent(state.recent, path); storeRecent(globalThis.localStorage, state.recent); renderAll(); }
    return null;
  }
  return openPath(path);
}

function clearRecentAll() {
  state.recent = [];
  state.recentDirs = [];
  storeRecent(globalThis.localStorage, []);
  storeRecentDirs(globalThis.localStorage, []);
  notify('success', t('notice.recentCleared'));
  renderAll();
}

async function recentFoldersMenu(anchor) {
  const items = state.recentDirs.length
    ? state.recentDirs.map((item, index) => ({ id: `custom:dir:${index}`, label: item.path, icon: 'folder' }))
    : [{ id: 'none', label: t('recent.noFolders'), icon: 'info', disabled: true }];
  const handlers = Object.fromEntries(state.recentDirs.map((item, index) => [`custom:dir:${index}`, () => openWithDialog(item.path)]));
  return showMenu(items, anchor ?? anchorBelow(root.querySelector('[data-menu="file"]')), 'context', { handlers, header: { icon: 'recentFolder', title: t('action.recentFolders') } });
}

const safeName = (tab) => (tab.path ? stripExtension(baseName(tab.path)) : tab.doc.title || 'drawing').replace(/[\\/:*?"<>|]/g, '_');

/** Saves a drawing. Drawings from a template, imports and new drawings ask for a file name. */
async function saveDoc(tab, { saveAs = false } = {}) {
  if (!tab) return false;
  state.view?.finishTextEdit?.();
  const text = tab.text();
  const suggested = `${safeName(tab)}.mdg`;
  try {
    if (desktop) {
      let path = tab.path;
      if (!path || saveAs || extensionOf(path) !== 'mdg') {
        const dir = tab.path ? directoryOf(tab.path) : state.settings.lastDirectory;
        path = await native.chooseSavePath(dir ? `${dir}/${suggested}` : suggested, ['mdg']);
        if (!path) return false;
        path = withExtension(path, 'mdg');
      }
      await withProgress('progress.save', baseName(path), (op) => native.writeTextFile(path, text, op));
      tab.markSaved(path);
      tab.name = null;
      rememberRecent({ path, title: tab.doc.title });
    } else {
      const saved = await native.saveFileWeb(text, { name: suggested, handle: tab.handle, saveAs: saveAs || !tab.handle });
      if (!saved) return false;
      tab.handle = saved.handle;
      tab.name = saved.name;
      tab.markSaved(null);
      if (saved.handle) native.storeWebHandle(saved.name, saved.handle);
      rememberRecent({ path: saved.name, title: tab.doc.title, web: true });
    }
    persistSession();
    renderAll();
    if (dbActive()) {
      const stored = await saveToDatabase(tab, { quiet: true });
      if (stored) notify('success', t('notice.savedBoth', { name: docName(tab), where: dbDescribe(state.settings) }));
      return stored;
    }
    notify('success', t('notice.saved', { name: docName(tab) }));
    return true;
  } catch (error) {
    showError('error.save', error, tab.path ?? docName(tab));
    return false;
  }
}

async function saveAll() {
  for (const tab of state.docs.filter((item) => item.dirty)) {
    activateDoc(tab.id);
    if (!(await saveDoc(tab))) return false;
  }
  return true;
}

// ───────────────────────── drawings in a database (desktop; Settings › Database)

let dbSessionPassword = '';
const dbActive = () => desktop && Boolean(state.settings.dbKind) && state.settings.dbKind !== 'none';

function dbReady() {
  const settings = loadSettings(globalThis.localStorage);
  const problems = dbProblems(settings);
  if (problems.length) {
    notify('info', `${t('notice.dbSetup')} (${problems.map((code) => t(code)).join(' · ')})`);
    popups.open('settings', { tab: 'database' });
    return null;
  }
  return { config: dbConfig(settings, dbSessionPassword), where: dbDescribe(settings) };
}

async function saveToDatabase(tab, { quiet = false } = {}) {
  if (!tab || !desktop) return false;
  const db = dbReady();
  if (!db) return false;
  try {
    const id = tab.dbId ?? tab.doc.id ?? D.newId('dgm');
    const text = tab.text();
    await withProgress('progress.dbSave', db.where, () => native.dbSave(db.config, { id, title: tab.doc.title || docName(tab), data: text }));
    tab.dbId = id;
    if (!tab.path) { tab.name = tab.name ?? tab.doc.title; tab.markSaved(null); }
    persistSession();
    renderAll();
    if (!quiet) notify('success', t('notice.dbSaved', { name: docName(tab), where: db.where }));
    return true;
  } catch (error) {
    showError('error.dbSave', error, db.where);
    return false;
  }
}

const dbList = (db) => withProgress('progress.dbList', db.where, () => native.dbList(db.config));

async function openFromDatabase() {
  if (!desktop) return;
  const db = dbReady();
  if (!db) return;
  let items;
  try { items = await dbList(db); } catch (error) { showError('error.dbOpen', error, db.where); return; }
  const result = await popups.open('database', { items, where: db.where });
  if (result?.action === 'open' && result.id) await openDatabaseDrawing(result.id);
}

async function openDatabaseDrawing(id) {
  const existing = state.docs.find((doc) => doc.dbId === id);
  if (existing) { activateDoc(existing.id); notify('info', t('notice.alreadyOpen', { name: docName(existing) })); return existing; }
  const db = dbReady();
  if (!db) return null;
  try {
    const row = await withProgress('progress.dbLoad', db.where, () => native.dbLoad(db.config, id));
    if (!row) { notify('error', t('notice.dbMissing', { name: id })); return null; }
    const { doc } = await parseAny(`${row.title || 'drawing'}.mdg`, row.data);
    const tab = new DiagramDocument(doc, { name: row.title || doc.title });
    tab.dbId = id;
    addTab(tab, { view: 'drawing' });
    notify('success', t('notice.dbOpened', { name: docName(tab) }));
    return tab;
  } catch (error) {
    showError('error.dbOpen', error, db.where);
    return null;
  }
}

async function deleteDatabaseDrawing(id, title) {
  const db = dbReady();
  if (!db) return;
  const choice = await ask({ icon: 'warning', title: t('db.deleteTitle'), message: t('db.deleteMessage', { name: title || id }), buttons: [{ id: 'cancel', label: t('common.cancel') }, { id: 'delete', label: t('db.delete'), icon: 'trash', primary: true }] });
  if (choice !== 'delete') return;
  try {
    await native.dbDelete(db.config, id);
    for (const doc of state.docs) if (doc.dbId === id) doc.dbId = null;
    notify('success', t('notice.dbDeleted', { name: title || id }));
    popups.post('database', { type: 'db-list', items: await dbList(db) });
  } catch (error) {
    showError('error.dbOpen', error, db.where);
  }
}

async function testDatabase(password, kind) {
  const settings = loadSettings(globalThis.localStorage);
  const problems = dbProblems(settings);
  if (problems.length) return popups.post(kind, { type: 'db-result', ok: false, text: problems.map((code) => t(code)).join(' · ') });
  try {
    const version = await native.dbTest(dbConfig(settings, password || dbSessionPassword));
    if (password && !settings.dbSavePassword) dbSessionPassword = password;
    return popups.post(kind, { type: 'db-result', ok: true, text: t('db.testOk', { version }) });
  } catch (error) {
    return popups.post(kind, { type: 'db-result', ok: false, text: native.errorText(error) });
  }
}

async function chooseDatabaseFile() {
  const settings = loadSettings(globalThis.localStorage);
  const fallback = state.settings.lastDirectory ? `${state.settings.lastDirectory}/mydiagram.db` : 'mydiagram.db';
  const file = await native.chooseDatabaseFile(settings.dbFile || fallback);
  if (file) updateSettings({ dbFile: file });
}

// ───────────────────────── export

const MIMES = { mdgt: 'application/json', vsdx: 'application/vnd.ms-visio.drawing', svg: 'image/svg+xml', html: 'text/html', csv: 'text/csv', pdf: 'application/pdf' };

/** Writes content (text or bytes) to a file the user picks. */
async function saveExport(name, type, content) {
  if (desktop) {
    const dir = state.settings.lastDirectory;
    let path = await native.chooseSavePath(dir ? `${dir}/${name}` : name, [type]);
    if (!path) return false;
    if (!(native.SAVE_TYPES[type]?.extensions ?? [type]).includes(extensionOf(path))) path = withExtension(path, type);
    if (typeof content === 'string') await withProgress('progress.export', baseName(path), (op) => native.writeTextFile(path, content, op));
    else {
      const bytes = content instanceof Blob ? new Uint8Array(await content.arrayBuffer()) : content;
      await withProgress('progress.export', baseName(path), (op) => native.writeBase64File(path, bytesToBase64(bytes), op));
    }
    rememberDirectory(directoryOf(path));
    notify('success', t('notice.exported', { name: baseName(path) }));
    return true;
  }
  const saved = await native.saveFileWeb(content instanceof Uint8Array ? new Blob([content], { type: MIMES[type] }) : content, { name, saveAs: true, mime: MIMES[type] ?? 'application/octet-stream' });
  if (saved) notify('success', t('notice.exported', { name: saved.name }));
  return Boolean(saved);
}

/** Template, Visio, SVG (current page), HTML (all pages) or CSV (shape data). */
async function exportAs(type) {
  const tab = activeTab();
  if (!tab) return;
  state.view?.finishTextEdit?.();
  const name = `${safeName(tab)}${type === 'svg' && tab.doc.pages.length > 1 ? ` - ${tab.page.name.replace(/[\\/:*?"<>|]/g, '_')}` : ''}.${type}`;
  try {
    let content;
    if (type === 'mdgt') content = tab.text({ template: true });
    else if (type === 'vsdx') content = await withProgress('progress.export', name, async () => exportVsdx(tab.doc));
    else if (type === 'svg') content = renderPageSvg(tab.doc, tab.page, { area: 'content', measure, routes: tab.routes(), language: getLanguage() }).svg;
    else if (type === 'html') content = exportHtml(tab.doc, { measure, language: getLanguage() });
    else if (type === 'csv') content = exportShapeDataCsv(tab.doc, { language: getLanguage() });
    await saveExport(name, type, content);
  } catch (error) {
    showError('error.export', error, name);
  }
}

const IMAGE_CHOICE_KEY = 'mydiagram.imageExport';

/** The current page (or the selection, or the shapes only) as PNG, JPEG, WebP, BMP, TIFF or SVG. */
async function exportImage(options) {
  const tab = activeTab();
  if (!tab) return;
  const drawingOf = (area, transparent) => renderPageSvg(tab.doc, tab.page, { area, ids: area === 'selection' ? D.withMembers(tab.page, selectedIds()) : null, transparent, measure, routes: tab.routes(), language: getLanguage() });
  let choice = options;
  if (!choice) {
    let last = null;
    try { last = JSON.parse(localStorage.getItem(IMAGE_CHOICE_KEY) ?? 'null'); } catch { /* none yet */ }
    const areas = ['content', 'page', ...(selectedIds().length ? ['selection'] : [])];
    const sizes = Object.fromEntries(areas.map((area) => { const { width, height } = drawingOf(area, false); return [area, { width, height }]; }));
    choice = await popups.open('image', { sizes, last, areas });
    if (!choice?.format) return;
    try { localStorage.setItem(IMAGE_CHOICE_KEY, JSON.stringify(choice)); } catch { /* private mode */ }
  }
  const format = imageFormat(choice.format);
  const transparent = format.alpha && choice.transparent !== false;
  const name = `${safeName(tab)} - ${tab.page.name.replace(/[\\/:*?"<>|]/g, '_')}.${format.ext}`;
  try {
    const blob = await withProgress('progress.image', name, async (op, report) => {
      report?.({ done: 1, total: 4 });
      const { svg, width, height } = drawingOf(choice.area ?? 'content', transparent);
      if (format.encoder === 'svg') return new Blob([svg], { type: format.mime });
      report?.({ done: 2, total: 4 });
      const canvas = await svgToCanvas(svg, width, height, choice.scale ?? 2, transparent ? null : '#ffffff');
      report?.({ done: 3, total: 4 });
      if (format.encoder === 'canvas') return new Promise((resolve, reject) => canvas.toBlob((b) => (b?.type === format.mime ? resolve(b) : reject(new Error(`${format.mime}: not supported by this system`))), format.mime, (choice.quality ?? 92) / 100));
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const bytes = format.encoder === 'bmp' ? encodeBmp(pixels, canvas.width, canvas.height) : encodeTiff(pixels, canvas.width, canvas.height);
      return new Blob([bytes], { type: format.mime });
    });
    const type = format.ext === 'jpg' ? 'jpg' : format.ext;
    if (desktop) await saveExport(name, type, new Uint8Array(await blob.arrayBuffer()));
    else { await native.saveFileWeb(blob, { name, saveAs: true, mime: format.mime }); notify('success', t('notice.exported', { name })); }
  } catch (error) {
    showError('error.export', error, name);
  }
}

/** An SVG drawn on a canvas at `scale` (pictures inside must be data: URLs). */
async function svgToCanvas(svg, width, height, scale = 2, background = '#ffffff') {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const size = rasterSize(width, height, scale);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (background) { context.fillStyle = background; context.fillRect(0, 0, canvas.width, canvas.height); }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Every foreground page as a PDF page (laid out with the print setup), pictures of the sheets at 150 dpi. */
async function exportPdf() {
  const tab = activeTab();
  if (!tab) return;
  const name = `${safeName(tab)}.pdf`;
  let setup = {};
  try { setup = JSON.parse(globalThis.localStorage?.getItem(PRINT_KEY) ?? '{}'); } catch { setup = {}; }
  try {
    const bytes = await withProgress('progress.pdf', name, async (op, report) => {
      const layout = renderPrintSheets(tab.doc, { ...setup, range: 'all' }, { measure, currentPageId: tab.view.pageId, language: getLanguage(), t });
      const pages = [];
      for (const [index, sheet] of layout.pages.entries()) {
        report?.({ done: index, total: layout.pages.length });
        const canvas = await svgToCanvas(sheet.svg, sheet.width, sheet.height, 150 / 96, '#ffffff');
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height });
      }
      return pdfFromJpegs(pages, { title: tab.doc.title, pageWidth: (layout.paper.width * 72) / 25.4, pageHeight: (layout.paper.height * 72) / 25.4 });
    });
    await saveExport(name, 'pdf', bytes);
  } catch (error) {
    showError('error.export', error, name);
  }
}

// ───────────────────────── report export

const REPORT_FORMATS = {
  html: { mime: 'text/html', text: true },
  md: { mime: 'text/markdown', text: true },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  pdf: { mime: 'application/pdf' },
};

function chooseReportFormat(context = {}) {
  const anchor = context.element ? anchorBelow(context.element) : { ...toScreen(Math.max(0, window.innerWidth / 2 - 140), window.innerHeight / 3), flipY: toScreen(0, window.innerHeight / 3).y };
  return showMenu(menuItems(SUBMENUS.reportExport.items), anchor, 'context', { header: { icon: 'exportReport', title: t('submenu.reportExport') } });
}

async function exportReport(format) {
  const tab = activeTab();
  const spec = REPORT_FORMATS[format];
  if (!tab || !spec) return;
  const model = reportModel(appApi, tab.view.report ?? 'inventory');
  const name = reportFileName(model, format);
  try {
    let path = null;
    if (desktop) {
      const dir = state.settings.lastDirectory;
      path = await native.chooseSavePath(dir ? `${dir}/${name}` : name, [format]);
      if (!path) return;
      path = withExtension(path, format);
    }
    const content = await withProgress('progress.report', path ? baseName(path) : name, async (op, report) => {
      if (format === 'html') return reportToHtml(model);
      if (format === 'md') return reportToMarkdown(model);
      if (format === 'docx') return reportToDocx(model, { images: await chartPngs(model) });
      return reportToPdf(model, { onProgress: (done, total) => report?.({ done, total }) });
    });
    if (desktop) {
      await withProgress('progress.export', baseName(path), (op) => (spec.text ? native.writeTextFile(path, content, op) : native.writeBase64File(path, bytesToBase64(content), op)));
      rememberDirectory(directoryOf(path));
      notify('success', t('notice.exported', { name: baseName(path) }));
    } else {
      const saved = await native.saveFileWeb(new Blob([content], { type: spec.mime }), { name, saveAs: true, mime: spec.mime });
      if (saved) notify('success', t('notice.exported', { name: saved.name }));
    }
  } catch (error) {
    showError('error.export', error, name);
  }
}

// ───────────────────────── pictures

async function imageSize(src) {
  const image = new Image();
  image.src = src;
  try { await image.decode(); } catch { return { width: 200, height: 150 }; }
  return { width: image.naturalWidth || 200, height: image.naturalHeight || 150 };
}

async function addPicture(src, name = '', at = null, replaceId = null) {
  if (!activeTab()) newDrawing();
  ensureDrawingView();
  const size = await imageSize(src);
  const scale = Math.min(1, 420 / size.width, 320 / size.height);
  const w = Math.max(8, size.width * scale);
  const h = Math.max(8, size.height * scale);
  if (replaceId) {
    change('op.picture', (doc, page) => { const shape = D.findShape(page, replaceId); if (shape) shape.src = src; });
    return null;
  }
  const c = at ?? viewCenter();
  const shape = change('op.picture', (doc, page) => D.addShape(page, D.createShape('image', { x: c.x - w / 2, y: c.y - h / 2, w, h, src, name })));
  select([shape.id]);
  notify('success', t('notice.picture', { name }));
  return shape;
}

const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif', ico: 'image/x-icon' };

async function insertPictureFromPath(path, replaceId = null, at = null) {
  try {
    const data = await withProgress('progress.open', baseName(path), (op) => native.readBase64File(path, op));
    rememberDirectory(directoryOf(path));
    return addPicture(`data:${MIME_BY_EXT[extensionOf(path)] ?? 'image/png'};base64,${data}`, stripExtension(baseName(path)), at, replaceId);
  } catch (error) {
    showError('error.picture', error, path);
    return null;
  }
}

async function insertPictureFromFile(file, at = null, replaceId = null) {
  const src = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
  return addPicture(src, stripExtension(file.name), at, replaceId);
}

async function insertPicture(replaceId = null) {
  try {
    if (desktop) {
      const path = await native.chooseImage(state.settings.lastDirectory);
      if (path) await insertPictureFromPath(path, replaceId);
    } else {
      const [file] = await native.pickWithInput('image/*');
      if (file) await insertPictureFromFile(file, null, replaceId);
    }
  } catch (error) {
    showError('error.picture', error);
  }
}

/** A container around the selection (Visio "Insert › Container"), or an empty one. */
function insertContainer() {
  if (!activeTab()) newDrawing();
  ensureDrawingView();
  const page = currentPage();
  const ids = selected2D().map((s) => s.id);
  const box = ids.length ? unionBounds(ids.map((id) => shapeBounds(D.findShape(page, id)))) : null;
  const container = change('op.container', (doc, pg) => {
    const c = box ? D.createShape('container', { x: box.x - 20, y: box.y - 50, w: box.w + 40, h: box.h + 70, text: t('shape.containerName') }) : D.createShape('container', { cx: viewCenter().x, cy: viewCenter().y, text: t('shape.containerName') });
    // Behind the shapes it holds.
    const first = box ? Math.min(...ids.map((id) => D.shapeIndex(pg, id))) : pg.shapes.length;
    D.addShape(pg, c, first);
    return c;
  });
  select([container.id]);
}

function insertCallout() {
  const target = selected2D()[0];
  if (!target) return dropMaster('roundCallout');
  const b = shapeBounds(target);
  const callout = change('op.addShape', (doc, page) => {
    const c = D.createShape('roundCallout', { x: b.x + b.w + 30, y: b.y - 90, text: t('shape.calloutText') });
    const tx = (b.x + b.w / 2 - c.x) / c.w;
    const ty = (b.y + b.h / 2 - c.y) / c.h;
    c.params = { tail: [Math.round(tx * 100) / 100, Math.round(ty * 100) / 100] };
    return D.addShape(page, c);
  });
  select([callout.id]);
  return callout;
}

// ───────────────────────── print

function openPrint() {
  const tab = activeTab();
  state.view?.finishTextEdit?.();
  let setup = {};
  try { setup = JSON.parse(globalThis.localStorage?.getItem(PRINT_KEY) ?? '{}'); } catch { setup = {}; }
  popups.open('print', { doc: tab.doc, title: tab.doc.title, currentPageId: tab.view.pageId, setup });
}

// ───────────────────────── confirmation & exit

async function ask(params) {
  const result = await popups.open('confirm', params);
  return result?.choice ?? 'cancel';
}

async function confirmDelete(names, kind) {
  if (!state.settings.confirmDelete) return true;
  const choice = await ask({
    icon: 'trash', title: t(`confirm.delete.${kind}Title`), message: t(`confirm.delete.${kind}`, { count: names.length }), items: names,
    buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'delete', label: t('confirm.delete'), icon: 'trash', danger: true, primary: true }],
  });
  return choice === 'delete';
}

async function requestExit() {
  if (desktop) return appWindow.close();
  return undefined;
}

async function confirmExit() {
  const dirty = state.docs.filter((doc) => doc.dirty);
  if (!dirty.length) return true;
  const choice = await ask({
    kind: 'exit', icon: 'save', title: t('confirm.exitTitle'), message: t('confirm.exitMessage'), items: dirty.map(docName),
    buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }],
  });
  if (choice === 'save') return saveAll();
  return choice === 'discard';
}

async function closeDoc(tab, { force = false } = {}) {
  if (!tab) return true;
  if (tab.dirty && !force) {
    activateDoc(tab.id);
    const choice = await ask({
      icon: 'save', title: t('confirm.closeTitle'), message: t('confirm.closeMessage', { name: docName(tab) }),
      buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }],
    });
    if (choice === 'cancel') return false;
    if (choice === 'save' && !(await saveDoc(tab))) return false;
  }
  const index = state.docs.indexOf(tab);
  state.docs.splice(index, 1);
  if (state.active === tab.id) {
    const next = state.docs[Math.min(index, state.docs.length - 1)];
    state.active = next?.id ?? null;
    state.selection = { ids: [], primary: null };
    if (!next) state.showStart = true;
    mountView();
  }
  persistSession();
  renderAll();
  return true;
}

async function closeAll() {
  for (const tab of [...state.docs]) if (!(await closeDoc(tab))) return false;
  return true;
}

// ───────────────────────── dialogs

/** Format Shape dialog: fill, line, text, effects, size & position, protection (one undo step on OK). */
async function openFormat(tab = null) {
  const shapes = selectedShapes().filter((s) => !D.isGroup(s));
  if (!shapes.length) return;
  const first = shapes[0];
  const connector = D.isConnector(first);
  const result = await popups.open('shape', {
    tab: tab ?? (connector ? 'line' : 'fill'), connector, count: shapes.length,
    style: styleOf(first), own: first.style ?? {}, shape: connector ? null : { x: first.x, y: first.y, w: first.w, h: first.h, angle: first.angle ?? 0, flipH: first.flipH, flipV: first.flipV, locked: first.locked ?? {} },
    units: unitsOf(), colors: variantColors(activeTab().doc.design, activeTab().doc.variant),
  });
  if (result?.action !== 'apply') return;
  try {
    change('op.format', (doc, page) => {
      D.setStyle(page, shapes.map((s) => s.id), result.style ?? {});
      if (result.box && shapes.length === 1 && !connector) {
        const s = D.findShape(page, first.id);
        D.setBox(page, s.id, { x: result.box.x, y: result.box.y, w: result.box.w, h: result.box.h });
        s.angle = D.normalizeAngle(result.box.angle ?? 0);
        s.flipH = Boolean(result.box.flipH);
        s.flipV = Boolean(result.box.flipV);
      }
      if (result.locked) for (const shape of shapes) if (!D.isConnector(shape)) D.findShape(page, shape.id).locked = { ...result.locked };
    });
    notify('success', t('notice.formatted', { count: shapes.length }));
  } catch (error) {
    showError('error.input', error);
  }
}

/** Shape Data dialog: the fields of the selected shapes (labels, types, values, list options). */
async function openShapeData() {
  const shapes = selectedShapes();
  if (!shapes.length) return;
  const result = await popups.open('data', { fields: shapes[0].data ?? [], count: shapes.length, name: shapes[0].name || String(shapes[0].text ?? '').split('\n')[0] });
  if (result?.action !== 'apply') return;
  const fields = D.normalizeData(result.fields);
  change('op.data', (doc, page) => {
    for (const shape of shapes) {
      const target = D.findShape(page, shape.id);
      if (shapes.length === 1) target.data = fields;
      else target.data = D.normalizeData([...fields.map((f) => ({ ...f, value: result.applyValues ? f.value : target.data?.find((x) => x.key === f.key)?.value ?? f.value })), ...(target.data ?? []).filter((x) => !fields.some((f) => f.key === x.key))]);
    }
  });
  notify('success', t('notice.dataSaved', { count: shapes.length }));
}

async function openPageSetup(tab = 'size') {
  const t2 = activeTab();
  const page = t2.page;
  const result = await popups.open('page', {
    tab, page: { ...page, shapes: undefined }, units: t2.doc.units, options: t2.doc.options,
    backgrounds: t2.doc.pages.filter((p) => p.background && p.id !== page.id).map((p) => ({ id: p.id, name: p.name })), designPage: designById(t2.doc.design).page,
  });
  if (result?.action !== 'apply') return;
  change('op.pageSetup', (doc, pg) => {
    Object.assign(pg, result.page);
    doc.options = { ...doc.options, ...(result.options ?? {}) };
    if (result.units) doc.units = result.units;
    if (pg.background) pg.backgroundId = null;
  });
  state.view?.fitPage?.();
  notify('success', t('notice.pageSetup'));
}

async function openLayers() {
  const tab = activeTab();
  const page = tab.page;
  const result = await popups.open('layers', {
    layers: page.layers, activeLayer: page.activeLayer, selected: selectedIds().length,
    counts: Object.fromEntries(page.layers.map((l) => [l.id, page.shapes.filter((s) => s.layers?.includes(l.id)).length])),
  });
  if (result?.action !== 'apply') return;
  change('op.layer', (doc, pg) => {
    const kept = new Set(result.layers.map((l) => l.id));
    for (const layer of pg.layers) if (!kept.has(layer.id)) D.deleteLayer(pg, layer.id, { deleteShapes: Boolean(result.deleteShapes?.includes(layer.id)) });
    pg.layers = result.layers.map((l) => ({ ...l }));
    pg.activeLayer = result.activeLayer && kept.has(result.activeLayer) || result.layers.some((l) => l.id === result.activeLayer) ? result.activeLayer : null;
    if (result.assign) D.assignLayer(pg, selectedIds(), result.assign.layerId, result.assign.mode);
  });
  notify('success', t('notice.layers'));
}

async function openFind(mode) {
  ensureDrawingView();
  await popups.open('find', { mode, text: activeTab().view.lastFind ?? '', pages: activeTab().doc.pages.map((p) => ({ id: p.id, name: p.name })) });
}

/** Find next: from the current selection onward, over pages when the scope is all pages. */
function findNext({ text, matchCase = false, whole = false, data = true, scope = 'all', direction = 1 }) {
  const tab = activeTab();
  tab.view.lastFind = text;
  const matches = D.findMatches(tab.doc, text, { matchCase, whole, data, pageId: scope === 'page' ? tab.view.pageId : null });
  if (!matches.length) { notify('info', t('notice.notFound', { text })); return { found: false, count: 0 }; }
  const current = matches.findIndex((m) => m.pageId === tab.view.pageId && m.id === selectedIds()[0]);
  const next = matches[(current + direction + matches.length) % matches.length] ?? matches[0];
  goToPage(next.pageId, { keepView: true });
  select([next.id]);
  state.view?.scrollToShape?.(next.id);
  return { found: true, index: matches.indexOf(next) + 1, count: matches.length };
}

function replaceAll({ text, replacement, matchCase = false, whole = false, scope = 'all' }) {
  const tab = activeTab();
  const count = change('op.replace', (doc) => D.replaceText(doc, text, replacement, { matchCase, whole, pageId: scope === 'page' ? tab.view.pageId : null }));
  notify('success', t('notice.replaced', { count }));
  return { count };
}

function replaceOne({ text, replacement, matchCase = false, whole = false }) {
  const shape = selectedShapes()[0];
  const re = D.textMatcher(text, { matchCase, whole });
  if (shape && re && re.test(shape.text ?? '')) {
    re.lastIndex = 0;
    change('op.replace', (doc, page) => { const s = D.findShape(page, shape.id); s.text = s.text.replace(re, replacement ?? ''); });
  }
  return findNext({ text, matchCase, whole });
}

async function openDocumentProps() {
  const tab = activeTab();
  const doc = tab.doc;
  const stats = D.statistics(doc);
  const props = Object.fromEntries(['title', 'subject', 'author', 'manager', 'company', 'category', 'keywords', 'description'].map((k) => [k, doc[k] ?? '']));
  const result = await popups.open('document', { props, created: doc.created, path: tab.path, stats: { ...stats, byMaster: stats.byMaster.size } });
  if (result?.action !== 'apply') return;
  change('op.docProps', (d) => Object.assign(d, result.props));
  renderDocTitle();
  notify('success', t('notice.docProps'));
}

async function openLayout() {
  const result = await popups.open('layout', { selected: selectedIds().length, last: activeTab().view.lastLayout ?? null });
  if (result?.action !== 'apply') return;
  activeTab().view.lastLayout = result;
  const ids = result.scope === 'selection' && selectedIds().length ? selectedIds() : null;
  const moved = change('op.layout', (doc, page) => {
    const n = layoutPage(page, { kind: result.kind, spacing: Number(result.spacing) || 50, ids });
    if (result.route) for (const s of page.shapes) if (D.isConnector(s) && (!ids || ids.includes(s.from.id) || ids.includes(s.to.id))) { s.route = result.route; s.waypoints = []; }
    return n;
  });
  ensureDrawingView();
  state.view?.fitPage?.();
  notify('success', t('notice.layout', { count: moved }));
}

async function openHyperlink() {
  const shapes = selectedShapes();
  if (!shapes.length) return;
  const result = await popups.open('hyperlink', { address: shapes[0].hyperlink ?? '', pages: activeTab().doc.pages.map((p) => ({ id: p.id, name: p.name })) });
  if (result?.action !== 'apply') return;
  change('op.link', (doc, page) => shapes.forEach((s) => { D.findShape(page, s.id).hyperlink = String(result.address ?? '').trim(); }));
}

async function openDesign(tab = 'themes') {
  const doc = activeTab().doc;
  const result = await popups.open('design', { tab, design: doc.design, variant: doc.variant, selected: selected2D().length, qs: selected2D()[0]?.qs ?? {} });
  if (!result?.action) return;
  if (result.action === 'design') change('op.design', (d) => { d.design = result.design; d.variant = result.variant ?? 0; });
  if (result.action === 'quick') change('op.quickStyle', (d, page) => D.setQuickStyle(page, selected2D().map((s) => s.id), { color: result.color, variant: result.variant }));
  notify('success', t('notice.design'));
}

/** Data import: org chart from CSV, link data to shapes, or a list of lines as connected shapes. */
async function openImport(tab = 'org', { path = null, text: given = '', name = '' } = {}) {
  let text = given;
  if (path) {
    try { text = await native.readTextFile(path, D.newId('op')); } catch (error) { showError('error.open', error, path); return; }
  }
  const result = await popups.open('import', { tab, text, name: path ? baseName(path) : name });
  if (!result?.action) return;
  if (!activeTab()) newDrawing();
  ensureDrawingView();
  try {
    if (result.action === 'org') {
      const out = change('op.orgChart', (doc, page) => orgChartFromData(page, result.text, { spacing: Number(result.spacing) || 40 }));
      if (!out.count) return notify('error', t('notice.noRows'));
      state.view?.fitPage?.();
      notify('success', t('notice.orgChart', { count: out.count }));
    } else if (result.action === 'link') {
      const out = change('op.linkData', (doc, page) => linkDataCsv(doc, page, result.text, { createMissing: Boolean(result.createMissing) }));
      notify(out.matched ? 'success' : 'info', t('notice.linked', { matched: out.matched, rows: out.rows, created: out.created }));
    } else if (result.action === 'list') {
      const ids = change('op.import', (doc, page) => shapesFromText(page, result.text, { at: viewCenter(), list: true, master: result.master || 'process' }));
      select(ids);
      notify('success', t('notice.pasted', { count: ids.length }));
    }
  } catch (error) {
    showError('error.import', error);
  }
  return undefined;
}

async function openMyShapes() {
  const result = await popups.open('stencil', { items: state.myShapes.map(({ id, name, svg }) => ({ id, name, svg })) });
  if (!result?.action) return;
  if (result.action === 'apply') {
    const keep = new Map(result.items.map((item) => [item.id, item.name]));
    state.myShapes = state.myShapes.filter((item) => keep.has(item.id)).map((item) => ({ ...item, name: keep.get(item.id) || item.name }));
    storeMyShapes();
    renderLeft();
  }
  if (result.action === 'insert' && result.id) dropMyShape(result.id, null);
}

/** Colour popup for the fill, line or text colour of the selection (or the page colour). */
async function pickColor(key, anchor = null) {
  const doc = activeTab()?.doc;
  const shape = selectedShapes().find((s) => !D.isGroup(s));
  const current = key === 'pageColor' ? currentPage()?.color || designById(doc.design).page : shape ? styleOf(shape)[key] : lastColors[key];
  const element = root.querySelector(`[data-command="${key === 'textColor' ? 'textColor' : key === 'fill' ? 'fillColor' : 'lineColor'}"]`);
  const result = await popups.open('color', { current, key, accents: doc ? variantColors(doc.design, doc.variant) : [], standard: STANDARD_COLORS, allowNone: key !== 'textColor' && key !== 'pageColor' }, { anchor: anchor ?? (element ? anchorBelow(element.closest('.split-button') ?? element) : null) });
  if (!result?.color) return;
  applyColor(key, result.color);
}

function applyColor(key, color) {
  if (key === 'pageColor') return change('op.pageSetup', (doc, page) => { page.color = color === 'none' ? '' : color; });
  if (key === 'fill' || key === 'line') { if (color !== 'none') lastColors[key] = color; renderToolbarState(); }
  if (key === 'fill') return setStyle(color === 'none' ? { fill: 'none', fillPattern: 'none' } : { fill: color, ...(selected2D().some((s) => styleOf(s).fillPattern === 'none') ? { fillPattern: 'solid' } : {}) }, selected2D().map((s) => s.id));
  return setStyle({ [key]: color });
}

// ───────────────────────── menus (popup windows)

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
  if (popups.useFrames) return { x: window.screenX + x, y: window.screenY + y };
  estimateOffset();
  return { x: screenOffset.x + x, y: screenOffset.y + y };
}

function anchorBelow(element) {
  const rect = element.getBoundingClientRect();
  const point = toScreen(rect.left, rect.bottom + 2);
  // flipX: the right edge to line up with when there is no room on the right (theme dropdown).
  return { ...point, flipY: toScreen(rect.left, rect.top - 2).y, flipX: toScreen(rect.right, rect.bottom).x };
}

const anchorFor = (command) => anchorBelow(root.querySelector(`[data-command="${command}"]`) ?? root.querySelector('#toolbar'));

function menuItems(ids) {
  return ids.map((id) => (id === '-' ? { separator: true } : typeof id === 'object' ? {
    id: `submenu:${id.sub}`, label: t(`submenu.${id.sub}`), icon: SUBMENUS[id.sub].icon, submenu: true,
    disabled: !SUBMENUS[id.sub].items.some((item) => item !== '-' && commandEnabled(item)),
    children: menuItems(SUBMENUS[id.sub].items),
  } : {
    id, label: t(commands[id].label), icon: commands[id].icon, shortcut: commands[id].key ? keyLabel(commands[id].key) : '', disabled: !commandEnabled(id), checked: commands[id].checked?.(),
  }));
}

async function showMenu(items, anchor, name = 'context', context = {}) {
  state.openMenu = name;
  renderMenubar();
  const header = context.header ?? (MENUS[name] ? { icon: MENU_ICONS[name], title: t(`menu.${name}`) } : { icon: 'diagram', title: 'MyDiagram' });
  const result = await popups.open('menu', { items, name, header }, { anchor });
  if (state.openMenu === name) {
    state.openMenu = null;
    state.lastMenuClose = { name, at: Date.now() };
    renderMenubar();
  }
  const id = result?.id;
  if (!id) return undefined;
  if (id.startsWith('custom:')) return context.handlers?.[id]?.();
  return run(id, context);
}

function openMenubarMenu(name) {
  const element = root.querySelector(`[data-menu="${name}"]`);
  if (!element) return;
  showMenu(menuItems(MENUS[name]), anchorBelow(element), name);
}

function choiceMenu(anchor, title, glyph, list, current, labelOf, apply, icons = {}) {
  const items = list.map((value) => ({ id: `custom:${value}`, label: labelOf(value), icon: icons[value] ?? glyph, checked: String(value) === String(current) }));
  const handlers = Object.fromEntries(list.map((value) => [`custom:${value}`, () => apply(value)]));
  return showMenu(items, anchor, 'context', { handlers, header: { icon: glyph, title } });
}

function viewsMenu(anchor) {
  return showMenu(menuItems(VIEWS.map((id) => `view:${id}`)), anchor ?? anchorFor('viewMenu'), 'context', { header: { icon: 'viewSwitch', title: t('action.viewMenu') } });
}

function pagesMenu(anchor) {
  const tab = activeTab();
  return choiceMenu(anchor ?? anchorBelow(root.querySelector('#statusbar') ?? root.querySelector('#toolbar')), t('action.goToPage'), 'pageSetup', tab.doc.pages.map((p) => p.id), tab.view.pageId, (id) => { const p = D.pageById(tab.doc, id); return p.background ? `${p.name} (${t('page.backgroundPage')})` : p.name; }, (id) => goToPage(id, { keepView: true }));
}

function lineWeightMenu(anchor) {
  const shape = selectedShapes()[0];
  return choiceMenu(anchor ?? anchorFor('lineColor'), t('action.lineWeight'), 'lineWeight', [0.5, 0.75, 1, 1.5, 2, 3, 4.5, 6, 8], shape ? styleOf(shape).lineWidth : null, (w) => `${w} px`, (w) => setStyle({ lineWidth: Number(w) }));
}

function dashMenu(anchor) {
  const shape = selectedShapes()[0];
  return choiceMenu(anchor ?? anchorFor('lineColor'), t('action.linePattern'), 'linePattern', DASHES, shape ? styleOf(shape).dash : null, (d) => t(`dash.${d}`), (d) => setStyle({ dash: d }));
}

function arrowMenu(key, anchor) {
  const shape = selectedConnectors()[0];
  return choiceMenu(anchor ?? anchorFor('lineColor'), t(key === 'startArrow' ? 'action.arrowStart' : 'action.arrowEnd'), key === 'startArrow' ? 'arrowStart' : 'arrowEnd', ARROWS, shape ? styleOf(shape)[key] : null, (a) => t(`arrow.${a}`), (a) => setStyle({ [key]: a }, selectedConnectors().map((c) => c.id)));
}

function backgroundMenu(anchor) {
  const tab = activeTab();
  const list = ['', ...tab.doc.pages.filter((p) => p.background && p.id !== tab.view.pageId).map((p) => p.id)];
  return choiceMenu(anchor ?? anchorBelow(root.querySelector('[data-menu="page"]')), t('action.backgroundMenu'), 'pageBg', list, tab.page.backgroundId ?? '', (id) => (id ? D.pageById(tab.doc, id).name : t('page.noBackground')), (id) => setBackgroundPage(id || null));
}

const FIELDS = ['page', 'pages', 'pageName', 'title', 'author', 'subject', 'company', 'date', 'time', 'name', 'master', 'width', 'height'];

function fieldsMenu(anchor) {
  const shape = selected2D()[0];
  const dataKeys = shape?.data?.map((f) => f.key) ?? [];
  const list = [...FIELDS, ...dataKeys.map((k) => `data:${k}`)];
  return choiceMenu(anchor ?? anchorBelow(root.querySelector('[data-menu="insert"]')), t('action.insertField'), 'field', list, null, (f) => (f.startsWith('data:') ? t('fieldName.data', { name: f.slice(5) }) : t(`fieldName.${f}`)), (f) => {
    const code = `{${f}}`;
    if (shape) change('op.text', (doc, page) => { const s = D.findShape(page, shape.id); s.text = s.text ? `${s.text} ${code}` : code; });
    else { const created = dropMaster('textBox'); change('op.text', (doc, page) => { D.findShape(page, created.id).text = code; }); }
  });
}

/** Context menus: shape, connector, several shapes, the page, a page tab, the report, text fields, tabs… */
function contextMenu(event, kind, payload = {}) {
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  const shape = payload.id ? D.findShape(currentPage(), payload.id) : null;
  const lang = getLanguage();
  if (kind === 'shape') {
    const ids = ['cut', 'copy', 'paste', 'duplicate', 'delete', '-', 'formatShape', 'quickStyle', sub('text'), '-', sub('order'), sub('rotate'), ...(D.isGroup(shape) ? ['ungroup'] : []), '-', 'shapeData', 'showData', 'insertHyperlink', 'insertComment', '-', 'saveShape', 'position', 'protect'];
    const items = menuItems(ids);
    if (shape?.hyperlink) items.unshift({ id: 'custom:follow', label: t('props.followLink'), icon: 'readerExternal' }, { separator: true });
    items.unshift({ id: 'custom:editText', label: t('canvas.editText'), icon: 'textTool', shortcut: 'F2' }, { separator: true });
    const handlers = { 'custom:follow': () => followHyperlink(shape), 'custom:editText': () => { ensureDrawingView(); state.view?.startTextEdit?.(shape.id); } };
    const title = D.isGroup(shape) ? t('shape.group') : `${masterById(shape?.master).name[lang]}${shape?.name ? `: ${shape.name}` : ''}`;
    return showMenu(items, anchor, 'context', { handlers, header: { icon: 'formatShape', title } });
  }
  if (kind === 'connector') {
    const items = menuItems(['routeOrtho', 'routeStraight', 'routeCurved', '-', 'arrowStart', 'arrowEnd', 'lineWeight', 'linePattern', 'lineColor', '-', 'reverse', 'clearBends', '-', 'cut', 'copy', 'delete', '-', 'formatShape', 'shapeData', 'insertComment']);
    items.unshift({ id: 'custom:editText', label: t('canvas.editLabel'), icon: 'textTool', shortcut: 'F2' }, { separator: true });
    return showMenu(items, anchor, 'context', { handlers: { 'custom:editText': () => { ensureDrawingView(); state.view?.startTextEdit?.(payload.id); } }, header: { icon: 'connectorTool', title: t('shape.connector') } });
  }
  if (kind === 'multi') return showMenu(menuItems(['cut', 'copy', 'duplicate', 'delete', '-', 'group', 'ungroup', sub('align'), sub('order'), sub('rotate'), '-', 'formatShape', 'quickStyle', 'layout', '-', 'saveShape']), anchor, 'context', { header: { icon: 'selectAll', title: t('props.multi', { count: selectedIds().length }) } });
  if (kind === 'canvas') {
    const items = menuItems(['paste', 'selectAll', '-', sub('tools'), '-', 'insertText', 'insertPicture', 'insertContainer', '-', 'pageSetup', 'layers', 'design', '-', 'zoomIn', 'zoomOut', 'fitPage', '-', sub('show')]);
    const handlers = {};
    if (payload.guide) { items.push({ separator: true }, { id: 'custom:guide', label: t('canvas.deleteGuide'), icon: 'trash', danger: true }); handlers['custom:guide'] = () => setGuide(payload.guide, null); }
    return showMenu(items, anchor, 'context', { handlers, header: { icon: 'pageSetup', title: currentPage()?.name ?? '' }, point: payload.point });
  }
  if (kind === 'pageTab') {
    const tab = activeTab();
    const handlers = {
      'custom:left': () => movePageTo(tab.view.pageId, Math.max(0, tab.doc.pages.findIndex((p) => p.id === tab.view.pageId) - 1)),
      'custom:right': () => movePageTo(tab.view.pageId, tab.doc.pages.findIndex((p) => p.id === tab.view.pageId) + 1),
    };
    const items = menuItems(['pageNew', 'pageBackgroundNew', 'pageDuplicate', 'pageRename', 'pageDelete', '-', 'pageSetup', 'backgroundMenu', 'layers', '-']);
    items.push({ id: 'custom:left', label: t('page.moveLeft'), icon: 'chevronLeft' }, { id: 'custom:right', label: t('page.moveRight'), icon: 'chevronRight' });
    return showMenu(items, anchor, 'context', { handlers, header: { icon: 'pageSetup', title: tab.page.name } });
  }
  if (kind === 'report') return showMenu(menuItems([...REPORTS.map(([id]) => `report:${id}`), '-', sub('reportExport'), 'copyReport']), anchor, 'context', { header: { icon: 'viewReports', title: t('view.reports') } });
  if (kind === 'tab') {
    activateDoc(payload.id);
    return showMenu(menuItems(['save', 'saveAs', 'saveTemplate', '-', 'docProps', 'print', '-', 'closeTab', 'closeAll', '-', 'new']), anchor, 'context', { header: { icon: 'diagram', title: docName(activeTab()) } });
  }
  if (kind === 'stencil') {
    const lang2 = getLanguage();
    const master = payload.master;
    const handlers = { 'custom:add': () => dropMaster(master), 'custom:close': () => setStencils((activeTab()?.stencils ?? []).filter((x) => x !== payload.stencil)) };
    const items = [{ id: 'custom:add', label: t('stencil.addToPage'), icon: 'plus' }];
    if (payload.stencil) items.push({ separator: true }, { id: 'custom:close', label: t('stencil.close'), icon: 'close' });
    return showMenu(items, anchor, 'context', { handlers, header: { icon: 'stBasic', title: master?.startsWith('my:') ? t('stencil.my') : masterById(master).name[lang2] } });
  }
  if (kind === 'panel') return showMenu(menuItems(['leftPanel', 'rightPanel', 'statusBar', '-', 'settings']), anchor, 'context', { header: { icon: 'panelLeft', title: t('panel.leftTitle') } });
  if (kind === 'start') return showMenu(menuItems(['new', 'open', 'recent', '-', 'shuffleBackground', 'backgroundImage', '-', 'tutorial', 'about']), anchor, 'context', { header: { icon: 'home', title: t('action.startPage') } });
  if (kind === 'status') return showMenu(menuItems(['statusBar', '-', 'zoomIn', 'zoomOut', 'zoomReset', 'fitPage', '-', 'theme', 'language']), anchor, 'context', { header: { icon: 'statusBar', title: t('action.statusBar') } });
  return showMenu(menuItems(['new', 'open', 'save', '-', 'undo', 'redo', '-', 'settings', 'about']), anchor, 'context', { header: { icon: 'diagram', title: 'MyDiagram' } });
}

function textContextMenu(element, event) {
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  const handlers = {
    'custom:cut': () => { element.focus(); document.execCommand('cut'); },
    'custom:copy': () => { element.focus(); document.execCommand('copy'); },
    'custom:paste': async () => { element.focus(); const text = await native.clipboardRead().catch(() => ''); document.execCommand('insertText', false, text ?? ''); },
    'custom:selectAll': () => { element.focus(); element.select?.(); },
    'custom:undo': () => { element.focus(); document.execCommand('undo'); },
  };
  const hasSel = element.selectionStart !== element.selectionEnd;
  return showMenu([
    { id: 'custom:undo', label: t('action.undoText'), icon: 'undo', shortcut: keyLabel('Ctrl+Z') }, { separator: true },
    { id: 'custom:cut', label: t('action.cut'), icon: 'cut', shortcut: keyLabel('Ctrl+X'), disabled: !hasSel },
    { id: 'custom:copy', label: t('action.copy'), icon: 'copy', shortcut: keyLabel('Ctrl+C'), disabled: !hasSel },
    { id: 'custom:paste', label: t('action.paste'), icon: 'paste', shortcut: keyLabel('Ctrl+V') }, { separator: true },
    { id: 'custom:selectAll', label: t('action.selectText'), icon: 'selectAll', shortcut: keyLabel('Ctrl+A') },
  ], anchor, 'context', { handlers, header: { icon: 'edit', title: t('menu.edit') } });
}

// ───────────────────────── document reader (tutorial document)

const READER_DOCS = { tutorial: { file: 'Tutorial', title: 'action.tutorialDoc', glyph: 'tutorialDoc' } };

function openReader(doc = 'tutorial', lang = getLanguage()) {
  popups.hideMenu();
  state.reader = { doc, lang: lang === 'en' ? 'en' : 'ko' };
  state.view?.destroy?.();
  state.view = null;
  renderAll();
}

function readerUrl() {
  const info = READER_DOCS[state.reader.doc];
  return `docs/${info.file}${state.reader.lang === 'en' ? '.en' : ''}.html`;
}

function renderReader() {
  const host = root.querySelector('#reader-page');
  const info = READER_DOCS[state.reader.doc];
  const url = readerUrl();
  const frame = host.querySelector('.reader-frame');
  if (frame && frame.dataset.url === url && host.dataset.uiLang === getLanguage()) return;
  host.dataset.uiLang = getLanguage();
  const lang = state.reader.lang;
  host.innerHTML = `
    <div class="reader-bar">
      <button class="button" data-reader="home" title="${escapeHtml(t('tip.home'))}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button>
      <h2 class="reader-title">${icon(info.glyph)}<span>${escapeHtml(t(info.title))}</span></h2>
      <select class="reader-chapters" data-reader-chapter title="${escapeHtml(t('reader.chapters'))}" aria-label="${escapeHtml(t('reader.chapters'))}"><option value="">${escapeHtml(t('reader.chapters'))}</option></select>
      <span class="grow"></span>
      <span class="segmented" role="radiogroup" title="${escapeHtml(t('reader.language'))}">
        <button class="segment ${lang === 'ko' ? 'active' : ''}" data-reader="lang" data-value="ko" role="radio" aria-checked="${lang === 'ko'}" title="한국어">한국어</button>
        <button class="segment ${lang === 'en' ? 'active' : ''}" data-reader="lang" data-value="en" role="radio" aria-checked="${lang === 'en'}" title="English">English</button>
      </span>
      <button class="button primary" data-reader="tutorial" title="${escapeHtml(commandTip('tutorial'))}">${icon('tutorial')}<span>${escapeHtml(t('reader.startTutorial'))}</span></button>
      <button class="button" data-reader="external" title="${escapeHtml(t('reader.externalTip'))}">${icon('readerExternal')}<span>${escapeHtml(t('reader.external'))}</span></button>
    </div>
    <iframe class="reader-frame" data-url="${escapeHtml(url)}" src="${escapeHtml(url)}" title="${escapeHtml(t(info.title))}"></iframe>`;
  const iframe = host.querySelector('.reader-frame');
  iframe.addEventListener('load', () => {
    const chapters = host.querySelector('[data-reader-chapter]');
    const headings = [...(iframe.contentDocument?.querySelectorAll('h2[id]') ?? [])];
    chapters.innerHTML = `<option value="">${escapeHtml(t('reader.chapters'))}</option>${headings.map((h) => `<option value="${escapeHtml(h.id)}">${escapeHtml(h.textContent.replace(/#\s*$/, '').trim())}</option>`).join('')}`;
  });
}

async function onReaderAction(target) {
  switch (target.dataset.reader) {
    case 'home': return showStartPage(true);
    case 'lang': state.reader.lang = target.dataset.value; return renderAll();
    case 'tutorial': return startTutorial();
    case 'external': {
      if (!desktop) return window.open(readerUrl(), '_blank');
      try { await native.openDocument(readerUrl().slice('docs/'.length)); } catch (error) { showError('error.guide', error); }
      return undefined;
    }
    default: return undefined;
  }
}

async function openUserGuide() {
  try {
    await native.openDocument(getLanguage() === 'en' ? 'UsersGuide.en.html' : 'UsersGuide.html');
    notify('info', t('notice.guide'));
  } catch (error) {
    showError('error.guide', error);
  }
}

// ───────────────────────── presentation (full screen, page by page)

function presentationPages() { return activeTab().doc.pages.filter((p) => !p.background); }

async function startPresentation() {
  const tab = activeTab();
  if (!tab) return;
  state.view?.finishTextEdit?.();
  const pages = presentationPages();
  const index = Math.max(0, pages.findIndex((p) => p.id === tab.view.pageId));
  state.presenting = { index };
  const host = root.querySelector('#presentation');
  host.hidden = false;
  renderPresentation();
  try { if (desktop) await appWindow.setFullscreen(true); else await document.documentElement.requestFullscreen?.(); } catch { /* windowed is fine */ }
  host.focus();
}

function renderPresentation() {
  const host = root.querySelector('#presentation');
  const tab = activeTab();
  const pages = presentationPages();
  const page = pages[state.presenting.index];
  if (!page) return;
  const { svg } = renderPageSvg(tab.doc, page, { area: 'content', measure, language: getLanguage() });
  host.innerHTML = `<div class="present-stage">${svg.replace('<svg ', '<svg preserveAspectRatio="xMidYMid meet" ').replace(/ width="\d+" height="\d+"/, ' width="100%" height="100%"')}</div>
    <div class="present-bar"><button class="icon-button" data-present="prev" title="${escapeHtml(t('present.prev'))}" aria-label="${escapeHtml(t('present.prev'))}">${icon('chevronLeft')}</button><span>${escapeHtml(`${page.name} · ${state.presenting.index + 1} / ${pages.length}`)}</span><button class="icon-button" data-present="next" title="${escapeHtml(t('present.next'))}" aria-label="${escapeHtml(t('present.next'))}">${icon('chevronRight')}</button><button class="icon-button" data-present="exit" title="${escapeHtml(t('present.exit'))}" aria-label="${escapeHtml(t('present.exit'))}">${icon('close')}</button></div>`;
  host.tabIndex = 0;
}

function presentStep(direction) {
  if (!state.presenting) return;
  const count = presentationPages().length;
  const next = state.presenting.index + direction;
  if (next < 0 || next >= count) { if (next >= count) stopPresentation(); return; }
  state.presenting.index = next;
  renderPresentation();
}

async function stopPresentation() {
  if (!state.presenting) return;
  const page = presentationPages()[state.presenting.index];
  state.presenting = null;
  const host = root.querySelector('#presentation');
  host.hidden = true;
  host.innerHTML = '';
  try { if (desktop) await appWindow.setFullscreen(false); else if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* ignore */ }
  if (page) goToPage(page.id, { keepView: true });
}

// In a browser, Esc leaves full screen itself and never reaches the page: end the show with it.
if (!desktop) document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && state.presenting) stopPresentation(); });

// ───────────────────────── external drag & drop

async function handleDroppedPaths(paths, client = null) {
  let at = dropPoint(client);
  for (const path of paths) {
    const name = baseName(path);
    try {
      if (isDiagramFileName(name) || isVsdxFileName(name)) await openPath(path);
      else if (isImageFileName(name)) {
        if (activeTab() && !state.showStart) { await insertPictureFromPath(path, null, at); at = at && { x: at.x + 30, y: at.y + 30 }; }
        else await setBackgroundFromPath(path);
      } else if (isCsvFileName(name)) await openImport('link', { path });
      else notify('error', t('notice.unsupportedDrop', { name }));
    } catch (error) {
      showError('error.drop', error, path);
    }
  }
}

/** The page point under a drop (client coordinates), when it is over the drawing canvas. */
function dropPoint(client) {
  if (!client || !state.view?.toPage) return null;
  const over = document.elementFromPoint(client.x, client.y)?.closest('.canvas-scroll');
  return over ? state.view.toPage(client.x, client.y) : null;
}

async function handleDroppedFiles(files, text, client = null) {
  let at = dropPoint(client);
  for (const file of files) {
    try {
      if (isDiagramFileName(file.name)) await openContent(file.name, await file.text());
      else if (isVsdxFileName(file.name)) await openContent(file.name, new Uint8Array(await file.arrayBuffer()));
      else if (isImageFileName(file.name) || file.type.startsWith('image/')) {
        if (activeTab() && !state.showStart) { await insertPictureFromFile(file, at); at = at && { x: at.x + 30, y: at.y + 30 }; }
        else await setBackgroundFromFile(file);
      } else if (isCsvFileName(file.name)) await openImport('link', { text: await file.text(), name: file.name });
      else notify('error', t('notice.unsupportedDrop', { name: file.name }));
    } catch (error) {
      showError('error.drop', error, file.name);
    }
  }
  if (!files.length && text) {
    if (!activeTab()) newDrawing();
    ensureDrawingView();
    const ids = change('op.import', (doc, page) => shapesFromText(page, text, { at: viewCenter(), list: true }));
    select(ids);
    notify('success', t('notice.pasted', { count: ids.length }));
  }
}

function setDropActive(active) {
  state.dropActive = active;
  const overlay = root.querySelector('.drop-overlay');
  overlay.classList.toggle('visible', active);
  overlay.querySelector('span').textContent = t('drop.hint');
}

// ───────────────────────── events

function bindEvents() {
  root.addEventListener('click', (event) => {
    const target = event.target;
    const present = target.closest('[data-present]');
    if (present) { const a = present.dataset.present; return a === 'exit' ? stopPresentation() : presentStep(a === 'next' ? 1 : -1); }
    if (target.closest('#presentation')) {
      const g = target.closest('[data-id]');
      const page = state.presenting ? presentationPages()[state.presenting.index] : null;
      const shape = g && page ? D.findShape(page, g.dataset.id) : null;
      if (shape?.hyperlink) { followHyperlink(shape); if (shape.hyperlink.startsWith('page:')) { const p = presentationPages().findIndex((x) => x.id === activeTab().view.pageId); if (p >= 0) { state.presenting.index = p; renderPresentation(); } } return undefined; }
      return presentStep(1);
    }
    const menu = target.closest('[data-menu]');
    if (menu) {
      const name = menu.dataset.menu;
      if (state.lastMenuClose.name === name && Date.now() - state.lastMenuClose.at < 300) return undefined;
      return openMenubarMenu(name);
    }
    if (target.closest('[data-home]')) return showStartPage(true);
    const reader = target.closest('[data-reader]');
    if (reader) return onReaderAction(reader);
    const start = target.closest('[data-start]');
    if (start && !start.disabled) return onStartAction(start);
    const colorApply = target.closest('[data-color-apply]');
    if (colorApply && !colorApply.disabled && !target.closest('.split-arrow')) return applyColor(colorApply.dataset.colorApply, lastColors[colorApply.dataset.colorApply]);
    const command = target.closest('[data-command]');
    if (command && !command.disabled) {
      const id = command.dataset.command;
      const anchor = ['themeMenu', 'exportMenu', 'viewMenu', 'alignMenu', 'recentFolders', 'fillColor', 'lineColor', 'textColor', 'goToPage'].includes(id) ? anchorBelow(command.closest('.split-button') ?? command) : undefined;
      return run(id, { anchor });
    }
    const tile = target.closest('[data-master]');
    if (tile) return dropMaster(tile.dataset.master);
    const stencilToggle = target.closest('[data-stencil-toggle]');
    if (stencilToggle) { const id = stencilToggle.dataset.stencilToggle; if (state.collapsedStencils.has(id)) state.collapsedStencils.delete(id); else state.collapsedStencils.add(id); return renderLeft(); }
    const stencilClose = target.closest('[data-stencil-close]');
    if (stencilClose) return setStencils((activeTab()?.stencils ?? state.settings.openStencils).filter((x) => x !== stencilClose.dataset.stencilClose));
    if (target.closest('[data-stencil-more]')) return moreShapesMenu(anchorBelow(target.closest('[data-stencil-more]')));
    const stencilSize = target.closest('[data-stencil-size]');
    if (stencilSize) { updateSettings({ stencilSize: stencilSize.dataset.stencilSize }, { quiet: true }); return renderLeft(); }
    const sectionToggle = target.closest('[data-section-toggle]');
    if (sectionToggle) { const id = sectionToggle.dataset.sectionToggle; if (state.rightSections.has(id)) state.rightSections.delete(id); else state.rightSections.add(id); return renderRight(); }
    const propColor = target.closest('[data-prop-color]');
    if (propColor) return pickColor(propColor.dataset.propColor, anchorBelow(propColor));
    const quick = target.closest('[data-quick]');
    if (quick) { const [color, variant] = quick.dataset.quick.split(':'); return change('op.quickStyle', (doc, page) => D.setQuickStyle(page, selected2D().map((s) => s.id), { color: Number(color), variant })); }
    const variant = target.closest('[data-variant]');
    if (variant) return change('op.design', (doc) => { doc.variant = Number(variant.dataset.variant); });
    const orientation = target.closest('[data-page-orientation]');
    if (orientation) return change('op.pageSetup', (doc, page) => { const o = orientation.dataset.pageOrientation; if (page.orientation !== o) { page.orientation = o; [page.width, page.height] = [page.height, page.width]; } });
    const layerToggle = target.closest('[data-layer-toggle]');
    if (layerToggle) { const [key, id] = layerToggle.dataset.layerToggle.split(':'); return change('op.layer', (doc, page) => { const l = page.layers.find((x) => x.id === id); if (l) l[key] = !l[key]; }); }
    if (target.closest('[data-follow-link]')) return followHyperlink(selectedShapes()[0]);
    if (target.closest('[data-replace-picture]')) return insertPicture(selectedIds()[0]);
    if (target.closest('[data-comment-add]')) { const input = root.querySelector('[data-comment-input]'); return addComment(input?.value ?? ''); }
    const cDone = target.closest('[data-comment-done]');
    const cDel = target.closest('[data-comment-delete]');
    if (cDone || cDel) {
      const id = (cDone ?? cDel).dataset[cDone ? 'commentDone' : 'commentDelete'];
      const owner = selectedIds()[0];
      return change('op.comment', (doc, page) => {
        const target2 = owner ? D.findShape(page, owner) : page;
        if (cDel) target2.comments = target2.comments.filter((c) => c.id !== id);
        else { const c = target2.comments.find((x) => x.id === id); if (c) c.done = !c.done; }
      });
    }
    const windowAction = target.closest('[data-window]');
    if (windowAction) return windowButton(windowAction.dataset.window);
    const docTitle = target.closest('[data-doc-menu]');
    if (docTitle) {
      if (state.lastMenuClose.name === 'context' && Date.now() - state.lastMenuClose.at < 300) return undefined;
      return docMenu();
    }
    return undefined;
  });

  // Windows moves the window through app-region: drag (CSS); macOS and Linux need it asked for.
  if (desktop && !/Windows/i.test(navigator.userAgent)) {
    root.addEventListener('mousedown', (event) => {
      if (event.button === 0 && event.target.closest('[data-drag-window]')) appWindow.startDragging().catch(() => {});
    });
    root.addEventListener('dblclick', (event) => {
      if (event.target.closest('[data-drag-window]')) appWindow.toggleMaximize().then(syncMaximized).catch(() => {});
    });
  }

  // Shapes panel → canvas with the pointer. (HTML5 drag & drop does not reach the page in the
  // desktop app on Windows, where the window takes files dropped from outside.)
  root.addEventListener('pointerdown', (event) => {
    const tile = event.button === 0 ? event.target.closest?.('.stencil-tile[data-master]') : null;
    if (!tile) return;
    const start = { x: event.clientX, y: event.clientY };
    let ghost = null;
    const overCanvas = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest('.canvas-scroll');
    const move = (e) => {
      if (!ghost) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
        ghost = document.createElement('div');
        ghost.className = 'stencil-ghost';
        ghost.innerHTML = tile.querySelector('svg')?.outerHTML ?? '';
        document.body.append(ghost);
      }
      ghost.style.transform = `translate(${e.clientX - 22}px, ${e.clientY - 22}px)`;
      ghost.classList.toggle('over', Boolean(overCanvas(e)));
    };
    const up = (e) => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      if (!ghost) return;
      ghost.remove();
      // The click that follows a drag must not add a second shape.
      const swallow = (c) => { c.stopPropagation(); c.preventDefault(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, true), 0);
      if (e.type === 'pointerup' && overCanvas(e) && state.view?.toPage) dropMaster(tile.dataset.master, state.view.toPage(e.clientX, e.clientY));
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  });

  root.addEventListener('contextmenu', (event) => {
    const editable = event.target.closest('input:not([type="range"]):not([type="checkbox"]), textarea');
    if (editable && !event.target.closest('.grid-editor')) { event.preventDefault(); return textContextMenu(editable, event); }
    if (event.defaultPrevented) return undefined;
    event.preventDefault();
    const tile = event.target.closest('[data-master]');
    if (tile) return contextMenu(event, 'stencil', { master: tile.dataset.master, stencil: tile.closest('[data-stencil]')?.dataset.stencil });
    if (event.target.closest('[data-doc-menu]')) return contextMenu(event, 'tab', { id: state.active });
    if (event.target.closest('#start-page')) return contextMenu(event, 'start');
    if (event.target.closest('#statusbar')) return contextMenu(event, 'status');
    if (event.target.closest('.side-panel, #toolbar, #menubar')) return contextMenu(event, 'panel');
    return contextMenu(event, 'default');
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target.dataset.prop) return onProp(target);
    if (target.dataset.propCheck) {
      const key = target.dataset.propCheck;
      const on = target.checked;
      if (key.startsWith('lock:')) { const k = key.slice(5); return change('op.protect', (doc, page) => selectedIds().forEach((id) => { const s = D.findShape(page, id); s.locked = { ...(s.locked ?? {}), [k]: on }; if (!on) delete s.locked[k]; })); }
      if (key === 'lockAspect') return change('op.protect', (doc, page) => selectedIds().forEach((id) => { const s = D.findShape(page, id); s.locked = { ...(s.locked ?? {}), aspect: on }; }));
      if (key === 'shadow') return setStyle({ shadow: on });
      if (key === 'autoSize') return change('op.pageSetup', (doc, page) => { page.autoSize = on; });
      if (key === 'pageGrid') return change('op.pageSetup', (doc, page) => { page.grid = on; });
      if (key === 'isBackground') return change('op.pageSetup', (doc, page) => { page.background = on; if (on) { page.backgroundId = null; for (const p of doc.pages) if (p.backgroundId === page.id && on) { /* keeps */ } } else for (const p of doc.pages) if (p.backgroundId === page.id) p.backgroundId = null; });
      if (key === 'lineJumpsShape') return setStyle({ lineJumps: on ? null : false }, selectedConnectors().map((c) => c.id));
      return undefined;
    }
    if (target.dataset.propRange) return setStyle({ [target.dataset.propRange]: Number(target.value) });
    if (target.dataset.propParam) { const key = target.dataset.propParam; return change('op.adjust', (doc, page) => { const s = D.findShape(page, selectedIds()[0]); s.params = { ...(s.params ?? {}), [key]: Number(target.value) }; }); }
    if (target.dataset.propData) {
      const index = Number(target.dataset.propData);
      const value = target.type === 'checkbox' ? (target.checked ? 'true' : 'false') : target.value;
      return change('op.data', (doc, page) => { const s = D.findShape(page, selectedIds()[0]); if (s?.data?.[index]) s.data[index].value = value; });
    }
    if (target.dataset.propLayer) return assignLayer(target.dataset.propLayer, target.checked ? 'add' : 'remove');
    if ('startToggle' in target.dataset) return updateSettings({ showStartPage: target.checked }, { quiet: true });
    if (target.id === 'zoom-value') return setCanvasZoom(parseFloat(target.value) || 100);
    if (target.id === 'zoom-slider') return setCanvasZoom(CANVAS_ZOOM.steps[Number(target.value)]);
    if ('startSpeed' in target.dataset) return updateSettings({ animationSpeed: Number(target.value) }, { quiet: true });
    if ('readerChapter' in target.dataset && target.value) { root.querySelector('.reader-frame')?.contentDocument?.getElementById(target.value)?.scrollIntoView({ block: 'start' }); return undefined; }
    if ('startRandom' in target.dataset) return updateSettings({ animationRandom: target.checked }, { quiet: true });
    if ('startInterval' in target.dataset) { startBackgroundChangedAt = Date.now(); return updateSettings({ animationInterval: Number(target.value) }, { quiet: true }); }
    return undefined;
  });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (target.id === 'stencil-search') {
      clearTimeout(bindEvents.searchTimer);
      bindEvents.searchTimer = setTimeout(() => {
        state.stencilQuery = target.value;
        const pos = target.selectionStart;
        renderLeft();
        const input = root.querySelector('#stencil-search');
        input?.focus();
        input?.setSelectionRange(pos, pos);
      }, 180);
    }
    if (target.dataset.propRange || target.dataset.propParam) { const out = target.parentElement.querySelector('output'); if (out) out.textContent = `${Math.round(Number(target.value) * (target.dataset.propParam ? 100 : 1))}%`; }
    if ('startSpeed' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}%`; state.settings.animationSpeed = Number(target.value); }
  });

  root.addEventListener('keydown', (event) => {
    if (event.target.id === 'zoom-value' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); setCanvasZoom(zoomStep(zoomPercent(), event.key === 'ArrowUp' ? 1 : -1)); }
    else if (event.target.id === 'zoom-value' && event.key === 'Enter') event.target.blur();
    else if (event.target.matches?.('.props input[type="text"]') && event.key === 'Enter') { event.preventDefault(); event.target.dispatchEvent(new Event('change', { bubbles: true })); }
    else if (event.target.matches?.('[data-comment-input]') && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); addComment(event.target.value); }
  });

  // Ctrl+wheel outside the drawing: the UI zoom.
  root.addEventListener('wheel', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.defaultPrevented) return;
    if (event.target.closest('.canvas-scroll')) return;
    event.preventDefault();
    setUiZoom(state.settings.zoom + (event.deltaY < 0 ? ZOOM.step : -ZOOM.step));
  }, { passive: false });

  root.querySelectorAll('[data-split]').forEach((splitter) => splitter.addEventListener('pointerdown', (event) => {
    const side = splitter.dataset.split;
    if ((side === 'left' && !state.settings.showLeftPanel) || (side === 'right' && !state.settings.showRightPanel)) return;
    event.preventDefault();
    const key = side === 'left' ? 'leftWidth' : 'rightWidth';
    const startWidth = state.settings[key];
    const minimum = side === 'left' ? PANEL_MIN.left : PANEL_MIN.right;
    pointerDrag(event, {
      cursor: 'col-resize',
      move: (dx) => {
        const width = Math.max(minimum, Math.min(600, startWidth + (side === 'left' ? dx : -dx)));
        root.style.setProperty(side === 'left' ? '--left-width' : '--right-width', `${width}px`);
        state.settings[key] = width;
      },
      end: (e, moved) => { if (moved) { updateSettings({ [key]: state.settings[key] }, { quiet: true }); state.view?.drawRulers?.(); } },
    });
  }));

  root.querySelector('[data-resize-grip]')?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    appWindow?.startResizeDragging('SouthEast').catch(() => {});
  });

  window.addEventListener('resize', frameThrottle(() => {
    syncMaximized();
    state.view?.drawRulers?.();
    state.view?.grid?.drawRows?.();
    if (state.presenting) renderPresentation();
    if (desktop && state.minWidth && window.innerWidth < state.minWidth - 1) native.setMinimumSize(state.minWidth, 600).catch(() => {});
  }));

  document.addEventListener('keydown', onKeyDown, true);

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      const previous = state.settings;
      state.settings = loadSettings(globalThis.localStorage);
      applySettings(previous);
    } else if (event.key === RECENT_KEY || event.key === RECENT_DIRS_KEY) {
      state.recent = loadRecent(globalThis.localStorage);
      state.recentDirs = loadRecentDirs(globalThis.localStorage);
      if (state.showStart || !activeTab()) renderStartPage();
      renderToolbarState();
    } else if (event.key === MY_SHAPES_KEY) {
      state.myShapes = loadMyShapes();
      renderLeft();
    }
  });

  if (!desktop) {
    let depth = 0;
    document.addEventListener('dragenter', (event) => { if ([...(event.dataTransfer?.types ?? [])].includes('Files')) { depth += 1; setDropActive(true); event.preventDefault(); } });
    document.addEventListener('dragover', (event) => { event.preventDefault(); });
    document.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) setDropActive(false); });
    document.addEventListener('drop', (event) => {
      if ([...(event.dataTransfer?.types ?? [])].includes('application/x-mydiagram-master') || [...(event.dataTransfer?.types ?? [])].includes('application/x-mydiagram-page')) return;
      event.preventDefault();
      depth = 0;
      setDropActive(false);
      handleDroppedFiles([...(event.dataTransfer?.files ?? [])], event.dataTransfer?.getData('text/plain') ?? '', { x: event.clientX, y: event.clientY });
    });
    window.addEventListener('beforeunload', (event) => {
      if (state.docs.some((doc) => doc.dirty)) { event.preventDefault(); event.returnValue = ''; }
    });
  }

  setInterval(() => {
    const clock = root.querySelector('#status-clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, 15000);
}

/** Ctrl+key shortcuts: [key, shift, command]. */
const SHORTCUTS = [
  ['n', false, 'new'], ['o', false, 'open'], ['s', false, 'save'], ['s', true, 'saveAs'], ['w', false, 'closeTab'], ['p', false, 'print'],
  ['z', false, 'undo'], ['y', false, 'redo'], ['z', true, 'redo'], ['x', false, 'cut'], ['c', false, 'copy'], ['v', false, 'paste'], ['d', false, 'duplicate'],
  ['a', false, 'selectAll'], ['f', false, 'find'], ['h', false, 'replace'], ['g', false, 'goToPage'], ['k', false, 'insertHyperlink'],
  ['=', false, 'zoomIn'], ['+', false, 'zoomIn'], ['-', false, 'zoomOut'], ['0', false, 'zoomReset'], ['w', true, 'fitPage'],
  ['b', false, 'bold'], ['i', false, 'italic'], ['u', false, 'underline'], ['>', true, 'fontUp'], ['.', true, 'fontUp'], ['<', true, 'fontDown'], [',', true, 'fontDown'],
  ['g', true, 'group'], ['u', true, 'ungroup'], ['f', true, 'bringFront'], ['k', true, 'sendBack'], ['r', false, 'rotateRight'], ['l', false, 'rotateLeft'], ['j', false, 'flipH'], ['m', false, 'flipV'],
  ['c', true, 'formatPainter'], ['d', true, 'shapeData'], ['1', false, 'tool:pointer'], ['2', false, 'tool:text'], ['3', false, 'tool:connector'], ['4', false, 'tool:pencil'],
  ['5', false, 'tool:polyline'], ['6', false, 'tool:line'], ['8', false, 'tool:rect'], ['9', false, 'tool:ellipse'],
  [',', false, 'settings'], ['l', true, 'language'], ['!', true, 'leftPanel'], ['1', true, 'leftPanel'], ['@', true, 'rightPanel'], ['2', true, 'rightPanel'],
  ['q', false, 'exit'], ['h', true, 'startPage'], ['b', true, 'shuffleBackground'], ['pageup', false, 'pagePrev'], ['pagedown', false, 'pageNext'],
];

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  if (state.presenting) {
    event.preventDefault();
    if (key === 'escape') stopPresentation();
    else if (['arrowright', 'arrowdown', 'pagedown', ' ', 'enter'].includes(key)) presentStep(1);
    else if (['arrowleft', 'arrowup', 'pageup', 'backspace'].includes(key)) presentStep(-1);
    else if (key === 'home') { state.presenting.index = 0; renderPresentation(); }
    else if (key === 'end') { state.presenting.index = presentationPages().length - 1; renderPresentation(); }
    return;
  }
  if (tutorial?.active && key === 'escape') { event.preventDefault(); tutorial.stop(); return; }
  const editing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.altKey && key === 's') { event.preventDefault(); run('saveAll'); return; }
  if (mod && !event.altKey) {
    if (editing && ['x', 'c', 'v', 'z', 'y', 'a', 'b', 'i', 'u'].includes(key)) return;
    if (key === 'tab') { event.preventDefault(); cycleTab(event.shiftKey ? -1 : 1); return; }
    if (key === ' ' && event.shiftKey) { event.preventDefault(); run('tool:pan'); return; }
    const shortcut = SHORTCUTS.find(([k, shift]) => k === key && shift === event.shiftKey);
    if (shortcut) { event.preventDefault(); event.stopPropagation(); run(shortcut[2]); }
    return;
  }
  if (key === 'f1') { event.preventDefault(); run('about'); return; }
  if (key === 'f5') { event.preventDefault(); run('presentation'); return; }
  if (key === 'f11' && event.shiftKey) { event.preventDefault(); run('pageNew'); return; }
  if (key === 'f11') { event.preventDefault(); run('tutorial'); return; }
  if (editing) {
    if (key === 'escape' && !event.target.classList.contains('grid-editor') && !event.target.classList.contains('text-editor')) event.target.blur();
    return;
  }
  const canvas = state.view instanceof CanvasView ? state.view : null;
  if (key === ' ' && canvas) { event.preventDefault(); canvas.spaceDown = true; return; }
  if (key === 'f2' && canvas && selectedIds().length === 1) { event.preventDefault(); canvas.startTextEdit(selectedIds()[0]); return; }
  if (key === 'delete' || key === 'backspace') { event.preventDefault(); run('delete'); return; }
  if (key === 'escape') {
    if (canvas?.cancelTool()) return;
    if (state.painter) { state.painter = null; root.classList.remove('painting'); renderToolbarState(); return; }
    if (state.tool !== 'pointer') { setTool('pointer'); return; }
    run('clearSelection');
    return;
  }
  if (key === 'enter' && canvas && state.tool === 'polyline') { canvas.finishPolyline(false); return; }
  if (canvas && key.startsWith('arrow') && selectedIds().length) {
    event.preventDefault();
    const step = event.shiftKey ? 1 : canvas.gridStep();
    const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
    const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
    change('op.nudge', (doc, page) => D.moveShapes(page, selectedIds(), dx, dy));
    return;
  }
  // Typing on a selected shape replaces its text (Visio).
  if (canvas && selectedIds().length === 1 && event.key.length === 1 && !event.altKey) {
    event.preventDefault();
    canvas.startTextEdit(selectedIds()[0], event.key);
  }
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
  popups.on('printed', () => notify('success', t('notice.printed')));
  popups.on('open-settings', (data) => popups.open('settings', { tab: data.tab ?? 'general', themeGroup: data.themeGroup }));
  popups.on('start-tutorial', () => startTutorial());
  popups.on('show-start', () => showStartPage(true));
  popups.on('find-next', (data, kind) => popups.post(kind, { type: 'find-result', ...findNext(data) }));
  popups.on('replace-one', (data, kind) => popups.post(kind, { type: 'find-result', ...replaceOne(data) }));
  popups.on('replace-all', (data, kind) => popups.post(kind, { type: 'find-result', ...replaceAll(data) }));
  popups.on('go-to-page', (data) => goToPage(data.pageId));
  popups.on('import-file', async (data, kind) => {
    try {
      let text = '';
      if (desktop) {
        const [path] = await native.chooseDataFile(state.settings.lastDirectory);
        if (!path) return;
        text = await native.readTextFile(path, D.newId('op'));
        popups.post(kind, { type: 'import-text', text, name: baseName(path) });
      } else {
        const [file] = await native.pickWithInput('.csv,.tsv,.txt,text/csv,text/plain');
        if (!file) return;
        text = await file.text();
        popups.post(kind, { type: 'import-text', text, name: file.name });
      }
    } catch (error) { showError('error.open', error); }
  });
  popups.on('raise-test-panic', () => native.invoke('raise_test_panic').catch((error) => showError('error.unexpected', error)));
  popups.on('db-password', (data) => { dbSessionPassword = String(data.password ?? ''); });
  popups.on('db-test', (data, kind) => testDatabase(String(data.password ?? ''), kind));
  popups.on('db-browse', () => chooseDatabaseFile());
  popups.on('db-delete', (data) => deleteDatabaseDrawing(data.id, data.title));
  popups.on('db-refresh', async () => {
    const db = dbReady();
    if (db) popups.post('database', { type: 'db-list', items: await dbList(db).catch((error) => { showError('error.dbOpen', error, db.where); return []; }) });
  });
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
  let files = [];
  try { files = JSON.parse(globalThis.localStorage?.getItem(SESSION_KEY) ?? '{}').files ?? []; } catch { /* none */ }
  if (!files.length) return;
  const exists = await native.pathsExist(files);
  for (const [index, path] of files.entries()) if (exists[index]) await openPath(path, { quiet: true });
}

/** What the views and the tutorial use. */
const appApi = {
  state,
  t,
  measure,
  language: () => getLanguage(),
  version: () => (state.info?.version ?? VERSION),
  settings: () => state.settings,
  doc: () => activeTab(),
  tab: () => activeTab(),
  page: () => currentPage(),
  selection: () => state.selection,
  tool: () => state.tool,
  formatPainter: () => Boolean(state.painter),
  isSelected,
  select,
  clearSelection,
  setTool,
  paintFormat,
  followHyperlink,
  showComments,
  dropMaster,
  pointerAt,
  contextMenu,
  run,
  commands,
  popups,
  notify,
  showError,
  change,
  goToPage,
  movePageTo,
  renamePage,
  liveStatus: () => renderStatus(),
  setBoxLive,
  scaleLive,
  rotateLive,
  duplicateMoved,
  moveSelection,
  commitShapes,
  autoConnect,
  connectShapes,
  addFreeform,
  setGuide,
  addGuide,
  addShapeAt,
  removeBend,
  setShapeText,
  zoomChanged,
  editShapeField,
  addDataField,
  fieldCtx,
  rowHeight,
  columnWidths,
  saveColumnWidths,
  switchView,
  showStartPage,
  updateSettings,
  newDrawing,
  openSampleBuiltin,
  openMenubarMenu,
  shuffleBackground,
  renderAll,
  renderToolbarState,
  anchorBelow,
  closeDoc,
  ask,
  openReader: (doc, lang) => openReader(doc, lang),
  closeReader: () => { if (state.reader) { state.reader = null; if (activeTab()) mountView(); renderAll(); } },
  get view() { return state.view; },
};

async function start() {
  renderShell();
  bindEvents();
  bindPopupActions();
  await popups.init();
  state.info = await native.appInfo().catch(() => null);
  if (state.settings.animationRandom) updateSettings({ animation: randomAnimation(state.settings.animation) }, { quiet: true });
  setInterval(tickStartBackground, 1000);
  document.title = `MyDiagram v${state.info?.version ?? VERSION}`;
  native.setBackendLanguage(state.settings.language);
  state.samples = await native.sampleFiles().catch(() => []);
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
        // The position is in physical pixels of the webview.
        const p = event.payload.position;
        handleDroppedPaths(event.payload.paths ?? [], p ? { x: p.x / (window.devicePixelRatio || 1), y: p.y / (window.devicePixelRatio || 1) } : null);
      }
    });
    native.listen('fatal-error', (fatal) => {
      const detail = [`${t('error.location')}: ${fatal.location}`, `${t('error.thread')}: ${fatal.thread}`, fatal.log ? `${t('error.log')}: ${fatal.log}` : '', '', fatal.backtrace].join('\n');
      const error = new Error(fatal.message);
      error.stack = detail;
      showError('error.fatal', error, fatal.location);
    });
  }

  await restoreSession();
  for (const path of await native.startupFiles().catch(() => [])) await openPath(path);
  state.showStart = !state.docs.length && state.settings.showStartPage;
  if (!state.docs.length && !state.settings.showStartPage) newDrawing();
  if (!state.active && state.docs.length) activate(state.docs[0].id);
  else renderAll();
  if (desktop) {
    await appWindow.show();
    await appWindow.setFocus();
    syncMaximized();
    setTimeout(() => popups.prewarm('menu'), 400);
  }
  if (!state.settings.tutorialOffered && !globalThis.__MYDIAGRAM_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome')) {
    updateSettings({ tutorialOffered: true }, { quiet: true });
    setTimeout(async () => {
      const result = await popups.open('welcome', {});
      if (result?.choice === 'tutorial') startTutorial();
      else if (result?.choice === 'sample') openSampleBuiltin();
    }, 600);
  }
}

// Test hook: the E2E suites drive the app through this (no effect on normal use).
window.__mydiagram = {
  state,
  t,
  commands,
  popups,
  run,
  api: appApi,
  debug: () => ({ openMenu: state.openMenu, view: state.viewId, showStart: state.showStart, tool: state.tool, focus: document.activeElement?.outerHTML?.slice(0, 80) ?? null, pending: [...popups.pending.keys()] }),
  actions: {
    newDrawing, openPath, openContent, saveDoc, closeDoc, select, change, undo, redo, copySelection, pasteClipboard, duplicate, deleteSelection,
    setCanvasZoom, updateSettings, handleDroppedPaths, handleDroppedFiles, setBackgroundFromPath, removeBackground, confirmExit, openRecent, showError, openMenubarMenu,
    contextMenu, activeDoc, toScreen, docName, withProgress, switchView, showStartPage, exportAs, exportImage, exportPdf, exportReport, dropMaster, addShapeAt,
    connectShapes, autoConnect, align, distribute, reorder, groupSelection, ungroupSelection, rotateBy, flip, setStyle, setShapeText, addPage, goToPage, deletePage, renamePage,
    duplicatePage, setTool, findNext, replaceAll, addComment, insertTitleBlock, startTutorial, startPresentation, stopPresentation, presentStep, addPicture, setRoute, addFreeform,
    rememberDirectory, saveToMyShapes, applyColor, autoAlign, layoutPage, openSampleBuiltin, shuffleBackground,
  },
  domain: { D, TEMPLATES, MASTERS, CATEGORIES, LAYOUTS, buildTemplate, buildSample, tutorialSteps: () => TUTORIAL_STEPS.length },
  tutorial: () => tutorial,
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => {
    if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {});
  });
