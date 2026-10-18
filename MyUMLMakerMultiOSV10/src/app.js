// Main window: menu bar, toolbar, project tabs, Toolbox (left), the diagram
// editor with the working-diagram tabs (centre), Model Explorer and Editors
// (right: Properties, Style, Documentation, Tags & Constraints), status bar.
// Files (.myuml, StarUML .mdj, fragments), import and export (images, PDF,
// HTML/Markdown documentation, Mermaid, PlantUML), code generation and
// reverse engineering, model validation, printing, the database, settings.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import * as M from './domain/model.js';
import { ProjectDocument } from './domain/document.js';
import {
  baseName, directoryOf, extensionOf, FormatError, isFragmentFileName, isImageFileName, isOpenableFileName, isProjectFileName, isSourceFileName, isStarUmlFileName, isTemplateFileName, isTextModelFileName,
  normalizeProject, parseProject, stripExtension, withExtension,
} from './domain/format.js';
import { buildSample, buildTemplate, TEMPLATES } from './domain/templates.js';
import { CLASSIFIER_TYPES, DIAGRAM_FAMILIES, DIAGRAM_TYPES, TYPES, typeDef, typeLabel, viewDef } from './domain/meta.js';
import { toolboxFor, toolById } from './domain/toolbox.js';
import * as E from './domain/edit.js';
import { layoutDiagram as autoLayout, LAYOUT_DIRECTIONS } from './domain/layout.js';
import { parseAttribute, parseNameWithStereotype, parseOperation, attributeText, operationText, isMultiplicity } from './domain/labels.js';
import { CODE_LANGUAGES, DEFAULT_CODEGEN_OPTIONS, generateCode, SQL_DIALECTS } from './domain/codegen/index.js';
import { DEFAULT_REVERSE_OPTIONS, REVERSE_LANGUAGES, reverseEngineer } from './domain/reverse/index.js';
import { exportFragment, exportMdj, importFragment, importMdj } from './domain/interop/staruml.js';
import { exportMermaid, importMermaid } from './domain/interop/mermaid.js';
import { exportPlantUml, importPlantUml } from './domain/interop/plantuml.js';
import { htmlDocs, markdownDocs } from './domain/docs.js';
import { RULES as VALIDATION_RULES, validate } from './domain/validate.js';
import * as Tr from './domain/trace.js';
import { addRecent, loadRecent, loadRecentDirs, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import {
  loadSettings, PANEL_MIN, PRINT_KEY, RECENT_DIRS_KEY, RECENT_KEY, SESSION_KEY, STORAGE_KEY, storeSettings, ZOOM, CANVAS_ZOOM, zoomStep, dbConfig, dbDescribe, dbProblems, ANIMATIONS, LINE_STYLES, DIAGRAM_THEME_IDS,
} from './domain/settings.js';
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
import { ModelExplorer } from './ui/explorer.js';
import { datalistsHtml, diagramPropertiesHtml, documentationHtml, propertiesHtml, styleHtml, tagsHtml } from './ui/editors.js';
import { DiagramView, canvasMeasure } from './views/diagram.js';
import { createRenderContext, diagramBounds, fittedSize, layoutDiagram as layoutRender, renderDiagramSvg } from './render/notation.js';
import { bytesToBase64, pdfFromJpegs, zip } from './export/files.js';
import { encodeBmp, encodeTiff, imageFormat, rasterSize } from './export/image-encode.js';
import { renderPrintSheets } from './print/render.js';

const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const measure = canvasMeasure();
const clone = (value) => JSON.parse(JSON.stringify(value));

const state = {
  settings: loadSettings(globalThis.localStorage),
  recent: loadRecent(globalThis.localStorage),
  recentDirs: loadRecentDirs(globalThis.localStorage),
  samples: [],
  docs: [],
  active: null,
  /** Selected views on the current diagram. */
  selection: { ids: [], primary: null },
  /** Selected elements in the Model Explorer. */
  explorer: [],
  tool: null,
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
  reader: null,
  presenting: null,
  pointer: null,
  rightTab: 'properties',
  collapsedEditors: new Set(),
  collapsedToolbox: new Set(),
  toolboxQuery: '',
  fonts: [],
  dynamicMenus: new Map(),
};

const activeTab = () => state.docs.find((doc) => doc.id === state.active) ?? null;
const activeDoc = activeTab;
const currentDiagram = () => activeTab()?.diagram ?? null;
const docName = (tab) => (tab.path ? baseName(tab.path) : tab.name ?? tab.project.name);
const lang = () => getLanguage();

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
  if (/^[a-z]+\.[a-zA-Z.]+$/.test(text) && t(text) !== text) return { message: t(text), detail: error?.detail ?? '' };
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
    app: info ? `${info.name} ${info.version} (${info.web ? 'web' : `${info.os}/${info.arch}`}, ${info.commit})` : `MyUMLMaker ${VERSION}`,
  });
}

window.addEventListener('error', (event) => showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''));
window.addEventListener('unhandledrejection', (event) => showError('error.unexpected', event.reason));

// ───────────────────────── projects (tabs)

function untitledName() {
  state.untitled += 1;
  return t('tabs.untitled', { n: state.untitled });
}

/** One project at a time: a new or opened project replaces the current one. Callers that come from the
 * user ask first (confirmReplace), so the replaced project is saved or its changes were given up. */
function addTab(tab) {
  state.docs.splice(0, state.docs.length, tab);
  activate(tab.id);
  persistSession();
  return tab;
}

function newProject(templateId = 'blank') {
  const project = buildTemplate(templateId, { language: lang() });
  project.name = templateId === 'blank' ? untitledName() : t(`template.${templateId}`);
  const tab = addTab(new ProjectDocument(project, { name: project.name, template: templateId !== 'blank' }));
  if (templateId !== 'blank') tab.markSaved(null);
  notify('success', t(templateId === 'blank' ? 'notice.newProject' : 'notice.fromTemplate', { name: project.name }));
  return tab;
}

/** Before another project replaces the current one: Save / Don't save / Cancel when it has changes. */
async function confirmReplace() {
  const tab = activeTab();
  if (!tab?.dirty) return true;
  const choice = await ask({
    icon: 'save', title: t('confirm.replaceTitle'), message: t('confirm.replaceMessage', { name: docName(tab) }),
    buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }],
  });
  if (choice === 'save') return saveDoc(tab);
  return choice === 'discard';
}

/** New project from the UI (menu, toolbar, start page, template): asks about unsaved changes first. */
async function newProjectAsk(templateId = 'blank') {
  if (!(await confirmReplace())) return null;
  return newProject(templateId);
}

async function openSampleAsk() {
  if (!(await confirmReplace())) return null;
  return openSampleBuiltin();
}

function openSampleBuiltin() {
  const project = buildSample(lang());
  const tab = addTab(new ProjectDocument(project, { name: project.name }));
  tab.markSaved(null);
  return tab;
}

function activate(id) {
  state.view?.finishEdit?.(true);
  state.active = id;
  state.selection = { ids: [], primary: null };
  state.explorer = [];
  state.showStart = false;
  state.reader = null;
  mountView();
  renderAll();
}

function activateDoc(id) {
  if (state.active === id && !state.showStart) return;
  activate(id);
  scrollActiveTabIntoView();
}

const view = () => state.view;

/** Applies a change to the active project as one undo step and redraws. mutate(project, diagram, tab). */
function change(labelKey, mutate, { explorer = true } = {}) {
  const tab = activeTab();
  if (!tab) return undefined;
  const diagramId = tab.view.diagramId;
  const result = tab.apply(t(labelKey), (project) => mutate(project, diagramId ? M.findById(project, diagramId) : null, tab));
  afterChange({ explorer });
  return result;
}

function afterChange({ explorer = true } = {}) {
  pruneSelection();
  updateView();
  renderTabs();
  renderStatus();
  renderToolbarState();
  if (explorer) renderExplorer();
  renderEditors();
  if (state.settings.autoValidate) scheduleValidation();
  refreshTracePopups();
}

function persistSession() {
  try {
    globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify({ files: state.docs.filter((doc) => doc.path).map((doc) => doc.path) }));
  } catch { /* ignore */ }
}

// ───────────────────────── selection

const selectedIds = () => state.selection.ids;
const hasSelection = () => state.selection.ids.length > 0;
const viewById = (id) => M.findView(currentDiagram(), id);
const selectedViews = () => selectedIds().map(viewById).filter(Boolean);
const selectedNodeViews = () => selectedViews().filter((v) => !M.isEdgeView(v));
const selectedElements = () => { const tab = activeTab(); return tab ? selectedViews().map((v) => tab.index.get(M.refId(v.model))).filter(Boolean) : []; };
const isSelected = (id) => state.selection.ids.includes(id);

function select(ids, { primary = null, fromExplorer = false } = {}) {
  const list = [...new Set(ids)].filter(Boolean);
  state.selection = { ids: list, primary: primary && list.includes(primary) ? primary : list[0] ?? null };
  if (!fromExplorer) {
    const tab = activeTab();
    const models = list.map((id) => M.refId(viewById(id)?.model)).filter(Boolean);
    state.explorer = models.length ? [...new Set(models)] : [];
    if (models.length) explorerView?.reveal(models[0]);
  }
  selectionChanged();
}

function selectionChanged() {
  state.view?.selectionChanged?.();
  renderExplorer();
  renderEditors();
  renderStatus();
  renderToolbarState();
}

function clearSelection() {
  if (state.selection.ids.length || state.explorer.length) { state.explorer = []; select([]); }
}

function pruneSelection() {
  const diagram = currentDiagram();
  const tab = activeTab();
  state.selection.ids = diagram ? state.selection.ids.filter((id) => M.findView(diagram, id)) : [];
  if (!state.selection.ids.includes(state.selection.primary)) state.selection.primary = state.selection.ids[0] ?? null;
  state.explorer = tab ? state.explorer.filter((id) => tab.index.get(id)) : [];
}

/** Selects elements in the Model Explorer (and their views on the current diagram). */
function selectElements(ids) {
  state.explorer = [...new Set(ids)];
  const diagram = currentDiagram();
  const views = diagram ? M.viewsOf(diagram).filter((v) => ids.includes(M.refId(v.model))).map((v) => v._id) : [];
  state.selection = { ids: views, primary: views[0] ?? null };
  if (views[0]) state.view?.reveal?.(views[0]);
  selectionChanged();
}

// ───────────────────────── diagrams

function openDiagram(id, { reveal = null } = {}) {
  const tab = activeTab();
  if (!tab) return;
  const diagram = tab.index.get(id);
  if (!diagram || !M.isDiagram(diagram)) return;
  state.view?.finishEdit?.();
  if (state.showStart || state.reader) { state.showStart = false; state.reader = null; }
  tab.openDiagram(id);
  state.selection = { ids: [], primary: null };
  setTool(null);
  if (!state.view) mountView(); else state.view.render();
  renderAll();
  if (reveal) setTimeout(() => selectElements([reveal]), 0);
}

function closeDiagram(id) {
  const tab = activeTab();
  if (!tab) return;
  tab.closeDiagram(id);
  state.selection = { ids: [], primary: null };
  state.view?.render();
  renderAll();
}

/** Adds a diagram of a type under the selected element (or a sensible owner). */
function addDiagram(type) {
  const tab = activeTab() ?? newProject();
  const owner = state.explorer.map((id) => tab.index.get(id)).find((e) => e && (typeDef(e._type)?.namespace || e._type === 'Project')) ?? diagramOwnerOrModel();
  const diagram = change('op.addDiagram', (project) => M.addDiagram(project, owner?._id ?? project.ownedElements[0]?._id, type, { language: lang() }));
  if (diagram) { openDiagram(diagram._id); notify('success', t('notice.diagramAdded', { name: diagram.name })); }
  return diagram;
}

/** A diagram-type tab: the last opened diagram of that type, else the first in the model, else a new one. */
function openDiagramType(type) {
  const tab = activeTab();
  if (!tab) return addDiagram(type);
  const ofType = (d) => d && d._type === type;
  const recent = [...tab.view.open].reverse().map((id) => tab.index.get(id)).find(ofType);
  const any = recent ?? [...tab.index.byId.values()].find(ofType);
  if (any) { openDiagram(any._id); return any; }
  return addDiagram(type);
}

function diagramOwnerOrModel() {
  const tab = activeTab();
  const diagram = tab?.diagram;
  if (diagram) {
    let owner = tab.index.parent(diagram._id);
    while (owner && !['UMLModel', 'UMLPackage', 'UMLSubsystem', 'Project'].includes(owner._type)) owner = tab.index.parent(owner._id);
    if (owner) return owner;
  }
  return tab?.project.ownedElements[0] ?? tab?.project;
}

// ───────────────────────── creating and editing on diagrams

function renderContext() {
  const tab = activeTab();
  const s = state.settings;
  const ctx = createRenderContext({ project: tab.project, index: tab.index, diagram: currentDiagram(), measure, language: lang(), lineStyle: s.defaultLineStyle, theme: s.diagramTheme, font: s.diagramFont, fontSize: s.diagramFontSize, showShadow: s.showShadow });
  return layoutRender(ctx);
}

/** Creates the element of a node tool with its view (Toolbox click on the canvas, or drop). */
function createNodeAt(tool, box, { keepTool = false } = {}) {
  const tab = activeTab();
  if (!tab || !currentDiagram()) return null;
  const boxes = renderContext().boxes;
  const result = change('op.addElement', (project, diagram) => E.createNode(project, diagram, tool, box, { language: lang(), boxes }));
  if (!result?.view) { notify('info', t('notice.needOwner', { type: typeLabel(tool.type, lang()) })); return null; }
  if (!keepTool) setTool(null);
  select([result.view._id]);
  if (result.element && !typeDef(result.element._type)?.nameOutside && state.settings.editAfterCreate !== false && result.element.name !== undefined && !M.isDiagram(result.element)) setTimeout(() => state.view?.startEdit?.(result.view._id), 30);
  if (!result.element) setTimeout(() => state.view?.startEdit?.(result.view._id), 30);
  return result;
}

function canConnect(tool, fromView, toView) {
  const tab = activeTab();
  return E.canConnect(tab.project, currentDiagram(), tool, fromView, toView, tab.index);
}

function createEdgeBetween(tool, tailId, headId, { y = null, keepTool = false } = {}) {
  const tail = viewById(tailId);
  const head = viewById(headId);
  if (!canConnect(tool, tail, head)) { notify('info', t('notice.cannotConnect')); return null; }
  const result = change('op.addRelationship', (project, diagram) => E.createEdge(project, diagram, tool, M.findView(diagram, tailId), M.findView(diagram, headId), { language: lang(), y }));
  if (!keepTool) setTool(null);
  if (result?.view) select([result.view._id]);
  return result;
}

/** Communication diagram: a message on the connector under the pointer. */
function addMessageOnConnector(view, point) {
  const tab = activeTab();
  const connector = view && tab.index.get(M.refId(view.model));
  if (!connector || connector._type !== 'UMLConnector') { notify('info', t('notice.pickConnector')); return; }
  const route = state.view?.ctx?.routes.get(view._id);
  const forward = !route || Math.hypot(point.x - route.points[0].x, point.y - route.points[0].y) < Math.hypot(point.x - route.points.at(-1).x, point.y - route.points.at(-1).y);
  change('op.addMessage', (project) => E.addCommunicationMessage(project, M.findById(project, connector._id), { forward, language: lang() }));
  setTool(null);
}

/** Views moved while dragging (not recorded yet). */
function moveViewsLive(ids, dx, dy) { E.moveViews(currentDiagram(), ids, dx, dy); }

/** The views after a drag become one undo step; elements dropped into packages move there. */
function commitViews(labelKey, views, movedIds = []) {
  change(labelKey, (project, diagram) => {
    diagram.ownedViews = views;
    if (movedIds.length && state.settings.reparentOnDrop) {
      const tab = activeTab();
      tab.touch();
      const ctx = createRenderContext({ project, diagram, measure, language: lang() });
      layoutRender(ctx);
      for (const id of selectedIds()) E.reparentByContainment(project, diagram, id, ctx.boxes);
    }
  });
}

function reconnect(edgeId, end, targetViewId) {
  change('op.reconnect', (project, diagram) => {
    const edge = M.findView(diagram, edgeId);
    const target = M.findView(diagram, targetViewId);
    if (!edge || !target) return;
    edge[end] = M.ref(target);
    edge.points = [];
    const element = edge.model ? M.findById(project, M.refId(edge.model)) : null;
    if (element && target.model) {
      const [a, b] = M.relationshipEnds(element);
      if (end === 'tail') M.setRelationshipEnds(element, M.refId(target.model), b); else M.setRelationshipEnds(element, a, M.refId(target.model));
    }
  });
}

function removeBend(edgeId, index) { change('op.bend', (project, diagram) => { const v = M.findView(diagram, edgeId); if (v) v.points = (v.points ?? []).filter((_, i) => i !== index); }); }

function renameElement(id, name) {
  change('op.rename', (project) => { const e = M.findById(project, id); if (e) e.name = name; });
}

/** What double-click / F2 edits on a view. */
function editModeOf(v) {
  const tab = activeTab();
  const element = v.model ? tab.index.get(M.refId(v.model)) : null;
  if (!element) {
    if (['UMLNoteView', 'UMLTextView', 'RectangleView', 'RoundRectView', 'EllipseView', 'HyperlinkView', 'UMLFrameView'].includes(v._type) || M.isEdgeView(v)) return { kind: 'viewText', text: v.text ?? '', multiline: v._type !== 'HyperlinkView' && !M.isEdgeView(v) };
    return null;
  }
  const def = typeDef(element._type);
  if (element._type === 'BPMNTextAnnotation') return { kind: 'field', key: 'text', text: element.text ?? '', multiline: true };
  if (element._type === 'UMLConstraint') return { kind: 'field', key: 'specification', text: element.specification ?? '', multiline: true };
  if (element._type === 'UMLStateInvariant') return { kind: 'field', key: 'invariant', text: element.invariant ?? '', multiline: false };
  if (!M.isEdgeView(v) && (def?.compartments ?? []).some((k) => ['attributes', 'operations', 'literals', 'columns'].includes(k)) && def.shape !== 'actor' && def.shape !== 'usecase') return { kind: 'quick', text: quickEditText(element), multiline: true, element: element._id };
  if (element._type === 'UMLCombinedFragment') return { kind: 'guards', text: (element.operands ?? []).map((o) => o.guard ?? '').join('\n'), multiline: true };
  return { kind: 'name', text: element.name ?? '', multiline: element._type === 'UMLAction' || element._type === 'FCProcess' || /^(FC|BPMNTask|DFD)/.test(element._type) };
}

/** The class as editable text: «stereotype» Name / -- / attributes / -- / operations (StarUML quick edit). */
function quickEditText(element) {
  const index = activeTab().index;
  const lines = [`${element.stereotype && typeof element.stereotype === 'string' ? `«${element.stereotype}» ` : ''}${element.name ?? ''}`];
  if (element._type === 'ERDEntity') { lines.push('--'); for (const c of element.columns ?? []) lines.push(`${c.primaryKey ? 'PK ' : ''}${c.foreignKey ? 'FK ' : ''}${c.name}: ${c.type}${c.length ? `(${c.length})` : ''}`); return lines.join('\n'); }
  if (element._type === 'UMLEnumeration') { lines.push('--'); for (const l of element.literals ?? []) lines.push(l.name); }
  const def = typeDef(element._type);
  if ((def.compartments ?? []).includes('attributes')) { lines.push('--'); for (const a of element.attributes ?? []) lines.push(attributeText(a, index)); }
  if ((def.compartments ?? []).includes('operations')) { lines.push('--'); for (const o of element.operations ?? []) lines.push(operationText(o, index)); }
  return lines.join('\n');
}

/** Applies a quick edit: members are matched by position so their ids (and links) stay. */
function applyQuickEdit(project, element, text) {
  const sections = String(text).split(/\r?\n\s*-{2,}\s*(?:\r?\n|$)/);
  const head = parseNameWithStereotype(sections[0].split(/\r?\n/)[0] ?? '');
  element.name = head.name;
  if (head.stereotype !== undefined) element.stereotype = head.stereotype;
  const lines = (i) => (sections[i] ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const merge = (key, type, parsed) => {
    const list = element[key] ?? [];
    const next = parsed.map((fields, i) => {
      const keep = list[i] && list[i]._type === type ? list[i] : M.createElement(type, {}, { language: lang() });
      if (type === 'UMLOperation') {
        const params = fields.parameters;
        delete fields.parameters;
        const old = keep.parameters ?? [];
        keep.parameters = params.map((p, k) => Object.assign(old[k] ?? M.createElement('UMLParameter', {}, { language: lang() }), p, { type: resolveTypeName(project, p.type) }));
      }
      if (fields.type !== undefined) fields.type = resolveTypeName(project, fields.type);
      return Object.assign(keep, fields);
    });
    element[key] = next;
    M.linkParents(element);
  };
  const def = typeDef(element._type);
  let i = 1;
  if (element._type === 'ERDEntity') {
    merge('columns', 'ERDColumn', lines(1).map((line) => {
      const m = /^((?:PK|FK|\s)+)?\s*([^:\s]+)\s*(?::\s*([A-Za-z_]+)(?:\(([^)]*)\))?)?/.exec(line);
      const keys = (m?.[1] ?? '').toUpperCase();
      return { name: m?.[2] ?? line, type: m?.[3] ?? 'VARCHAR', length: m?.[4] ?? '', primaryKey: keys.includes('PK'), foreignKey: keys.includes('FK') };
    }));
    return;
  }
  if (element._type === 'UMLEnumeration') { merge('literals', 'UMLEnumerationLiteral', lines(i).map((name) => ({ name }))); i += 1; }
  if ((def.compartments ?? []).includes('attributes')) { merge('attributes', 'UMLAttribute', lines(i).map(parseAttribute).filter(Boolean)); i += 1; }
  if ((def.compartments ?? []).includes('operations')) { merge('operations', 'UMLOperation', lines(i).map(parseOperation).filter(Boolean)); }
}

/** A type typed as text: a reference when a classifier has that name, else the text. */
function resolveTypeName(project, text) {
  const name = String(text ?? '').trim();
  if (!name) return '';
  const match = M.elementsWhere(project, (e) => CLASSIFIER_TYPES.includes(e._type) && e.name === name);
  return match.length === 1 ? M.ref(match[0]) : name;
}

function commitEdit(viewId, value, mode) {
  change('op.edit', (project, diagram) => {
    const v = M.findView(diagram, viewId);
    if (!v) return;
    if (mode.kind === 'viewText') { v.text = value; return; }
    const element = M.findById(project, M.refId(v.model));
    if (!element) return;
    if (mode.kind === 'quick') applyQuickEdit(project, element, value);
    else if (mode.kind === 'field') element[mode.key] = value;
    else if (mode.kind === 'guards') value.split(/\r?\n/).forEach((g, i) => { if (element.operands?.[i]) element.operands[i].guard = g.trim(); else M.insertElement(element, M.createElement('UMLInteractionOperand', { guard: g.trim() })); });
    else {
      const parsed = parseNameWithStereotype(value);
      element.name = mode.multiline ? value : parsed.name;
      if (!mode.multiline && parsed.stereotype !== undefined) element.stereotype = parsed.stereotype;
      // A message typed as "name(args)" keeps the arguments apart.
      if (element._type === 'UMLMessage') { const m = /^([^(]*)\((.*)\)\s*$/.exec(value.trim()); if (m) { element.name = m[1].trim(); element.arguments = m[2]; } }
    }
  });
}

/** Quick buttons under a selected element. */
function quickAction(action, viewId, anchorElement) {
  const v = viewById(viewId);
  const tab = activeTab();
  const element = v && tab.index.get(M.refId(v.model));
  if (!element) return;
  const add = (key, type, attrs = {}) => change('op.addMember', (project) => { const owner = M.findById(project, element._id); const sibs = owner[key] ?? []; return M.insertElement(owner, M.createElement(type, attrs, { language: lang(), siblings: sibs })); });
  switch (action) {
    case 'addAttribute': add('attributes', 'UMLAttribute', { visibility: 'private', type: element._type === 'UMLInterface' ? '' : 'String' }); break;
    case 'addOperation': add('operations', 'UMLOperation', { visibility: 'public' }); break;
    case 'addLiteral': add('literals', 'UMLEnumerationLiteral'); break;
    case 'addColumn': add('columns', 'ERDColumn', { type: 'VARCHAR' }); break;
    case 'addSlot': add('slots', 'UMLSlot', { value: '' }); break;
    case 'addOperand': add('operands', 'UMLInteractionOperand', { guard: '' }); break;
    case 'addTimeSegment': add('timeSegments', 'UMLTimeSegment', { state: String(element.states ?? '').split(',')[0]?.trim() ?? '', duration: 10 }); break;
    case 'related': return relatedMenu(viewId, anchorBelow(anchorElement));
    default: return undefined;
  }
  if (action !== 'addOperand' && action !== 'addTimeSegment') setTimeout(() => state.view?.startEdit?.(viewId), 30);
  return undefined;
}

function relatedMenu(viewId, anchor) {
  const tab = activeTab();
  const element = tab.index.get(M.refId(viewById(viewId)?.model));
  const kinds = E.relatedFor(element);
  const items = kinds.map((k) => ({ id: `custom:${k}`, label: t(`related.${k}`), icon: TYPES[E.RELATED[k].type]?.icon ?? 'plus' }));
  const handlers = Object.fromEntries(kinds.map((k) => [`custom:${k}`, () => addRelated(viewId, k)]));
  return showMenu(items, anchor, 'context', { handlers, header: { icon: 'plus', title: t('quick.related') } });
}

function addRelated(viewId, kind) {
  const boxes = renderContext().boxes;
  const result = change('op.addRelated', (project, diagram) => E.addRelated(project, diagram, viewId, kind, { language: lang(), boxes }));
  if (result?.view) { select([result.view._id]); setTimeout(() => state.view?.startEdit?.(result.view._id), 30); }
}

/** Elements dragged from the Model Explorer onto the diagram. */
function dropElements(ids, point) {
  const tab = activeTab();
  if (!currentDiagram()) return;
  const added = change('op.showElement', (project, diagram) => {
    const out = [];
    let at = { ...point };
    for (const id of ids) {
      const element = M.findById(project, id);
      if (!element) continue;
      if (M.isDiagram(element)) continue;
      const shown = M.viewsOfModel(diagram, id).find((v) => !M.isEdgeView(v));
      if (shown && !typeDef(element._type)?.edge && !/Sequence|Communication/.test(diagram._type)) { out.push(shown); continue; }
      const v = E.dropElement(project, diagram, id, at, { language: lang() });
      if (v) out.push(v);
      at = { x: at.x + 30, y: at.y + 30 };
    }
    if (state.settings.showRelationsOnDrop !== false) M.addMissingEdgeViews(project, diagram);
    return out;
  });
  if (added?.length) select(added.map((v) => v._id)); else if (ids.some((id) => M.isDiagram(tab.index.get(id)))) openDiagram(ids.find((id) => M.isDiagram(tab.index.get(id))));
  else notify('info', t('notice.cannotShow'));
}

function moveElements(ids, ownerId) {
  const moved = change('op.moveElement', (project) => ids.filter((id) => M.moveElement(project, id, ownerId)).length);
  if (!moved) notify('info', t('notice.cannotMove'));
}

// ───────────────────────── delete, clipboard

/** Delete: views only (the model keeps its elements). */
function deleteFromView() {
  if (!hasSelection()) return;
  const ids = [...selectedIds()];
  change('op.deleteView', (project, diagram) => M.removeViews(diagram, ids));
  select([]);
}

/** Ctrl+Delete: elements from the model (and all their views). */
async function deleteFromModel() {
  const tab = activeTab();
  if (!tab) return;
  let ids = selectedElements().map((e) => e._id);
  const annotations = selectedViews().filter((v) => !v.model).map((v) => v._id);
  if (!ids.length) ids = state.explorer.filter((id) => tab.index.get(id)?._type !== 'Project');
  if (!ids.length && !annotations.length) return;
  const names = ids.map((id) => M.displayName(tab.index.get(id), lang()));
  if (ids.length && !(await confirmDelete(names, 'element'))) return;
  change('op.deleteElement', (project, diagram) => {
    if (diagram && annotations.length) M.removeViews(diagram, annotations);
    M.removeElements(project, ids);
  });
  state.explorer = [];
  select([]);
  if (!currentDiagram()) state.view?.render();
}

function copySelection({ cut = false } = {}) {
  const tab = activeTab();
  if (!tab) return;
  const diagram = currentDiagram();
  if (hasSelection() && diagram) {
    const views = selectedViews();
    const ids = new Set(views.map((v) => v._id));
    // Lines between copied nodes come along.
    for (const v of M.viewsOf(diagram)) if (M.isEdgeView(v) && ids.has(M.refId(v.tail)) && ids.has(M.refId(v.head))) ids.add(v._id);
    const allViews = M.viewsOf(diagram).filter((v) => ids.has(v._id));
    const models = [...new Set(allViews.map((v) => M.refId(v.model)).filter(Boolean))].map((id) => tab.index.get(id)).filter((e) => e && !typeDef(e._type)?.feature);
    state.clipboard = { kind: 'views', views: clone(allViews), elements: clone(models), owners: models.map((e) => tab.index.parent(e._id)?._id ?? null), diagramType: diagram._type };
    native.clipboardWrite(models.map((e) => e.name).filter(Boolean).join('\n') || ' ').catch(() => {});
    notify('success', t('notice.copied', { count: allViews.length }));
    if (cut) deleteFromView();
    return;
  }
  const elements = state.explorer.map((id) => tab.index.get(id)).filter((e) => e && e._type !== 'Project');
  if (elements.length) {
    state.clipboard = { kind: 'elements', elements: clone(elements) };
    notify('success', t('notice.copied', { count: elements.length }));
    if (cut) deleteFromModel();
  }
}

function pasteClipboard({ at = null } = {}) {
  const clip = state.clipboard;
  const tab = activeTab();
  if (!clip || !tab) return;
  if (clip.kind === 'elements' || !currentDiagram()) {
    const target = tab.index.get(state.explorer[0]) ?? tab.project.ownedElements[0];
    const added = change('op.paste', (project) => {
      const owner = M.findById(project, target._id) ?? project;
      const { items } = M.cloneWithNewIds(clip.elements);
      return items.filter((e) => M.canContain(owner, e._type)).map((e) => M.insertElement(owner, e));
    });
    if (added?.length) selectElements(added.map((e) => e._id)); else notify('info', t('notice.cannotPaste'));
    return;
  }
  const views = change('op.paste', (project, diagram) => {
    const { items, map } = M.cloneWithNewIds([...clip.elements, ...clip.views]);
    const elements = items.slice(0, clip.elements.length);
    const newViews = items.slice(clip.elements.length);
    const owner = E.diagramOwner(project, diagram);
    elements.forEach((e, i) => {
      const original = clip.owners[i] && M.findById(project, clip.owners[i]);
      const target = original && M.canContain(original, e._type) ? original : owner;
      M.insertElement(M.canContain(target, e._type) ? target : project.ownedElements[0], e);
      if (e.name && !typeDef(e._type)?.edge) e.name = M.uniqueName(M.siblingsIn(target, e._type).filter((x) => x !== e), e.name.replace(/\d+$/, '') || e.name);
    });
    // Views of elements that were not copied (features) keep pointing at the originals.
    const offset = at ? null : 24;
    const nodes = newViews.filter((v) => !M.isEdgeView(v));
    const minX = Math.min(...nodes.map((v) => v.left ?? 0)); const minY = Math.min(...nodes.map((v) => v.top ?? 0));
    for (const v of newViews) {
      if (v.model && !map.has(M.refId(v.model)) && !M.findById(project, M.refId(v.model))) continue;
      if (!M.isEdgeView(v)) { v.left = at ? Math.round(at.x + (v.left - minX)) : v.left + offset; v.top = at ? Math.round(at.y + (v.top - minY)) : v.top + offset; } else { v.points = (v.points ?? []).map((p) => ({ x: p.x + (offset ?? 0), y: p.y + (offset ?? 0) })); if (v.y !== undefined) v.y += offset ?? 0; }
      M.addView(diagram, v);
    }
    M.removeDeadViews(diagram);
    return newViews.filter((v) => M.findView(diagram, v._id));
  });
  if (views?.length) select(views.map((v) => v._id));
}

function duplicate() { copySelection(); pasteClipboard(); }

// ───────────────────────── arrange & format

const boxesNow = () => renderContext().boxes;
function align(how) { const boxes = boxesNow(); const n = change('op.align', (project, diagram) => E.alignViews(diagram, selectedIds(), how, boxes)); if (!n) notify('info', t('notice.selectTwo')); }
function distribute(axis) { const boxes = boxesNow(); const n = change('op.distribute', (project, diagram) => E.distributeViews(diagram, selectedIds(), axis, boxes)); if (!n) notify('info', t('notice.selectThree')); }
function sameSize(which) { const boxes = boxesNow(); change('op.size', (project, diagram) => E.sameSizeViews(diagram, selectedIds(), which, boxes)); }
function reorder(how) { change('op.order', (project, diagram) => E.reorderViews(diagram, selectedIds(), how)); }

function setViewStyle(patch, ids = selectedIds()) {
  if (!ids.length) return;
  change('op.style', (project, diagram) => {
    for (const id of ids) {
      const v = M.findView(diagram, id);
      if (!v) continue;
      for (const [key, value] of Object.entries(patch)) { if (value === null || value === '' || value === undefined) delete v[key]; else v[key] = value; }
    }
  });
}

function fitToContent() {
  const ctx = renderContext();
  change('op.size', (project, diagram) => {
    for (const id of selectedIds()) {
      const v = M.findView(diagram, id);
      if (!v || M.isEdgeView(v)) continue;
      const fit = fittedSize(ctx, v);
      v.width = Math.round(fit.w); v.height = Math.round(fit.h);
    }
  });
}

function runLayout(direction = 'TB') {
  const tab = activeTab();
  if (!currentDiagram()) return;
  const boxes = boxesNow();
  const ids = selectedIds();
  const moved = change('op.layout', (project, diagram) => autoLayout(ids.length > 1 ? { ...diagram, ownedViews: diagram.ownedViews.filter((v) => ids.includes(v._id) || M.isEdgeView(v)) } : diagram, boxes, tab.index, { direction }));
  notify('success', t('notice.layout', { count: moved ?? 0 }));
  state.view?.fitPage?.();
}

// ───────────────────────── model commands

function addElementTo(ownerId, type) {
  const created = change('op.addElement', (project) => {
    const owner = M.findById(project, ownerId) ?? project;
    if (!M.canContain(owner, type)) return null;
    return M.addElement(project, owner._id, type, type === 'UMLAttribute' ? { type: 'String' } : {}, { language: lang() });
  });
  if (created) { explorerView?.expanded.add(ownerId); selectElements([created._id]); setTimeout(() => explorerView?.startRename(created._id), 40); } else notify('info', t('notice.cannotAdd'));
}

/** Element types that may be added to an element (Model › Add). */
function addableTypes(element) {
  return Object.keys(TYPES).filter((type) => {
    const def = TYPES[type];
    if (def.diagram || def.edge || type === 'Project' || type === 'UMLRegion' || type === 'UMLAssociationEnd' || type === 'ERDRelationshipEnd' || type === 'UMLTag' || type === 'UMLMessage') return false;
    if (element._type === 'Project') return ['UMLModel', 'UMLPackage', 'UMLProfile', 'ERDDataModel', 'FCFlowchart', 'DFDDataFlowModel', 'BPMNProcess', 'C4Model', 'MMMindmap', 'WFWireframe', 'CloudModel'].includes(type);
    if (!M.canContain(element, type)) return false;
    // UML owners get UML features; SysML owners get both.
    if (/^UML/.test(element._type) && /^SysML/.test(type) && def.feature !== undefined && !['UMLModel', 'UMLPackage'].includes(element._type)) return false;
    if (/^UML/.test(element._type) && /^SysML(Reference|Value|FlowProperty|Part|Port)$/.test(type)) return false;
    if (['UMLModel', 'UMLPackage', 'UMLSubsystem'].includes(element._type)) return ['package', 'classifier', 'behavior', 'instance', 'annotation', 'sysml', 'c4'].includes(def.group) || type === 'UMLModel';
    return true;
  });
}

function addElementMenu(anchor, ownerId = state.explorer[0] ?? selectedElements()[0]?._id ?? activeTab()?.project.ownedElements[0]?._id) {
  const tab = activeTab();
  const owner = tab?.index.get(ownerId) ?? tab?.project;
  if (!owner) return undefined;
  const types = addableTypes(owner);
  if (!types.length) { notify('info', t('notice.cannotAdd')); return undefined; }
  const groups = {};
  for (const type of types) (groups[TYPES[type].group] ??= []).push(type);
  const entries = Object.entries(groups);
  const items = []; const handlers = {};
  const leaf = (type) => { handlers[`custom:${type}`] = () => addElementTo(owner._id, type); return { id: `custom:${type}`, label: typeLabel(type, lang()), icon: TYPES[type].icon ?? 'plus' }; };
  if (types.length <= 18) items.push(...types.map(leaf));
  else for (const [group, list] of entries) {
    const key = `add:${group}`;
    state.dynamicMenus.set(key, { items: list.map(leaf), handlers, header: { icon: 'plus', title: t(`group.${group}`) } });
    items.push({ id: `submenu:${key}`, label: t(`group.${group}`), icon: TYPES[list[0]].icon ?? 'plus', submenu: true });
  }
  return showMenu(items, anchor ?? anchorFor('addElement'), 'context', { handlers, header: { icon: 'plus', title: t('action.addElementTo', { name: M.displayName(owner, lang()) || t('explorer.project') }) } });
}

function addDiagramMenu(anchor) {
  const items = []; const handlers = {};
  for (const [family, ko, en] of DIAGRAM_FAMILIES) {
    const types = Object.keys(DIAGRAM_TYPES).filter((type) => DIAGRAM_TYPES[type].family === family);
    const leaves = types.map((type) => { handlers[`custom:${type}`] = () => addDiagram(type); return { id: `custom:${type}`, label: typeLabel(type, lang()), icon: DIAGRAM_TYPES[type].icon }; });
    if (leaves.length === 1) { items.push(leaves[0]); continue; }
    const key = `diagram:${family}`;
    state.dynamicMenus.set(key, { items: leaves, handlers, header: { icon: 'dgClass', title: lang() === 'ko' ? ko : en } });
    items.push({ id: `submenu:${key}`, label: lang() === 'ko' ? ko : en, icon: DIAGRAM_TYPES[types[0]].icon, submenu: true });
  }
  return showMenu(items, anchor ?? anchorFor('addDiagram'), 'context', { handlers, header: { icon: 'dgClass', title: t('action.addDiagram') } });
}

function moveInModel(direction) {
  const id = state.explorer[0] ?? selectedElements()[0]?._id;
  if (id) change('op.reorderElement', (project) => M.reorderElement(project, id, direction));
}

/** Shows on the current diagram every relationship between elements already on it. */
function showRelations() {
  const added = change('op.showElement', (project, diagram) => M.addMissingEdgeViews(project, diagram));
  notify('info', t('notice.relationsShown', { count: added?.length ?? 0 }));
}

function selectInExplorer() {
  const ids = selectedElements().map((e) => e._id);
  if (!ids.length) return;
  if (!state.settings.showRightPanel) updateSettings({ showRightPanel: true });
  state.explorer = ids;
  explorerView?.reveal(ids[0]);
  renderExplorer();
}

/** Opens a diagram showing the element and selects its view. */
function selectInDiagram(id = state.explorer[0]) {
  const tab = activeTab();
  const views = M.viewsEverywhere(tab.project, id);
  if (!views.length) { notify('info', t('props.noViews')); return; }
  const current = views.find((x) => x.diagram._id === tab.view.diagramId) ?? views[0];
  if (current.diagram._id !== tab.view.diagramId) openDiagram(current.diagram._id);
  select([current.view._id]);
  state.view?.reveal(current.view._id);
}

// ───────────────────────── properties / editors

function setField(id, key, raw, input) {
  const tab = activeTab();
  const element = tab.index.get(id);
  if (!element) return;
  const field = [...(typeDef(element._type)?.fields ?? []), { key: 'documentation', type: 'text' }, { key: 'name', type: 'string' }].find((f) => f.key === key) ?? { key, type: input?.type === 'checkbox' ? 'bool' : 'string' };
  let value = raw;
  if (input?.type === 'checkbox') value = input.checked;
  else if (field.type === 'ref') value = raw ? M.ref(raw) : null;
  else if (field.type === 'type') value = resolveTypeName(tab.project, raw);
  else if (field.type === 'int') value = Number(raw) || 0;
  else if (field.type === 'multiplicity' && !isMultiplicity(raw)) notify('info', t('notice.badMultiplicity', { value: raw }));
  change('op.property', (project) => {
    const target = M.findById(project, id);
    if (!target) return;
    if (value === null || value === undefined) delete target[key]; else target[key] = value;
    // A diagram marked default: no other diagram is.
    if (key === 'defaultDiagram' && value) for (const d of M.allDiagrams(project)) if (d._id !== id) d.defaultDiagram = false;
  }, { explorer: key === 'name' || key === 'stereotype' });
}

function memberAction(kind, data) {
  const tab = activeTab();
  if (kind === 'add') {
    const [key, type] = data.spec.split(':');
    const created = change('op.addMember', (project) => {
      const owner = M.findById(project, data.owner);
      if (!owner) return null;
      const attrs = type === 'UMLAttribute' ? { visibility: 'private', type: 'String' } : type === 'ERDColumn' ? { type: 'VARCHAR' } : type === 'UMLConstraint' ? { specification: '' } : {};
      const el = M.createElement(type, attrs, { language: lang(), siblings: owner[key] ?? [] });
      owner[key] ??= [];
      owner[key].push(el);
      M.linkParents(owner);
      return el;
    });
    if (created && type !== 'UMLConstraint') { explorerView?.expanded.add(data.owner); renderExplorer(); }
    return;
  }
  if (kind === 'delete') { change('op.deleteElement', (project) => M.removeElements(project, [data.id])); return; }
  if (kind === 'move') { const [id, dir] = data.spec.split(':'); change('op.reorderElement', (project) => M.reorderElement(project, id, Number(dir))); }
  void tab;
}

function tagAction(kind, data) {
  change('op.tag', (project) => {
    if (kind === 'add') { const e = M.findById(project, data.id); if (e) M.setTag(e, `tag${(e.tags?.length ?? 0) + 1}`, ''); return; }
    const [tagId, key] = (data.spec ?? '').split(':');
    const tag = M.findById(project, kind === 'delete' ? data.id : tagId);
    if (!tag) return;
    const owner = M.ownerOf(project, tag._id);
    if (kind === 'delete') { owner.tags = owner.tags.filter((x) => x !== tag); return; }
    tag[key] = data.value;
  });
}

function viewsOfElement(id) { return M.viewsEverywhere(activeTab().project, id); }

// ───────────────────────── views (canvas mount)

function mountView() {
  state.view?.destroy?.();
  state.view = null;
  const host = root.querySelector('#view-host');
  if (!host) return;
  host.innerHTML = '';
  if (!activeTab() || state.showStart || state.reader) return;
  host.hidden = false;
  root.classList.remove('on-start', 'on-reader');
  state.view = new DiagramView(appApi, host);
  state.view.render();
}

function updateView() {
  if (state.view) state.view.update();
}

function renderView() {
  const host = root.querySelector('#view-host');
  const start = root.querySelector('#start-page');
  const reader = root.querySelector('#reader-page');
  const reading = Boolean(state.reader);
  const showStart = !reading && (state.showStart || !activeTab());
  root.classList.toggle('on-start', showStart || reading);
  root.classList.toggle('on-reader', reading);
  host.hidden = showStart || reading;
  start.hidden = !showStart;
  reader.hidden = !reading;
  if (reading) renderReader();
  else if (showStart) renderStartPage();
  else if (!state.view) mountView();
}

// ───────────────────────── zoom

function zoomPercent() { const tab = activeTab(); const d = tab?.diagram; return Math.round(d ? tab.view.zoom[d._id] ?? 100 : 100); }

function setCanvasZoom(percent) {
  if (!state.view) return;
  state.view.zoomTo(percent);
}

function zoomChanged() { renderStatus(); renderToolbarState(); }

function setUiZoom(value) {
  updateSettings({ zoom: Math.max(ZOOM.min, Math.min(ZOOM.max, value)) });
}

// ───────────────────────── tools

function setTool(tool) {
  state.tool = tool;
  root.dataset.tool = tool ? tool.kind : 'pointer';
  if (state.view?.hoverId) { state.view.hoverId = null; state.view.renderOverlay(); }
  renderToolbox();
  renderToolbarState();
  renderStatus();
}

function pickTool(id) {
  const diagram = currentDiagram();
  if (!diagram) { notify('info', t('canvas.noDiagram')); return; }
  const tool = toolById(diagram._type, id);
  if (!tool) return;
  setTool(state.tool?.id === id ? null : tool);
}

// ───────────────────────── commands

const hasDoc = () => Boolean(activeTab());
const hasDiagram = () => hasDoc() && Boolean(currentDiagram()) && !state.showStart && !state.reader;
const multi = () => selectedIds().length > 1;
const hasElementSel = () => selectedElements().length > 0 || state.explorer.length > 0;
const toggle = (key) => updateSettings({ [key]: !state.settings[key] });

const commands = {
  // file
  new: { icon: 'fileNew', label: 'action.new', key: 'Ctrl+N', run: () => newProjectAsk() },
  newFromTemplate: { icon: 'templateNew', label: 'action.newFromTemplate', run: (context) => templateMenu(context?.anchor) },
  open: { icon: 'folderOpen', label: 'action.open', key: 'Ctrl+O', run: () => openWithDialog() },
  startPage: { icon: 'home', label: 'action.startPage', key: 'Ctrl+Shift+H', checked: () => state.showStart || !hasDoc(), run: () => showStartPage(!state.showStart || !hasDoc()) },
  save: { icon: 'save', label: 'action.save', key: 'Ctrl+S', enabled: hasDoc, run: () => saveDoc(activeTab()) },
  saveAs: { icon: 'saveAs', label: 'action.saveAs', key: 'Ctrl+Shift+S', enabled: hasDoc, run: () => saveDoc(activeTab(), { saveAs: true }) },
  saveAll: { icon: 'saveAll', label: 'action.saveAll', key: 'Ctrl+Alt+S', enabled: () => state.docs.some((doc) => doc.dirty), run: () => saveAll() },
  saveTemplate: { icon: 'template', label: 'action.saveTemplate', enabled: hasDoc, run: () => exportAs('mumlt') },
  dbSave: { icon: 'dbSave', label: 'action.dbSave', enabled: () => desktop && hasDoc(), run: () => saveToDatabase(activeTab()) },
  dbOpen: { icon: 'dbOpen', label: 'action.dbOpen', enabled: () => desktop, run: () => openFromDatabase() },
  importStarUml: { icon: 'starUml', label: 'action.importStarUml', run: () => openWithDialog(null, 'mdj') },
  importFragment: { icon: 'fragmentIn', label: 'action.importFragment', enabled: hasDoc, run: () => importFragmentFile() },
  importText: { icon: 'textImport', label: 'action.importText', run: () => openTextImport() },
  exportStarUml: { icon: 'starUmlExport', label: 'action.exportStarUml', enabled: hasDoc, run: () => exportAs('mdj') },
  exportFragment: { icon: 'fragmentOut', label: 'action.exportFragment', enabled: hasElementSel, run: () => exportAs('mfj') },
  exportImage: { icon: 'exportImage', label: 'action.exportImage', enabled: hasDiagram, run: () => exportImage() },
  exportSvg: { icon: 'svgFile', label: 'action.exportSvg', enabled: hasDiagram, run: () => exportAs('svg') },
  exportPdf: { icon: 'pdfFile', label: 'action.exportPdf', enabled: hasDoc, run: () => exportPdf() },
  exportAllImages: { icon: 'exportAll', label: 'action.exportAllImages', enabled: hasDoc, run: () => exportAllImages() },
  exportHtml: { icon: 'htmlFile', label: 'action.exportHtml', enabled: hasDoc, run: () => exportAs('html') },
  exportMarkdown: { icon: 'markdownFile', label: 'action.exportMarkdown', enabled: hasDoc, run: () => exportAs('md') },
  exportMermaid: { icon: 'mermaid', label: 'action.exportMermaid', enabled: hasDiagram, run: () => exportAs('mmd') },
  exportPlantUml: { icon: 'plantuml', label: 'action.exportPlantUml', enabled: hasDiagram, run: () => exportAs('puml') },
  exportMenu: { icon: 'chevronDown', label: 'action.exportMenu', enabled: hasDoc, run: (context) => showMenu(menuItems(SUBMENUS.exportTo.items), context?.anchor ?? anchorFor('exportMenu'), 'context', { header: { icon: 'exportFile', title: t('submenu.exportTo') } }) },
  recent: { icon: 'recent', label: 'action.recent', key: 'Ctrl+R', run: () => popups.open('recent', {}) },
  recentFolders: { icon: 'recentFolder', label: 'action.recentFolders', run: (context) => recentFoldersMenu(context?.anchor) },
  clearRecent: { icon: 'clearHistory', label: 'action.clearRecent', enabled: () => state.recent.length > 0 || state.recentDirs.length > 0, run: () => clearRecentAll() },
  print: { icon: 'print', label: 'action.print', key: 'Ctrl+P', enabled: hasDoc, run: () => openPrint() },
  projectProps: { icon: 'docProps', label: 'action.projectProps', enabled: hasDoc, run: () => { selectElements([activeTab().project._id]); state.rightTab = 'properties'; renderEditors(); } },
  closeTab: { icon: 'closeTab', label: 'action.closeTab', key: 'Ctrl+W', enabled: hasDoc, run: () => closeDoc(activeTab()) },
  closeAll: { icon: 'closeAll', label: 'action.closeAll', enabled: () => state.docs.length > 0, run: () => closeAll() },
  exit: { icon: 'exit', label: 'action.exit', key: isMac ? 'Ctrl+Q' : 'Alt+F4', run: () => requestExit() },
  // edit
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: () => Boolean(activeTab()?.history.canUndo), run: () => undo() },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: () => Boolean(activeTab()?.history.canRedo), run: () => redo() },
  cut: { icon: 'cut', label: 'action.cut', key: 'Ctrl+X', enabled: () => hasSelection() || state.explorer.length > 0, run: () => copySelection({ cut: true }) },
  copy: { icon: 'copy', label: 'action.copy', key: 'Ctrl+C', enabled: () => hasSelection() || state.explorer.length > 0, run: () => copySelection() },
  paste: { icon: 'paste', label: 'action.paste', key: 'Ctrl+V', enabled: () => Boolean(state.clipboard) && hasDoc(), run: (context) => pasteClipboard({ at: context?.point ?? null }) },
  duplicate: { icon: 'duplicate', label: 'action.duplicate', key: 'Ctrl+D', enabled: hasSelection, run: () => duplicate() },
  delete: { icon: 'trash', label: 'action.delete', key: 'Delete', enabled: hasSelection, run: () => deleteFromView() },
  deleteFromModel: { icon: 'deleteModel', label: 'action.deleteFromModel', key: 'Ctrl+Delete', enabled: () => hasElementSel() || selectedViews().some((v) => !v.model), run: () => deleteFromModel() },
  selectAll: { icon: 'selectAll', label: 'action.selectAll', key: 'Ctrl+A', enabled: hasDiagram, run: () => select(M.viewsOf(currentDiagram()).map((v) => v._id)) },
  selectInExplorer: { icon: 'selectInExplorer', label: 'action.selectInExplorer', key: 'Ctrl+E', enabled: () => selectedElements().length > 0, run: () => selectInExplorer() },
  selectInDiagram: { icon: 'selectInDiagram', label: 'action.selectInDiagram', enabled: () => state.explorer.length > 0, run: () => selectInDiagram() },
  clearSelection: { icon: 'deselect', label: 'action.clearSelection', key: 'Esc', enabled: () => hasSelection() || state.explorer.length > 0, run: () => clearSelection() },
  find: { icon: 'search', label: 'action.find', key: 'Ctrl+F', enabled: hasDoc, run: () => openFind() },
  editName: { icon: 'textTool', label: 'action.editName', key: 'F2', enabled: () => selectedIds().length === 1, run: () => state.view?.startEdit(selectedIds()[0]) },
  // model
  addDiagram: { icon: 'dgAdd', label: 'action.addDiagram', run: (context) => addDiagramMenu(context?.anchor) },
  addElement: { icon: 'plus', label: 'action.addElement', enabled: hasDoc, run: (context) => addElementMenu(context?.anchor) },
  moveUp: { icon: 'arrowUp', label: 'action.moveUp', key: 'Ctrl+Up', enabled: hasElementSel, run: () => moveInModel(-1) },
  moveDown: { icon: 'arrowDown', label: 'action.moveDown', key: 'Ctrl+Down', enabled: hasElementSel, run: () => moveInModel(1) },
  showRelations: { icon: 'showRelations', label: 'action.showRelations', enabled: hasDiagram, run: () => showRelations() },
  unusedElements: { icon: 'unused', label: 'action.unusedElements', enabled: hasDoc, run: () => showUnused() },
  requirements: { icon: 'sysmlRequirement', label: 'action.requirements', enabled: hasDoc, run: () => openRequirements() },
  traceMatrix: { icon: 'table', label: 'action.traceMatrix', enabled: hasDoc, run: () => openTraceMatrix() },
  validate: { icon: 'validate', label: 'action.validate', key: 'Ctrl+Shift+V', enabled: hasDoc, run: () => runValidation() },
  statistics: { icon: 'statistics', label: 'action.statistics', enabled: hasDoc, run: () => showStatistics() },
  // tools
  ...Object.fromEntries(['pointer'].map((id) => [`tool:${id}`, { icon: 'pointer', label: 'tool.pointer', key: 'Ctrl+1', checked: () => !state.tool, run: () => setTool(null) }])),
  generateCode: { icon: 'generateCode', label: 'action.generateCode', key: 'Ctrl+Shift+G', enabled: hasDoc, run: () => openCodegen() },
  reverse: { icon: 'reverseCode', label: 'action.reverse', key: 'Ctrl+Shift+R', run: (context) => reverseMenu(context?.anchor) },
  generateDdl: { icon: 'sqlFile', label: 'action.generateDdl', enabled: hasDoc, run: () => openCodegen('sql') },
  // format
  fillColor: { icon: 'fillColor', label: 'action.fillColor', enabled: () => selectedNodeViews().length > 0, run: (context) => pickColor('fillColor', context?.anchor) },
  lineColor: { icon: 'lineColor', label: 'action.lineColor', enabled: hasSelection, run: (context) => pickColor('lineColor', context?.anchor) },
  fontColor: { icon: 'textColor', label: 'action.fontColor', enabled: hasSelection, run: (context) => pickColor('fontColor', context?.anchor) },
  bold: { icon: 'bold', label: 'action.bold', key: 'Ctrl+B', enabled: hasSelection, checked: () => hasSelection() && selectedViews().every((v) => v.bold), run: () => setViewStyle({ bold: !selectedViews().every((v) => v.bold) || null }) },
  italic: { icon: 'italic', label: 'action.italic', key: 'Ctrl+I', enabled: hasSelection, checked: () => hasSelection() && selectedViews().every((v) => v.italic), run: () => setViewStyle({ italic: !selectedViews().every((v) => v.italic) || null }) },
  fontUp: { icon: 'fontUp', label: 'action.fontUp', key: 'Ctrl+Shift+>', enabled: hasSelection, run: () => setViewStyle({ fontSize: Math.min(40, (selectedViews()[0].fontSize || state.settings.diagramFontSize) + 1) }) },
  fontDown: { icon: 'fontDown', label: 'action.fontDown', key: 'Ctrl+Shift+<', enabled: hasSelection, run: () => setViewStyle({ fontSize: Math.max(8, (selectedViews()[0].fontSize || state.settings.diagramFontSize) - 1) }) },
  ...Object.fromEntries(LINE_STYLES.map((s) => [`lineStyle:${s}`, { icon: `line${s[0].toUpperCase()}${s.slice(1)}`, label: `lineStyle.${s}`, enabled: () => selectedViews().some(M.isEdgeView), checked: () => selectedViews().filter(M.isEdgeView).length > 0 && selectedViews().filter(M.isEdgeView).every((v) => (v.lineStyle || state.settings.defaultLineStyle) === s), run: () => setViewStyle({ lineStyle: s, points: null }, selectedViews().filter(M.isEdgeView).map((v) => v._id)) }])),
  clearBends: { icon: 'clearBends', label: 'action.clearBends', enabled: () => selectedViews().some((v) => v.points?.length), run: () => setViewStyle({ points: [] }, selectedViews().filter(M.isEdgeView).map((v) => v._id)) },
  autoResize: { icon: 'autoSize', label: 'action.autoResize', enabled: () => selectedNodeViews().length > 0, checked: () => selectedNodeViews().length > 0 && selectedNodeViews().every((v) => v.autoResize), run: () => setViewStyle({ autoResize: !selectedNodeViews().every((v) => v.autoResize) || null }) },
  fitContent: { icon: 'fitContent', label: 'action.fitContent', enabled: () => selectedNodeViews().length > 0, run: () => fitToContent() },
  shadow: { icon: 'shadow', label: 'action.shadow', enabled: () => selectedNodeViews().length > 0, checked: () => selectedNodeViews().length > 0 && selectedNodeViews().every((v) => v.showShadow !== false), run: () => setViewStyle({ showShadow: selectedNodeViews().every((v) => v.showShadow !== false) ? false : null }) },
  suppressAttributes: { icon: 'hideAttributes', label: 'action.suppressAttributes', enabled: () => selectedNodeViews().length > 0, checked: () => selectedNodeViews().length > 0 && selectedNodeViews().every((v) => v.suppressAttributes), run: () => setViewStyle({ suppressAttributes: !selectedNodeViews().every((v) => v.suppressAttributes) || null }) },
  suppressOperations: { icon: 'hideOperations', label: 'action.suppressOperations', enabled: () => selectedNodeViews().length > 0, checked: () => selectedNodeViews().length > 0 && selectedNodeViews().every((v) => v.suppressOperations), run: () => setViewStyle({ suppressOperations: !selectedNodeViews().every((v) => v.suppressOperations) || null }) },
  showVisibility: { icon: 'visibility', label: 'action.showVisibility', enabled: hasSelection, checked: () => hasSelection() && selectedViews().every((v) => v.showVisibility !== false), run: () => setViewStyle({ showVisibility: selectedViews().every((v) => v.showVisibility !== false) ? false : null }) },
  showNamespace: { icon: 'namespace', label: 'action.showNamespace', enabled: () => selectedNodeViews().length > 0, checked: () => selectedNodeViews().length > 0 && selectedNodeViews().every((v) => v.showNamespace), run: () => setViewStyle({ showNamespace: !selectedNodeViews().every((v) => v.showNamespace) || null }) },
  showSignature: { icon: 'signature', label: 'action.showSignature', enabled: () => selectedNodeViews().length > 0, checked: () => selectedNodeViews().length > 0 && selectedNodeViews().every((v) => v.showOperationSignature !== false), run: () => setViewStyle({ showOperationSignature: selectedNodeViews().every((v) => v.showOperationSignature !== false) ? false : null }) },
  ...Object.fromEntries(['label', 'decoration', 'icon', 'none'].map((s) => [`stereotype:${s}`, { icon: `stereo${s[0].toUpperCase()}${s.slice(1)}`, label: `stereotypeDisplay.${s}`, enabled: () => selectedNodeViews().length > 0, checked: () => selectedNodeViews().length > 0 && selectedNodeViews().every((v) => (v.stereotypeDisplay ?? 'label') === s), run: () => setViewStyle({ stereotypeDisplay: s === 'label' ? null : s }) }])),
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
  sameWidth: { icon: 'sameWidth', label: 'action.sameWidth', enabled: multi, run: () => sameSize('width') },
  sameHeight: { icon: 'sameHeight', label: 'action.sameHeight', enabled: multi, run: () => sameSize('height') },
  sameSize: { icon: 'sameSize', label: 'action.sameSize', enabled: multi, run: () => sameSize('both') },
  layoutMenu: { icon: 'layout', label: 'action.layout', enabled: hasDiagram, run: (context) => showMenu(menuItems(SUBMENUS.layout.items), context?.anchor ?? anchorFor('layoutMenu'), 'context', { header: { icon: 'layout', title: t('submenu.layout') } }) },
  ...Object.fromEntries(LAYOUT_DIRECTIONS.map((d) => [`layout:${d}`, { icon: `layout${d}`, label: `layout.${d}`, enabled: hasDiagram, run: () => runLayout(d) }])),
  // view
  zoomIn: { icon: 'zoomIn', label: 'action.zoomIn', key: 'Ctrl+=', enabled: () => hasDiagram() && zoomPercent() < CANVAS_ZOOM.max, run: () => setCanvasZoom(zoomStep(zoomPercent(), 1)) },
  zoomOut: { icon: 'zoomOut', label: 'action.zoomOut', key: 'Ctrl+-', enabled: () => hasDiagram() && zoomPercent() > CANVAS_ZOOM.min, run: () => setCanvasZoom(zoomStep(zoomPercent(), -1)) },
  zoomReset: { icon: 'zoomReset', label: 'action.zoomReset', key: 'Ctrl+0', enabled: hasDiagram, run: () => setCanvasZoom(100) },
  fitPage: { icon: 'fitPage', label: 'action.fitDiagram', key: 'Ctrl+Shift+W', enabled: hasDiagram, run: () => state.view?.fitPage?.() },
  zoomSelection: { icon: 'zoomSelection', label: 'action.zoomSelection', enabled: hasSelection, run: () => state.view?.zoomSelection?.() },
  grid: { icon: 'grid', label: 'action.grid', checked: () => state.settings.showGrid, run: () => toggle('showGrid') },
  rulers: { icon: 'rulers', label: 'action.rulers', checked: () => state.settings.showRulers, run: () => toggle('showRulers') },
  snapGrid: { icon: 'snap', label: 'action.snapGrid', checked: () => state.settings.snapToGrid, run: () => toggle('snapToGrid') },
  minimap: { icon: 'minimap', label: 'action.minimap', checked: () => state.settings.showMinimap, run: () => toggle('showMinimap') },
  quickButtons: { icon: 'quickButtons', label: 'action.quickButtons', checked: () => state.settings.showQuickButtons, run: () => toggle('showQuickButtons') },
  showShadows: { icon: 'shadowAll', label: 'action.showShadows', checked: () => state.settings.showShadow, run: () => toggle('showShadow') },
  ...Object.fromEntries(DIAGRAM_THEME_IDS.map((id) => [`diagramTheme:${id}`, { icon: 'palette', label: `diagramTheme.${id}`, checked: () => state.settings.diagramTheme === id, run: () => updateSettings({ diagramTheme: id }) }])),
  ...Object.fromEntries(LINE_STYLES.map((s) => [`defaultLine:${s}`, { icon: `line${s[0].toUpperCase()}${s.slice(1)}`, label: `lineStyle.${s}`, checked: () => state.settings.defaultLineStyle === s, run: () => updateSettings({ defaultLineStyle: s }) }])),
  presentation: { icon: 'presentation', label: 'action.presentation', key: 'F5', enabled: hasDoc, run: () => startPresentation() },
  leftPanel: { icon: 'panelLeft', label: 'action.toolboxPanel', key: 'Ctrl+Shift+1', checked: () => state.settings.showLeftPanel, run: () => toggle('showLeftPanel') },
  rightPanel: { icon: 'panelRight', label: 'action.explorerPanel', key: 'Ctrl+Shift+2', checked: () => state.settings.showRightPanel, run: () => toggle('showRightPanel') },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => state.settings.showStatusBar, run: () => toggle('showStatusBar') },
  closeDiagram: { icon: 'closeDiagram', label: 'action.closeDiagram', key: 'Ctrl+F4', enabled: hasDiagram, run: () => closeDiagram(currentDiagram()._id) },
  nextDiagram: { icon: 'pageNext', label: 'action.nextDiagram', key: 'Ctrl+PageDown', enabled: () => projectDiagrams().length > 1, run: () => diagramStep(1) },
  prevDiagram: { icon: 'pagePrev', label: 'action.prevDiagram', key: 'Ctrl+PageUp', enabled: () => projectDiagrams().length > 1, run: () => diagramStep(-1) },
  theme: { icon: 'palette', label: 'action.themeRandom', run: () => updateSettings({ theme: randomThemeId(state.settings.theme) }) },
  themeMenu: { icon: 'chevronDown', label: 'action.themeChoose', run: (context) => openThemePicker(context?.anchor) },
  language: { icon: 'globe', label: 'action.language', key: 'Ctrl+Shift+L', run: () => updateSettings({ language: getLanguage() === 'ko' ? 'en' : 'ko' }) },
  shuffleBackground: { icon: 'dice', label: 'action.shuffleBackground', key: 'Ctrl+Shift+B', run: () => shuffleBackground() },
  backgroundImage: { icon: 'imageBg', label: 'action.backgroundImage', run: () => chooseBackground() },
  clearBackground: { icon: 'imageClear', label: 'action.clearBackground', enabled: () => Boolean(state.settings.backgroundImage) || state.settings.backgroundKind !== 'none', run: () => removeBackground() },
  // help
  tutorial: { icon: 'tutorial', label: 'action.tutorial', key: 'F11', run: () => startTutorial() },
  userGuide: { icon: 'userGuide', label: 'action.userGuide', run: () => openUserGuide() },
  tutorialDoc: { icon: 'tutorialDoc', label: 'action.tutorialDoc', checked: () => state.reader?.doc === 'tutorial', run: () => openReader('tutorial') },
  shortcuts: { icon: 'keyboard', label: 'action.shortcuts', run: () => popups.open('settings', { tab: 'shortcuts' }) },
  settings: { icon: 'gear', label: 'action.settings', key: 'Ctrl+,', run: () => popups.open('settings', { tab: 'general' }) },
  about: { icon: 'info', label: 'action.about', key: 'F1', run: () => popups.open('about') },
  quickAddHere: { icon: 'quickAdd', label: 'action.quickAdd', enabled: hasDiagram, run: (context) => quickAddMenu(context?.point) },
};

function commandEnabled(id) {
  const command = commands[id];
  return Boolean(command) && (command.enabled ? Boolean(command.enabled()) : true);
}

function commandTip(id) {
  const command = commands[id];
  if (!command) return id;
  const label = t(command.label);
  const tip = t(`tip.${id}`, null, '');
  return `${label}${command.key ? ` (${keyLabel(command.key)})` : ''}${tip && tip !== `tip.${id}` ? ` — ${tip}` : ''}`;
}

async function run(id, context) {
  const command = commands[id];
  if (!command) return undefined;
  if (!commandEnabled(id)) return undefined;
  try {
    return await command.run(context);
  } catch (error) {
    return showError('error.command', error, t(command.label));
  }
}

function undo() {
  const tab = activeTab();
  const label = tab?.undo();
  if (label !== null && label !== undefined) afterHistory(t('notice.undone', { label }));
}

function redo() {
  const tab = activeTab();
  const label = tab?.redo();
  if (label !== null && label !== undefined) afterHistory(t('notice.redone', { label }));
}

function afterHistory(text) {
  const tab = activeTab();
  tab.diagram; // re-resolve the current diagram after the swap
  state.view?.render();
  afterChange();
  notify('info', text);
}

/** The project's diagrams in tab order. */
const projectDiagrams = () => (activeTab() ? M.elementsWhere(activeTab().project, (e) => M.isDiagram(e)) : []);

/** The next / previous diagram tab (wraps around). */
function diagramStep(direction) {
  const ids = projectDiagrams().map((d) => d._id);
  if (!ids.length) return;
  const i = ids.indexOf(currentDiagram()?._id);
  openDiagram(ids[(i + direction + ids.length) % ids.length]);
  scrollActiveTabIntoView();
}

/** Double-click on an empty part of the diagram: a menu of the toolbox's node tools. */
function quickAddMenu(point) {
  const diagram = currentDiagram();
  if (!diagram || !point) return undefined;
  const items = []; const handlers = {};
  for (const [, ko, en, tools] of toolboxFor(diagram._type)) {
    const nodes = tools.filter((tool) => tool.kind === 'node');
    if (!nodes.length) continue;
    items.push({ separator: true, label: lang() === 'ko' ? ko : en });
    for (const tool of nodes.slice(0, 14)) { handlers[`custom:${tool.id}`] = () => createNodeAt(tool, { x: point.x, y: point.y, w: 0, h: 0 }); items.push({ id: `custom:${tool.id}`, label: lang() === 'ko' ? tool.ko : tool.en, icon: tool.icon }); }
  }
  if (items[0]?.separator) items.shift();
  const s = toScreenPoint(point);
  return showMenu(items.filter((x) => !x.separator || x.id !== undefined || true).map((x) => (x.separator ? { separator: true } : x)), { x: s.x, y: s.y, flipY: s.y }, 'context', { handlers, header: { icon: 'plus', title: t('action.quickAdd') } });
}

function toScreenPoint(p) {
  const v = state.view;
  const r = v.stage.getBoundingClientRect();
  const sp = v.toStage(p);
  return toScreen(r.left + sp.x, r.top + sp.y);
}

// ───────────────────────── layout

const SUBMENUS = {
  importFrom: { icon: 'importFile', items: ['importStarUml', 'importFragment', 'importText', 'reverse'] },
  exportTo: { icon: 'exportFile', items: ['exportImage', 'exportSvg', 'exportPdf', 'exportAllImages', '-', 'exportHtml', 'exportMarkdown', '-', 'exportStarUml', 'exportFragment', 'exportMermaid', 'exportPlantUml'] },
  zoom: { icon: 'zoomIn', items: ['zoomIn', 'zoomOut', 'zoomReset', '-', 'fitPage', 'zoomSelection'] },
  show: { icon: 'eye', items: ['grid', 'rulers', 'snapGrid', 'minimap', 'quickButtons', 'showShadows', '-', 'leftPanel', 'rightPanel', 'statusBar'] },
  diagramTheme: { icon: 'palette', items: DIAGRAM_THEME_IDS.map((id) => `diagramTheme:${id}`) },
  defaultLine: { icon: 'lineRectilinear', items: LINE_STYLES.map((s) => `defaultLine:${s}`) },
  appearance: { icon: 'palette', items: ['theme', 'themeMenu', 'language', '-', 'shuffleBackground', 'backgroundImage', 'clearBackground'] },
  font: { icon: 'textTool', items: ['bold', 'italic', 'fontUp', 'fontDown', 'fontColor'] },
  lineStyle: { icon: 'lineRectilinear', items: [...LINE_STYLES.map((s) => `lineStyle:${s}`), '-', 'clearBends'] },
  stereotype: { icon: 'stereoLabel', items: ['stereotype:label', 'stereotype:decoration', 'stereotype:icon', 'stereotype:none'] },
  display: { icon: 'eye', items: ['suppressAttributes', 'suppressOperations', 'showVisibility', 'showNamespace', 'showSignature', 'shadow'] },
  order: { icon: 'bringFront', items: ['bringFront', 'sendBack', 'bringForward', 'sendBackward'] },
  align: { icon: 'alignCenter', items: ['alignLeft', 'alignCenter', 'alignRight', '-', 'alignTop', 'alignMiddle', 'alignBottom', '-', 'distributeH', 'distributeV', '-', 'sameWidth', 'sameHeight', 'sameSize'] },
  layout: { icon: 'layout', items: LAYOUT_DIRECTIONS.map((d) => `layout:${d}`) },
  diagrams: { icon: 'dgClass', items: ['addDiagram', 'prevDiagram', 'nextDiagram'] },
};
const sub = (key) => ({ sub: key });
const MENUS = {
  file: ['new', 'newFromTemplate', 'open', 'startPage', 'recent', 'recentFolders', 'clearRecent', '-', 'save', 'saveAs', 'saveTemplate', '-', ...(desktop ? ['dbOpen', 'dbSave', '-'] : []), sub('importFrom'), sub('exportTo'), '-', 'print', 'projectProps', '-', 'closeTab', '-', 'exit'],
  edit: ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'duplicate', '-', 'delete', 'deleteFromModel', '-', 'selectAll', 'clearSelection', 'selectInExplorer', 'selectInDiagram', '-', 'editName', 'find'],
  model: ['addDiagram', 'addElement', '-', 'moveUp', 'moveDown', '-', 'showRelations', 'unusedElements', '-', 'requirements', 'traceMatrix', '-', 'validate', 'statistics'],
  view: [sub('zoom'), sub('show'), '-', sub('diagramTheme'), sub('defaultLine'), '-', sub('diagrams'), 'presentation', '-', sub('appearance')],
  format: [sub('font'), 'fillColor', 'lineColor', '-', sub('lineStyle'), sub('stereotype'), sub('display'), '-', 'autoResize', 'fitContent'],
  arrange: [sub('order'), sub('align'), '-', 'layoutMenu', sub('layout')],
  tools: ['generateCode', 'generateDdl', 'reverse', '-', 'validate', '-', 'settings'],
  help: ['tutorial', 'tutorialDoc', 'userGuide', 'shortcuts', '-', 'settings', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', model: 'umlModel', view: 'eye', format: 'formatShape', arrange: 'bringFront', tools: 'tools', help: 'question' };

const TOOLBAR = [
  ['new', 'open', 'save', 'exportSplit'],
  ['undo', 'redo'],
  ['cut', 'copy', 'paste', 'deleteFromModel'],
  ['tool:pointer', 'addDiagram'],
  ['fillSplit', 'lineSplit', 'lineStyleMenu'],
  ['alignMenu', 'layoutMenu'],
  ['zoom', 'fitPage'],
  ['generateCode', 'reverse', 'validate'],
  ['leftPanel', 'rightPanel'],
];
/** Right end of the toolbar: tutorial, theme (random + dropdown), language, settings, about. */
const TOOLBAR_RIGHT = ['tutorial', 'themeSplit', 'language', 'settings', 'about'];
commands.lineStyleMenu = { icon: 'lineStyles', label: 'action.lineStyleMenu', enabled: () => selectedViews().some(M.isEdgeView), run: (context) => showMenu(menuItems(SUBMENUS.lineStyle.items), context?.anchor ?? anchorFor('lineStyleMenu'), 'context', { header: { icon: 'lineRectilinear', title: t('submenu.lineStyle') } }) };

function renderShell() {
  root.innerHTML = `
    <div class="app-bg" aria-hidden="true"><canvas class="anim-bg"></canvas><div class="image-bg"></div></div>
    <nav id="menubar" role="menubar"></nav>
    <div id="toolbar" role="toolbar"></div>
    <main id="workspace">
      <aside id="left-panel" class="side-panel" aria-label="${escapeHtml(t('panel.toolbox'))}"></aside>
      <div class="splitter vertical panel-split" data-split="left" title="${escapeHtml(t('tip.panelSplitter'))}" role="separator" aria-orientation="vertical"></div>
      <section id="center">
        <div id="tabs"></div>
        <div id="center-body">
          <div id="view-host" class="view-host"></div>
          <div id="start-page" hidden></div>
          <div id="reader-page" hidden></div>
          <div class="drop-overlay" aria-hidden="true"><div>${icon('drop')}<span></span></div></div>
        </div>
      </section>
      <div class="splitter vertical panel-split" data-split="right" title="${escapeHtml(t('tip.panelSplitter'))}" role="separator" aria-orientation="vertical"></div>
      <aside id="right-panel" class="side-panel" aria-label="${escapeHtml(t('panel.explorer'))}"></aside>
    </main>
    <footer id="statusbar" role="status"></footer>
    ${desktop ? `<div class="resize-grip" data-resize-grip title="${escapeHtml(t('tip.resize'))}" aria-label="${escapeHtml(t('tip.resize'))}" role="separator">${icon('grip')}</div>` : `<div class="resize-grip static" title="${escapeHtml(t('tip.resize'))}" aria-hidden="true">${icon('grip')}</div>`}
    <div id="presentation" hidden></div>
    <div id="tutorial-layer"></div>
    <div id="datalists" hidden></div>`;
}

function renderMenubar() {
  const menubar = root.querySelector('#menubar');
  const onStart = state.showStart || !activeTab();
  const home = `<button class="menubar-item menubar-home ${onStart ? 'current' : ''}" data-home title="${escapeHtml(t('tip.home'))}" aria-label="${escapeHtml(t('menu.home'))}" aria-pressed="${onStart}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button><span class="menubar-sep" aria-hidden="true"></span>`;
  menubar.innerHTML = home + Object.keys(MENUS).map((name) => `
    <button class="menubar-item ${state.openMenu === name ? 'open' : ''}" data-menu="${name}" role="menuitem" aria-haspopup="true" title="${escapeHtml(t(`menu.${name}`))}">${icon(MENU_ICONS[name])}<span>${escapeHtml(t(`menu.${name}`))}</span></button>`).join('');
}

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
    if (id === 'exportSplit') return `<span class="split-button">${plain('exportImage')}<button class="tool-button split-arrow" data-command="exportMenu" title="${escapeHtml(commandTip('exportMenu'))}" aria-label="${escapeHtml(t('action.exportMenu'))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
    if (id === 'themeSplit') return `<span class="split-button">${plain('theme')}<button class="tool-button split-arrow" data-command="themeMenu" title="${escapeHtml(commandTip('themeMenu'))}" aria-label="${escapeHtml(t('action.themeChoose'))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
    if (id === 'fillSplit' || id === 'lineSplit') {
      const cmd = id === 'fillSplit' ? 'fillColor' : 'lineColor';
      const key = id === 'fillSplit' ? 'fillColor' : 'lineColor';
      return `<span class="split-button color-split"><button class="tool-button color-button" data-command="${cmd}" data-color-apply="${key}" title="${escapeHtml(commandTip(cmd))}" aria-label="${escapeHtml(t(commands[cmd].label))}">${icon(commands[cmd].icon)}<i class="color-bar" data-color-bar="${key}"></i></button><button class="tool-button split-arrow" data-command="${cmd}" title="${escapeHtml(commandTip(cmd))}" aria-label="${escapeHtml(t(commands[cmd].label))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
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

const lastColors = { fillColor: '#fff2cc', lineColor: '#1f4e79' };

function renderToolbarState() {
  for (const element of root.querySelectorAll('#toolbar [data-command]')) {
    const id = element.dataset.command;
    element.disabled = !commandEnabled(id);
    element.title = commandTip(id);
    const checked = commands[id]?.checked?.();
    element.classList.toggle('active', Boolean(checked));
    if (checked !== undefined) element.setAttribute('aria-pressed', String(Boolean(checked)));
  }
  for (const bar of root.querySelectorAll('[data-color-bar]')) bar.style.background = lastColors[bar.dataset.colorBar];
  const zoom = root.querySelector('#zoom-value');
  if (zoom && document.activeElement !== zoom) zoom.value = `${zoomPercent()}%`;
}

/** The window can never be so narrow that toolbar buttons or menus are hidden. */
function updateMinimumWidth() {
  const left = root.querySelector('.toolbar-left');
  const right = root.querySelector('.toolbar-right');
  if (!left || !right) return;
  requestAnimationFrame(() => {
    const toolbar = root.querySelector('#toolbar');
    const style = getComputedStyle(toolbar);
    const menus = [...root.querySelectorAll('.menubar-item')].reduce((sum, el) => sum + el.offsetWidth + 2, 24);
    const width = Math.ceil(Math.max(menus, left.scrollWidth + right.scrollWidth + 24 + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2));
    if (Math.abs(width - state.minWidth) < 1) return;
    state.minWidth = width;
    document.documentElement.style.setProperty('--min-width', `${width}px`);
    native.setMinimumSize(width, 600).catch(() => {});
  });
}

// ───────────────────────── project tabs

/** The tab bar: the project (one at a time) and a tab for each of its diagrams; ‹ › when they do not fit. */
function renderTabs() {
  const tabs = root.querySelector('#tabs');
  const doc = activeTab();
  tabs.hidden = !doc || state.showStart;
  if (tabs.hidden) { tabs.innerHTML = ''; return; }
  const scroll = tabs.querySelector('.tab-strip')?.scrollLeft ?? 0;
  const current = currentDiagram()?._id;
  const ko = lang() === 'ko';
  const diagrams = M.elementsWhere(doc.project, (e) => M.isDiagram(e));
  tabs.innerHTML = `
    <div class="tab-project ${doc.dirty ? 'dirty' : ''}" title="${escapeHtml(doc.path ?? docName(doc))}">${icon(doc.fromTemplate ? 'template' : 'umlProject')}<span class="tab-name">${escapeHtml(docName(doc))}</span><span class="tab-dirty" title="${escapeHtml(t('status.modified'))}">●</span></div>
    <div class="tab-strip"><div class="tab-list" role="tablist" aria-label="${escapeHtml(t('tabs.diagrams'))}">
      ${diagrams.map((d) => {
        const def = typeDef(d._type);
        return `<div class="tab ${d._id === current ? 'active' : ''}" role="tab" aria-selected="${d._id === current}" data-diagram-tab="${d._id}" title="${escapeHtml(`${d.name} (${ko ? def.ko : def.en})`)}">${icon(def.icon ?? 'dgClass')}<span class="tab-name">${escapeHtml(d.name || '—')}</span></div>`;
      }).join('')}
    </div></div>
    <button class="tab-add" data-command="addDiagram" title="${escapeHtml(t('action.addDiagram'))}" aria-label="${escapeHtml(t('action.addDiagram'))}">${icon('plus')}</button>
    <div class="tab-nav">
      <button class="tab-scroll" data-tab-scroll="-1" title="${escapeHtml(t('tabs.left'))}" aria-label="${escapeHtml(t('tabs.left'))}">${icon('chevronLeft')}</button>
      <button class="tab-scroll" data-tab-scroll="1" title="${escapeHtml(t('tabs.right'))}" aria-label="${escapeHtml(t('tabs.right'))}">${icon('chevronRight')}</button>
    </div>`;
  tabs.querySelector('.tab-strip').scrollLeft = scroll;
  updateTabNav();
  // Another diagram became current (a new one, Ctrl+Tab, the explorer, a type tab): keep its tab in sight.
  if (current !== renderTabs.shown) { renderTabs.shown = current; scrollActiveTabIntoView(); }
}

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

/** Rename a diagram on its tab (double click, the tab's context menu): on the live tab element, once. */
function renameDiagramTab(id) {
  const el = root.querySelector(`#tabs [data-diagram-tab="${CSS.escape(id)}"]`);
  if (el && !el.querySelector('.page-tab-input')) state.view?.renameDiagramInline?.(el);
}

/** Ctrl+Tab / Ctrl+Shift+Tab: the next / previous diagram tab. */
function cycleTab(direction) {
  if (activeTab()) diagramStep(direction);
}

// ───────────────────────── left panel (Toolbox)

function renderToolbox() {
  const panel = root.querySelector('#left-panel');
  if (!panel) return;
  const diagram = hasDiagram() ? currentDiagram() : null;
  const compact = state.settings.toolboxCompact;
  if (!state.settings.showLeftPanel) {
    panel.innerHTML = `<div class="panel-rail">
      <button class="rail-button expand" data-command="leftPanel" title="${escapeHtml(t('panel.expandLeft'))}" aria-label="${escapeHtml(t('panel.expandLeft'))}">${icon('chevronRight')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button>
      <div class="rail-title" title="${escapeHtml(t('panel.toolbox'))}">${icon('toolbox')}<span>${escapeHtml(t('panel.toolboxShort'))}</span></div>
      <button class="rail-button ${state.tool ? '' : 'active'}" data-command="tool:pointer" title="${escapeHtml(commandTip('tool:pointer'))}">${icon('pointer')}</button>
      ${diagram ? toolboxFor(diagram._type).flatMap(([, , , tools]) => tools).slice(0, 8).map((tool) => `<button class="rail-button ${state.tool?.id === tool.id ? 'active' : ''}" data-tool="${escapeHtml(tool.id)}" title="${escapeHtml(lang() === 'ko' ? tool.ko : tool.en)}">${icon(tool.icon)}</button>`).join('') : ''}
    </div>`;
    return;
  }
  const query = state.toolboxQuery.trim().toLowerCase();
  const def = diagram ? typeDef(diagram._type) : null;
  let body;
  if (!diagram) body = `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('toolbox.noDiagram'))}</span></p>`;
  else {
    body = toolboxFor(diagram._type).map(([id, ko, en, tools]) => {
      const list = query ? tools.filter((tool) => `${tool.ko} ${tool.en}`.toLowerCase().includes(query)) : tools;
      if (!list.length) return '';
      const collapsed = !query && state.collapsedToolbox.has(id);
      return `<section class="tool-section ${collapsed ? 'collapsed' : ''}"><header><button class="stencil-toggle" data-toolbox-toggle="${id}" aria-expanded="${!collapsed}" title="${escapeHtml(lang() === 'ko' ? ko : en)}">${icon(collapsed ? 'caretRight' : 'caretDown', 'icon tiny')}<span>${escapeHtml(lang() === 'ko' ? ko : en)}</span><span class="count">${list.length}</span></button></header>
        ${collapsed ? '' : `<div class="tool-list ${compact ? 'compact' : ''}">${list.map((tool) => `<button class="tool-item ${state.tool?.id === tool.id ? 'active' : ''}" data-tool="${escapeHtml(tool.id)}" title="${escapeHtml(`${lang() === 'ko' ? tool.ko : tool.en}${tool.kind === 'edge' ? ` — ${t('toolbox.edgeTip')}` : ` — ${t('toolbox.nodeTip')}`}`)}" aria-pressed="${state.tool?.id === tool.id}">${icon(tool.icon)}${compact ? '' : `<span>${escapeHtml(lang() === 'ko' ? tool.ko : tool.en)}</span>`}</button>`).join('')}</div>`}</section>`;
    }).join('');
  }
  panel.innerHTML = `
    <div class="panel-header">${icon('toolbox')}<span>${escapeHtml(t('panel.toolbox'))}</span>
      <button class="icon-button ${compact ? 'active' : ''}" data-toolbox-compact title="${escapeHtml(t('toolbox.compact'))}" aria-pressed="${compact}">${icon('gridView')}</button>
      <button class="icon-button" data-command="leftPanel" title="${escapeHtml(t('panel.collapseLeft'))}" aria-label="${escapeHtml(t('panel.collapseLeft'))}">${icon('chevronLeft')}</button></div>
    ${diagram ? `<div class="toolbox-diagram" title="${escapeHtml(typeLabel(diagram._type, lang()))}">${icon(def.icon)}<span>${escapeHtml(typeLabel(diagram._type, lang()))}</span></div>` : ''}
    <div class="shapes-tools">
      <label class="search-box" title="${escapeHtml(t('toolbox.searchTip'))}">${icon('search')}<input id="toolbox-search" type="search" value="${escapeHtml(state.toolboxQuery)}" placeholder="${escapeHtml(t('toolbox.search'))}" aria-label="${escapeHtml(t('toolbox.searchTip'))}" /></label>
      <button class="tool-item pointer ${state.tool ? '' : 'active'}" data-command="tool:pointer" title="${escapeHtml(commandTip('tool:pointer'))}">${icon('pointer')}<span>${escapeHtml(t('tool.pointer'))}</span></button>
    </div>
    <div class="stencils toolbox">${body}</div>`;
}

// ───────────────────────── right panel (Model Explorer + Editors)

let explorerView = null;

function renderRight() {
  const panel = root.querySelector('#right-panel');
  if (!state.settings.showRightPanel) {
    explorerView = null;
    panel.innerHTML = `<div class="panel-rail">
      <button class="rail-button expand" data-command="rightPanel" title="${escapeHtml(t('panel.expandRight'))}" aria-label="${escapeHtml(t('panel.expandRight'))}">${icon('chevronLeft')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button>
      <div class="rail-title">${icon('umlModel')}<span>${escapeHtml(t('panel.explorerShort'))}</span></div></div>`;
    return;
  }
  if (!panel.querySelector('#explorer')) {
    panel.innerHTML = `
      <div class="panel-header">${icon('umlModel')}<span>${escapeHtml(t('panel.explorer'))}</span>
        <button class="icon-button" data-command="addDiagram" title="${escapeHtml(t('action.addDiagram'))}">${icon('dgAdd')}</button>
        <button class="icon-button" data-command="addElement" title="${escapeHtml(t('action.addElement'))}">${icon('plus')}</button>
        <button class="icon-button" data-command="rightPanel" title="${escapeHtml(t('panel.collapseRight'))}" aria-label="${escapeHtml(t('panel.collapseRight'))}">${icon('chevronRight')}</button></div>
      <div id="explorer" class="explorer"></div>
      <div class="splitter horizontal" data-split="explorer" title="${escapeHtml(t('tip.panelSplitter'))}" role="separator" aria-orientation="horizontal"></div>
      <div id="editor-tabs" class="editor-tabs" role="tablist"></div>
      <div id="editors" class="editors"></div>`;
    explorerView = new ModelExplorer(appApi, panel.querySelector('#explorer'));
    explorerView.render();
    bindExplorerSplitter(panel.querySelector('[data-split="explorer"]'));
  }
  panel.style.setProperty('--explorer-height', `${state.settings.explorerHeight}%`);
  renderExplorer();
  renderEditors();
}

function renderExplorer() {
  if (!explorerView) return;
  if (!explorerView.host.querySelector('.explorer-tree')) explorerView.render(); else explorerView.renderTree();
}

const EDITOR_TABS = [['properties', 'propertiesTab'], ['style', 'formatShape'], ['documentation', 'docText'], ['tags', 'tag']];

/** What the Editors show: the selected element (or annotation views), else the explorer selection, else the diagram. */
function editorTarget() {
  const tab = activeTab();
  if (!tab) return { element: null, views: [] };
  const views = selectedViews();
  if (views.length) {
    const primary = viewById(state.selection.primary) ?? views[0];
    return { element: primary.model ? tab.index.get(M.refId(primary.model)) : null, views };
  }
  if (state.explorer.length) return { element: tab.index.get(state.explorer[0]), views: [] };
  return { element: tab.diagram ?? tab.project, views: [] };
}

function renderEditors() {
  const host = root.querySelector('#editors');
  const tabsHost = root.querySelector('#editor-tabs');
  if (!host || !tabsHost) return;
  const focused = document.activeElement;
  if (focused && host.contains(focused) && focused.matches('input[type="text"], textarea, input[type="search"]')) {
    // Typing in an editor: redraw later so the caret stays.
    clearTimeout(renderEditors.timer);
    renderEditors.timer = setTimeout(() => { if (!host.contains(document.activeElement)) renderEditors(); }, 400);
    return;
  }
  tabsHost.innerHTML = EDITOR_TABS.map(([id, glyph]) => `<button class="editor-tab ${state.rightTab === id ? 'active' : ''}" data-editor-tab="${id}" role="tab" aria-selected="${state.rightTab === id}" title="${escapeHtml(t(`editors.${id}`))}">${icon(glyph)}<span>${escapeHtml(t(`editors.${id}`))}</span></button>`).join('');
  const tab = activeTab();
  root.querySelector('#datalists').innerHTML = datalistsHtml(appApi);
  if (!tab) { host.innerHTML = `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('editors.noProject'))}</span></p>`; return; }
  const { element, views } = editorTarget();
  const scroll = host.scrollTop;
  let html = '';
  switch (state.rightTab) {
    case 'style': html = styleHtml(appApi, views); break;
    case 'documentation': html = documentationHtml(appApi, element); break;
    case 'tags': html = tagsHtml(appApi, element); break;
    default:
      if (!element && views.length) html = annotationProps(views[0]);
      else if (element && M.isDiagram(element)) html = propertiesHtml(appApi, element) + diagramPropertiesHtml(appApi, element);
      else if (element) html = propertiesHtml(appApi, element);
  }
  host.innerHTML = `<div class="editor-body">${html}</div>`;
  host.scrollTop = scroll;
}

function annotationProps(v) {
  const label = typeLabel(v._type, lang());
  return `<section class="prop-section"><header><span class="section-toggle">${icon(viewDef(v._type).icon ?? 'note')}<span>${escapeHtml(label)}</span></span></header><div class="props">
    <div class="prop-row tall"><span class="prop-label"><span>${escapeHtml(t('field.text'))}</span></span><span class="prop-control"><textarea data-view-text="${v._id}" rows="5">${escapeHtml(v.text ?? '')}</textarea></span></div>
    ${v._type === 'HyperlinkView' ? `<div class="prop-row"><span class="prop-label"><span>URL</span></span><span class="prop-control"><input type="text" data-view-field="url" data-view="${v._id}" value="${escapeHtml(v.url ?? '')}" /></span></div>` : ''}
    ${v._type === 'ImageView' ? `<div class="prop-row"><span class="prop-label"><span>${escapeHtml(t('field.image'))}</span></span><span class="prop-control"><button class="button" data-image-pick="${v._id}">${icon('picture')}<span>${escapeHtml(t('action.chooseImage'))}</span></button></span></div>` : ''}
  </div></section>`;
}

function bindExplorerSplitter(splitter) {
  splitter.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const panel = root.querySelector('#right-panel');
    const rect = panel.getBoundingClientRect();
    pointerDrag(event, {
      cursor: 'row-resize',
      move: (dx, dy, e) => {
        const pct = Math.max(20, Math.min(85, ((e.clientY - rect.top) / rect.height) * 100));
        panel.style.setProperty('--explorer-height', `${pct}%`);
        state.settings.explorerHeight = Math.round(pct);
      },
      end: (e, moved) => { if (moved) updateSettings({ explorerHeight: state.settings.explorerHeight }, { quiet: true }); },
    });
  });
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
    const diagram = tab.diagram;
    if (diagram) items.push(`<span class="status-item" title="${escapeHtml(t('status.diagramTip'))}">${icon(typeDef(diagram._type)?.icon ?? 'dgClass')}<span>${escapeHtml(diagram.name)}</span></span>`);
    items.push(`<span class="status-item ${tab.dirty ? 'modified' : 'saved'}" title="${escapeHtml(tab.path ?? t('status.unsavedFile'))}">${icon(tab.dirty ? 'edit' : 'save')}<span>${escapeHtml(tab.dirty ? t('status.modified') : t('status.saved'))}</span></span>`);
    const views = selectedViews();
    if (views.length === 1 && !M.isEdgeView(views[0])) {
      const b = state.view?.boxOf?.(views[0]._id);
      const el = tab.index.get(M.refId(views[0].model));
      if (b) items.push(`<span class="status-item" title="${escapeHtml(t('status.sizeTip'))}">${icon('sameSize')}<span>${escapeHtml(`${el ? `${typeLabel(el._type, lang())} · ` : ''}${Math.round(b.x)}, ${Math.round(b.y)} · ${Math.round(b.w)} × ${Math.round(b.h)}`)}</span></span>`);
    } else if (views.length) items.push(`<span class="status-item" title="${escapeHtml(t('status.selectedTip'))}">${icon('selectAll')}<span>${escapeHtml(t('status.selected', { count: views.length }))}</span></span>`);
    else if (diagram) items.push(`<span class="status-item" title="${escapeHtml(t('status.viewsTip'))}">${icon('dgClass')}<span>${escapeHtml(t('status.views', { count: M.viewsOf(diagram).length }))}</span></span>`);
    if (state.pointer && diagram) items.push(`<span class="status-item pointer-pos" title="${escapeHtml(t('status.pointerTip'))}">${icon('position')}<span id="status-pointer">${Math.round(state.pointer.x)}, ${Math.round(state.pointer.y)}</span></span>`);
    if (state.tool) items.push(`<button class="status-item warn" data-command="tool:pointer" title="${escapeHtml(t('status.toolTip'))}">${icon(state.tool.icon)}<span>${escapeHtml(lang() === 'ko' ? state.tool.ko : state.tool.en)}</span></button>`);
    if (state.validation) items.push(`<button class="status-item ${state.validation.errors ? 'error-count' : ''}" data-command="validate" title="${escapeHtml(t('status.validationTip'))}">${icon('validate')}<span>${escapeHtml(t('status.validation', { errors: state.validation.errors, warnings: state.validation.warnings }))}</span></button>`);
  }
  items.push(`<span class="status-item" title="${escapeHtml(t('status.theme', { name: themeName(s.theme, getLanguage()) }))}">${icon('palette')}<span>${escapeHtml(themeName(s.theme, getLanguage()))}</span></span>`);
  items.push(`<span class="status-item" title="${escapeHtml(t('status.language'))}">${icon('globe')}<span>${escapeHtml(t('status.language'))}</span></span>`);
  if (tab && !state.showStart && currentDiagram()) {
    const z = zoomPercent();
    const steps = CANVAS_ZOOM.steps;
    items.push(`<label class="status-item zoom-slider" title="${escapeHtml(t('status.zoomTip'))}">${icon('zoomIn')}<input type="range" id="zoom-slider" min="0" max="${steps.length - 1}" step="1" value="${Math.max(0, steps.findIndex((v) => v >= z))}" aria-label="${escapeHtml(t('status.zoomTip'))}" /><span id="status-zoom">${z}%</span></label>`);
    items.push(`<button class="status-item" data-command="fitPage" title="${escapeHtml(commandTip('fitPage'))}">${icon('fitPage')}</button>`);
  }
  if (s.statusClock) items.push(`<span class="status-item clock" title="${escapeHtml(t('status.clock'))}">${icon('clock')}<span id="status-clock">${escapeHtml(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span></span>`);
  bar.innerHTML = items.join('');
}

function pointerAt(p) {
  state.pointer = p;
  const el = root.querySelector('#status-pointer');
  if (el) el.textContent = `${Math.round(p.x)}, ${Math.round(p.y)}`;
  else if (!pointerAt.pending) { pointerAt.pending = true; requestAnimationFrame(() => { pointerAt.pending = false; renderStatus(); }); }
}

function renderAll() {
  root.classList.toggle('no-status', !state.settings.showStatusBar);
  root.classList.toggle('no-left', !state.settings.showLeftPanel);
  root.classList.toggle('no-right', !state.settings.showRightPanel);
  root.style.setProperty('--left-width', `${state.settings.leftWidth}px`);
  root.style.setProperty('--right-width', `${state.settings.rightWidth}px`);
  root.style.setProperty('--zoom', String(state.settings.zoom / 100));
  root.dataset.tool = state.tool ? state.tool.kind : 'pointer';
  renderMenubar();
  if (toolbarLanguage !== getLanguage()) renderToolbar(); else renderToolbarState();
  renderTabs();
  renderToolbox();
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
  state.view?.finishEdit?.();
  state.showStart = show;
  state.reader = null;
  if (show) { state.view?.destroy?.(); state.view = null; } else mountView();
  renderAll();
}

async function onStartAction(target) {
  const value = target.dataset.value;
  switch (target.dataset.start) {
    case 'template': return newProjectAsk(value);
    case 'open': return openWithDialog();
    case 'import': return openWithDialog(null, 'mdj');
    case 'reverse': return reverseMenu(anchorBelow(target));
    case 'textImport': return openTextImport();
    case 'open-recent': return openRecent(value);
    case 'remove-recent': state.recent = removeRecent(state.recent, value); storeRecent(globalThis.localStorage, state.recent); return renderStartPage();
    case 'clear-recent': state.recent = []; storeRecent(globalThis.localStorage, []); notify('success', t('notice.recentCleared')); return renderStartPage();
    case 'open-folder': return openWithDialog(value);
    case 'remove-folder': state.recentDirs = removeRecent(state.recentDirs, value); storeRecentDirs(globalThis.localStorage, state.recentDirs); return renderStartPage();
    case 'clear-folders': state.recentDirs = []; storeRecentDirs(globalThis.localStorage, []); return renderStartPage();
    case 'open-sample': return openPath(value);
    case 'builtin-sample': return openSampleAsk();
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

function templateMenu(anchor) {
  const handlers = Object.fromEntries(TEMPLATES.map(([id]) => [`custom:${id}`, () => newProjectAsk(id)]));
  return showMenu(TEMPLATES.map(([id, , glyph]) => ({ id: `custom:${id}`, label: t(`template.${id}`), icon: glyph })), anchor ?? anchorBelow(root.querySelector('[data-menu="file"]')), 'context', { handlers, header: { icon: 'template', title: t('action.newFromTemplate') } });
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
    const panel = root.querySelector('#right-panel');
    if (panel) panel.innerHTML = '';
  }
  if (s.backgroundImage !== previous.backgroundImage) loadBackground();
  if (s.theme !== previous.theme && previous.theme) notify('info', t('notice.theme', { name: themeName(s.theme, getLanguage()) }));
  const redraw = ['diagramTheme', 'defaultLineStyle', 'diagramFont', 'diagramFontSize', 'showShadow', 'showGrid', 'showRulers', 'showMinimap', 'gridSize', 'language', 'showQuickButtons'].some((key) => s[key] !== previous[key]);
  if (redraw && state.view) state.view.update();
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
  const op = `op-${M.newId()}`;
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

/** A project from file text: .myuml / .mumlt / a StarUML .mdj. */
function parseAny(name, text) {
  if (isStarUmlFileName(name)) return { project: normalizeProject(importMdj(text)), template: false, imported: true };
  const parsed = parseProject(text);
  if (parsed.starUml) return { project: normalizeProject(importMdj(text)), template: false, imported: true };
  return { project: parsed.project, template: parsed.template || isTemplateFileName(name), imported: false };
}

async function openPath(path, { quiet = false } = {}) {
  const name = baseName(path);
  if (isFragmentFileName(name)) return importFragmentFromPath(path);
  if (isSourceFileName(name)) return reverseFiles(await readSources([path]), languageOfFile(name));
  if (isTextModelFileName(name)) return openTextImport({ text: await native.readTextFile(path, `op-${M.newId()}`), format: /p(lant)?u(ml)?$/.test(extensionOf(name)) ? 'plantuml' : 'mermaid' });
  const existing = findOpenDoc(path);
  if (existing) {
    activateDoc(existing.id);
    if (!quiet) notify('info', t('notice.alreadyOpen', { name }));
    return existing;
  }
  if (!(await confirmReplace())) return null;
  try {
    const content = await withProgress('progress.open', name, (op) => native.readTextFile(path, op));
    const { project, template, imported } = parseAny(name, content);
    const tab = new ProjectDocument(project, { path: template || imported ? null : path, name: template || imported ? project.name : null, template: template || imported });
    if (imported) tab.saved = '';
    addTab(tab);
    rememberRecent({ path, title: project.name });
    if (!quiet) notify('success', t(imported ? 'notice.imported' : 'notice.opened', { name }));
    return tab;
  } catch (error) {
    showError('error.open', error, path);
    return null;
  }
}

async function openContent(name, content, handle = null) {
  if (isProjectFileName(name) || isStarUmlFileName(name)) { if (!(await confirmReplace())) return null; }
  try {
    const { project, template, imported } = parseAny(name, content);
    const tab = new ProjectDocument(project, { name: template || imported ? project.name : name, handle: template || imported ? null : handle, template: template || imported });
    if (imported) tab.saved = '';
    addTab(tab);
    rememberRecent({ path: name, title: project.name, web: true });
    notify('success', t(imported ? 'notice.imported' : 'notice.opened', { name }));
    return tab;
  } catch (error) {
    showError('error.open', error, name);
    return null;
  }
}

async function openWithDialog(directory = null, kind = null) {
  try {
    if (desktop) {
      const paths = kind === 'mdj' ? await native.chooseFiles(directory ?? state.settings.lastDirectory, [native.SAVE_TYPES.mdj]) : await native.chooseDiagramsToOpen(directory ?? state.settings.lastDirectory);
      // One project at a time: the first chosen file.
      if (paths[0]) await openPath(paths[0]);
    } else {
      const files = kind === 'mdj' ? await Promise.all((await native.pickWithInput('.mdj', true)).map(async (file) => ({ name: file.name, content: await file.text(), handle: null }))) : await native.pickDiagramFilesWeb();
      if (files[0]) await openContent(files[0].name, files[0].content, files[0].handle);
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
        return openContent(file.name, await file.text(), handle);
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

const safeName = (tab) => (tab.path ? stripExtension(baseName(tab.path)) : tab.project.name || 'project').replace(/[\\/:*?"<>|]/g, '_');

/** Saves a project. Projects from a template, imports and new projects ask for a file name. */
async function saveDoc(tab, { saveAs = false } = {}) {
  if (!tab) return false;
  state.view?.finishEdit?.();
  const text = tab.text();
  const suggested = `${safeName(tab)}.myuml`;
  try {
    if (desktop) {
      let path = tab.path;
      if (!path || saveAs || extensionOf(path) !== 'myuml') {
        const dir = tab.path ? directoryOf(tab.path) : state.settings.lastDirectory;
        path = await native.chooseSavePath(dir ? `${dir}/${suggested}` : suggested, ['myuml']);
        if (!path) return false;
        path = withExtension(path, 'myuml');
      }
      await withProgress('progress.save', baseName(path), (op) => native.writeTextFile(path, text, op));
      tab.markSaved(path);
      tab.name = null;
      rememberRecent({ path, title: tab.project.name });
    } else {
      const saved = await native.saveFileWeb(text, { name: suggested, handle: tab.handle, saveAs: saveAs || !tab.handle });
      if (!saved) return false;
      tab.handle = saved.handle;
      tab.name = saved.name;
      tab.markSaved(null);
      if (saved.handle) native.storeWebHandle(saved.name, saved.handle);
      rememberRecent({ path: saved.name, title: tab.project.name, web: true });
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

// ───────────────────────── projects in a database (desktop; Settings › Database)

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
    const id = tab.dbId ?? tab.project._id;
    const text = tab.text();
    await withProgress('progress.dbSave', db.where, () => native.dbSave(db.config, { id, title: tab.project.name || docName(tab), data: text }));
    tab.dbId = id;
    if (!tab.path) { tab.name = tab.name ?? tab.project.name; tab.markSaved(null); }
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
  if (result?.action === 'open' && result.id) await openDatabaseProject(result.id);
}

async function openDatabaseProject(id) {
  const existing = state.docs.find((doc) => doc.dbId === id);
  if (existing) { activateDoc(existing.id); notify('info', t('notice.alreadyOpen', { name: docName(existing) })); return existing; }
  const db = dbReady();
  if (!db) return null;
  if (!(await confirmReplace())) return null;
  try {
    const row = await withProgress('progress.dbLoad', db.where, () => native.dbLoad(db.config, id));
    if (!row) { notify('error', t('notice.dbMissing', { name: id })); return null; }
    const { project } = parseAny(`${row.title || 'project'}.myuml`, row.data);
    const tab = new ProjectDocument(project, { name: row.title || project.name });
    tab.dbId = id;
    addTab(tab);
    notify('success', t('notice.dbOpened', { name: docName(tab) }));
    return tab;
  } catch (error) {
    showError('error.dbOpen', error, db.where);
    return null;
  }
}

async function deleteDatabaseProject(id, title) {
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
  const fallback = state.settings.lastDirectory ? `${state.settings.lastDirectory}/myumlmaker.db` : 'myumlmaker.db';
  const file = await native.chooseDatabaseFile(settings.dbFile || fallback);
  if (file) updateSettings({ dbFile: file });
}

// ───────────────────────── export

const MIMES = { mumlt: 'application/json', mdj: 'application/json', mfj: 'application/json', svg: 'image/svg+xml', html: 'text/html', md: 'text/markdown', mmd: 'text/plain', puml: 'text/plain', pdf: 'application/pdf', zip: 'application/zip', sql: 'text/plain' };

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

const diagramSvg = (diagram, options = {}) => renderDiagramSvg(activeTab().project, diagram, { measure, language: lang(), lineStyle: state.settings.defaultLineStyle, theme: state.settings.diagramTheme, font: state.settings.diagramFont, fontSize: state.settings.diagramFontSize, showShadow: state.settings.showShadow, ...options });
const fileSafe = (text) => String(text ?? '').replace(/[\\/:*?"<>|]/g, '_');

async function exportAs(type) {
  const tab = activeTab();
  if (!tab) return;
  state.view?.finishEdit?.();
  const diagram = currentDiagram();
  const base = safeName(tab);
  let name = `${base}.${type}`;
  try {
    let content;
    if (type === 'mumlt') content = tab.text({ template: true });
    else if (type === 'mdj') content = exportMdj(tab.project);
    else if (type === 'mfj') {
      const element = selectedElements()[0] ?? tab.index.get(state.explorer[0]);
      if (!element) return;
      name = `${fileSafe(element.name || element._type)}.mfj`;
      content = exportFragment(element);
    } else if (type === 'svg') { name = `${base} - ${fileSafe(diagram.name)}.svg`; content = diagramSvg(diagram, { ids: hasSelection() ? new Set(selectedIds()) : null }).svg; }
    else if (type === 'html') content = await withProgress('progress.export', name, async () => htmlDocs(tab.project, { language: lang(), renderDiagram: (d) => diagramSvg(d).svg }));
    else if (type === 'md') content = markdownDocs(tab.project, { language: lang(), imageLink: (d) => `images/${fileSafe(d.name)}.svg` });
    else if (type === 'mmd') { name = `${fileSafe(diagram.name)}.mmd`; content = exportMermaid(tab.project, diagram); }
    else if (type === 'puml') { name = `${fileSafe(diagram.name)}.puml`; content = exportPlantUml(tab.project, diagram); }
    if (type === 'md') {
      // The Markdown document and its pictures go into one ZIP.
      const entries = [{ name: `${base}.md`, data: content }, ...M.allDiagrams(tab.project).map((d) => ({ name: `images/${fileSafe(d.name)}.svg`, data: diagramSvg(d).svg }))];
      await saveExport(`${base}-docs.zip`, 'zip', zip(entries));
      return;
    }
    await saveExport(name, type, content);
  } catch (error) {
    showError('error.export', error, name);
  }
}

const IMAGE_CHOICE_KEY = 'myumlmaker.imageExport';

/** The current diagram (or the selection) as PNG, JPEG, WebP, BMP, TIFF or SVG. */
async function exportImage(options) {
  const tab = activeTab();
  const diagram = currentDiagram();
  if (!tab || !diagram) return;
  const drawingOf = (area, transparent) => diagramSvg(diagram, { ids: area === 'selection' ? new Set(selectedIds()) : null, background: transparent ? 'none' : undefined });
  let choice = options;
  if (!choice) {
    let last = null;
    try { last = JSON.parse(localStorage.getItem(IMAGE_CHOICE_KEY) ?? 'null'); } catch { /* none yet */ }
    const areas = ['content', ...(selectedIds().length ? ['selection'] : [])];
    const sizes = Object.fromEntries(areas.map((area) => { const { width, height } = drawingOf(area, false); return [area, { width, height }]; }));
    choice = await popups.open('image', { sizes, last, areas });
    if (!choice?.format) return;
    try { localStorage.setItem(IMAGE_CHOICE_KEY, JSON.stringify(choice)); } catch { /* private mode */ }
  }
  const format = imageFormat(choice.format);
  const transparent = format.alpha && choice.transparent !== false;
  const name = `${safeName(tab)} - ${fileSafe(diagram.name)}.${format.ext}`;
  try {
    const blob = await withProgress('progress.image', name, async () => imageBlob(drawingOf(choice.area ?? 'content', transparent), format, choice, transparent));
    const type = format.ext === 'jpg' ? 'jpg' : format.ext;
    if (desktop) await saveExport(name, type, new Uint8Array(await blob.arrayBuffer()));
    else { await native.saveFileWeb(blob, { name, saveAs: true, mime: format.mime }); notify('success', t('notice.exported', { name })); }
  } catch (error) {
    showError('error.export', error, name);
  }
}

async function imageBlob({ svg, width, height }, format, choice, transparent) {
  if (format.encoder === 'svg') return new Blob([svg], { type: format.mime });
  const canvas = await svgToCanvas(svg, width, height, choice.scale ?? 2, transparent ? null : '#ffffff');
  if (format.encoder === 'canvas') return new Promise((resolve, reject) => canvas.toBlob((b) => (b?.type === format.mime ? resolve(b) : reject(new Error(`${format.mime}: not supported by this system`))), format.mime, (choice.quality ?? 92) / 100));
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const bytes = format.encoder === 'bmp' ? encodeBmp(pixels, canvas.width, canvas.height) : encodeTiff(pixels, canvas.width, canvas.height);
  return new Blob([bytes], { type: format.mime });
}

/** Every diagram as a picture, in one ZIP. */
async function exportAllImages() {
  const tab = activeTab();
  if (!tab) return;
  const diagrams = M.allDiagrams(tab.project);
  if (!diagrams.length) { notify('info', t('notice.noDiagrams')); return; }
  const format = imageFormat('png');
  try {
    const entries = await withProgress('progress.image', `${safeName(tab)}.zip`, async (op, report) => {
      const out = [];
      for (const [i, d] of diagrams.entries()) {
        report?.({ done: i, total: diagrams.length });
        const blob = await imageBlob(diagramSvg(d), format, { scale: 2 }, false);
        out.push({ name: `${String(i + 1).padStart(2, '0')} ${fileSafe(d.name)}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      return out;
    });
    await saveExport(`${safeName(tab)} - diagrams.zip`, 'zip', zip(entries));
  } catch (error) {
    showError('error.export', error);
  }
}

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

/** Every diagram as a PDF page (laid out with the print setup). */
async function exportPdf() {
  const tab = activeTab();
  if (!tab) return;
  const name = `${safeName(tab)}.pdf`;
  let setup = {};
  try { setup = JSON.parse(globalThis.localStorage?.getItem(PRINT_KEY) ?? '{}'); } catch { setup = {}; }
  try {
    const bytes = await withProgress('progress.pdf', name, async (op, report) => {
      const layout = renderPrintSheets(tab.project, { ...setup, range: 'all' }, { measure, currentPageId: tab.view.diagramId, language: lang(), t, theme: state.settings.diagramTheme, lineStyle: state.settings.defaultLineStyle });
      const pages = [];
      for (const [index, sheet] of layout.pages.entries()) {
        report?.({ done: index, total: layout.pages.length });
        const canvas = await svgToCanvas(sheet.svg, sheet.width, sheet.height, 150 / 96, '#ffffff');
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height });
      }
      return pdfFromJpegs(pages, { title: tab.project.name, pageWidth: (layout.paper.width * 72) / 25.4, pageHeight: (layout.paper.height * 72) / 25.4 });
    });
    await saveExport(name, 'pdf', bytes);
  } catch (error) {
    showError('error.export', error, name);
  }
}

// ───────────────────────── import: fragments, Mermaid / PlantUML text

/** Puts an imported element into the selected element, else a sensible place. */
function insertImported(element) {
  let tab = activeTab();
  if (!tab) tab = newProject();
  const created = change('op.import', (project) => {
    const preferred = M.findById(project, state.explorer[0]) ?? E.diagramOwner(project, currentDiagram() ?? project.ownedElements[0]?.ownedElements?.find(M.isDiagram) ?? { _id: null });
    const candidates = [preferred, project.ownedElements[0], project].filter(Boolean);
    const owner = candidates.find((o) => M.canContain(o, element._type)) ?? project;
    return M.insertElement(owner, element);
  });
  return created;
}

async function importFragmentFromPath(path) {
  try { const text = await native.readTextFile(path, `op-${M.newId()}`); finishFragment(text); } catch (error) { showError('error.import', error, path); }
}

async function importFragmentFile() {
  try {
    if (desktop) { const [path] = await native.chooseFiles(state.settings.lastDirectory, [native.SAVE_TYPES.mfj], false); if (path) await importFragmentFromPath(path); } else { const [file] = await native.pickWithInput('.mfj,.json'); if (file) finishFragment(await file.text()); }
  } catch (error) { showError('error.import', error); }
}

function finishFragment(text) {
  const element = importFragment(text);
  const created = insertImported(element);
  if (created) { selectElements([created._id]); notify('success', t('notice.fragmentImported', { name: created.name || typeLabel(created._type, lang()) })); }
}

async function openTextImport(initial = {}) {
  const result = await popups.open('textimport', { text: initial.text ?? '', format: initial.format ?? 'mermaid' });
  if (!result?.text) return;
  try {
    const imported = result.format === 'plantuml' ? importPlantUml(result.text, { language: lang() }) : importMermaid(result.text, { language: lang() });
    const owner = insertImported(imported.owner);
    if (!owner) return;
    const diagram = imported.diagram ? activeTab().index.get(imported.diagram._id) : null;
    if (diagram) openDiagram(diagram._id);
    notify('success', t('notice.textImported', { kind: imported.kind }));
  } catch (error) {
    showError('error.import', error);
  }
}

// ───────────────────────── code generation and reverse engineering

async function openCodegen(languageId = null) {
  const tab = activeTab();
  if (!tab) return;
  const rootElement = state.explorer.map((id) => tab.index.get(id))[0] ?? selectedElements()[0] ?? null;
  const s = state.settings;
  const result = await popups.open('codegen', {
    languages: CODE_LANGUAGES, dialects: SQL_DIALECTS, language: languageId ?? s.codegenLanguage, defaults: DEFAULT_CODEGEN_OPTIONS, options: s.codegenOptions,
    root: rootElement && rootElement._type !== 'Project' ? { id: rootElement._id, name: M.qualifiedName(tab.project, rootElement._id, tab.index) || rootElement.name, type: typeLabel(rootElement._type, lang()) } : null, desktop,
  });
  if (!result?.language) return;
  updateSettings({ codegenLanguage: result.language, codegenOptions: { ...s.codegenOptions, [result.language]: result.options } }, { quiet: true });
  try {
    const files = generateCode(tab.project, result.scope === 'selection' && rootElement ? rootElement._id : '', result.language, result.options);
    if (!files.length) { notify('info', t('notice.noCode')); return; }
    if (desktop && result.target !== 'zip') {
      const folder = await native.chooseFolder(state.settings.lastDirectory);
      if (!folder) return;
      await withProgress('progress.codegen', folder, async (op, report) => {
        for (const [i, file] of files.entries()) { report?.({ done: i, total: files.length }); await native.writeTextFile(`${folder}/${file.path}`, file.content, op); }
      });
      rememberDirectory(folder);
      notify('success', t('notice.codeGenerated', { count: files.length, where: folder }));
      if (result.openFolder) native.openExternal(folder).catch(() => {});
    } else {
      await saveExport(`${safeName(tab)}-${result.language}.zip`, 'zip', zip(files.map((f) => ({ name: f.path, data: f.content }))));
    }
  } catch (error) {
    showError('error.codegen', error);
  }
}

const languageOfFile = (name) => REVERSE_LANGUAGES.find((l) => l.exts.includes(extensionOf(name)))?.id ?? 'java';

function reverseMenu(anchor) {
  const handlers = {};
  const items = REVERSE_LANGUAGES.map((l) => { handlers[`custom:${l.id}`] = () => reverseFromDialog(l.id); return { id: `custom:${l.id}`, label: `${l.name} (${l.exts.map((e) => `.${e}`).join(', ')})`, icon: 'reverseCode' }; });
  if (desktop) { items.push({ separator: true }); handlers['custom:folder'] = () => reverseFolder(); items.push({ id: 'custom:folder', label: t('reverse.folder'), icon: 'folderOpen' }); }
  return showMenu(items, anchor ?? anchorFor('reverse'), 'context', { handlers, header: { icon: 'reverseCode', title: t('action.reverse') } });
}

async function readSources(paths, base = '') {
  const out = [];
  for (const path of paths) out.push({ name: base && path.startsWith(base) ? path.slice(base.length + 1).replace(/\\/g, '/') : baseName(path), content: await native.readTextFile(path, `op-${M.newId()}`) });
  return out;
}

async function reverseFromDialog(languageId) {
  const language = REVERSE_LANGUAGES.find((l) => l.id === languageId);
  try {
    let files;
    if (desktop) {
      const paths = await native.chooseFiles(state.settings.lastDirectory, [{ name: language.name, extensions: language.exts }], true);
      if (!paths.length) return;
      rememberDirectory(directoryOf(paths[0]));
      files = await withProgress('progress.open', `${paths.length}`, () => readSources(paths, directoryOf(paths[0])));
    } else {
      const picked = await native.pickWithInput(language.exts.map((e) => `.${e}`).join(','), true);
      if (!picked.length) return;
      files = await Promise.all(picked.map(async (f) => ({ name: f.webkitRelativePath || f.name, content: await f.text() })));
    }
    reverseFiles(files, languageId);
  } catch (error) {
    showError('error.reverse', error);
  }
}

async function reverseFolder() {
  try {
    const folder = await native.chooseFolder(state.settings.lastDirectory);
    if (!folder) return;
    const exts = REVERSE_LANGUAGES.flatMap((l) => l.exts);
    const paths = await native.invoke('list_files', { dir: folder, extensions: exts });
    if (!paths.length) { notify('info', t('notice.noSources')); return; }
    const counts = {};
    for (const p of paths) { const id = languageOfFile(p); counts[id] = (counts[id] ?? 0) + 1; }
    const languageId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const language = REVERSE_LANGUAGES.find((l) => l.id === languageId);
    const files = await withProgress('progress.open', folder, () => readSources(paths.filter((p) => language.exts.includes(extensionOf(p))), folder));
    rememberDirectory(folder);
    reverseFiles(files, languageId, { root: '' });
  } catch (error) {
    showError('error.reverse', error);
  }
}

function reverseFiles(files, languageId, options = {}) {
  if (!files.length) return;
  const { elements, warnings } = reverseEngineer(files, languageId, { ...DEFAULT_REVERSE_OPTIONS, ...options });
  if (!activeTab()) newProject();
  const created = change('op.reverse', (project) => {
    const target = M.findById(project, state.explorer[0]);
    const owner = target && ['UMLModel', 'UMLPackage', 'Project'].includes(target._type) ? target : project.ownedElements[0] ?? project;
    return elements.map((e) => M.insertElement(M.canContain(owner, e._type) ? owner : project, e));
  });
  // A class diagram of what was read (classifiers of the first package level), laid out.
  if (created?.length && languageId !== 'sql') {
    const diagram = change('op.reverse', (project) => {
      const owner = M.ownerOf(project, created[0]._id);
      const d = M.addDiagram(project, owner._id, 'UMLClassDiagram', { language: lang(), name: t('reverse.diagramName') });
      const classifiers = [];
      for (const e of created) M.walk(e, (x) => { if (['UMLClass', 'UMLInterface', 'UMLEnumeration'].includes(x._type)) classifiers.push(x); });
      classifiers.slice(0, 60).forEach((c, i) => M.showElement(project, d, c._id, { x: 40 + (i % 6) * 220, y: 40 + Math.floor(i / 6) * 220 }));
      M.addMissingEdgeViews(project, d);
      return d;
    });
    if (diagram) { openDiagram(diagram._id); runLayout('TB'); }
  } else if (created?.length) {
    const model = created[0];
    const diagram = change('op.reverse', (project) => {
      const d = M.addDiagram(project, model._id, 'ERDDiagram', { language: lang() });
      M.elementsWhere(model, (x) => x._type === 'ERDEntity').forEach((en, i) => M.showElement(project, d, en._id, { x: 40 + (i % 5) * 260, y: 40 + Math.floor(i / 5) * 240 }));
      M.addMissingEdgeViews(project, d);
      return d;
    });
    if (diagram) { openDiagram(diagram._id); runLayout('LR'); }
  }
  notify(warnings.length ? 'info' : 'success', t('notice.reversed', { count: files.length, warnings: warnings.length }));
  if (warnings.length) popups.open('validation', { title: t('reverse.warnings'), problems: warnings.map((w) => ({ severity: 'warning', message: { ko: `${w.file}: ${w.detail}`, en: `${w.file}: ${w.detail}` }, rule: w.code })) });
}

// ───────────────────────── validation, unused elements, statistics, find

let validationTimer = 0;
function scheduleValidation() { clearTimeout(validationTimer); validationTimer = setTimeout(() => { const tab = activeTab(); if (tab) { const p = validate(tab.project); state.validation = { errors: p.filter((x) => x.severity === 'error').length, warnings: p.filter((x) => x.severity !== 'error').length }; renderStatus(); } }, 800); }

async function runValidation() {
  const tab = activeTab();
  const problems = validate(tab.project);
  state.validation = { errors: problems.filter((x) => x.severity === 'error').length, warnings: problems.filter((x) => x.severity !== 'error').length };
  renderStatus();
  if (!problems.length) { notify('success', t('notice.valid')); return; }
  const index = tab.index;
  popups.open('validation', { title: t('action.validate'), problems: problems.map((p) => ({ ...p, name: p.id ? M.qualifiedName(tab.project, p.id, index) || M.displayName(index.get(p.id), lang()) : '' })), rules: VALIDATION_RULES });
}

function showUnused() {
  const tab = activeTab();
  const unused = M.elementsWithoutViews(tab.project);
  if (!unused.length) { notify('success', t('notice.noUnused')); return; }
  popups.open('validation', { title: t('action.unusedElements'), problems: unused.map((e) => ({ id: e._id, severity: 'info', name: M.qualifiedName(tab.project, e._id, tab.index), message: { ko: typeLabel(e._type, 'ko'), en: typeLabel(e._type, 'en') } })) });
}

function showStatistics() {
  const tab = activeTab();
  const stats = M.statistics(tab.project);
  const rows = Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => `${typeLabel(type, lang())}: ${count}`);
  ask({ icon: 'statistics', title: t('action.statistics'), message: t('stats.summary', { elements: stats.elements, views: stats.views, diagrams: stats.diagrams }), items: rows, buttons: [{ id: 'ok', label: t('common.ok'), primary: true }] });
}

// ───────────────────────── requirements list and traceability matrix

const traceState = { options: null, projectId: null };

function requirementList() {
  const tab = activeTab();
  return tab ? Tr.requirementRows(tab.project, { language: lang() }) : [];
}

function openRequirements() {
  if (!activeTab()) return;
  popups.open('requirements', { rows: requirementList() });
}

/** A requirement's status or priority from the list (one undo step). */
function setRequirementField(data) {
  const allowed = Tr.EDITABLE_REQUIREMENT_FIELDS[data.key];
  if (!allowed?.includes(data.value)) return;
  change('op.requirementEdit', (project) => { const r = M.findById(project, data.id); if (r?._type === 'SysMLRequirement') r[data.key] = data.value; });
}

/** First matrix: requirements × the kind of element most often related to them. */
function defaultTraceOptions(project, index) {
  const types = Tr.elementTypesIn(project).map((x) => x.type);
  const source = types.includes('SysMLRequirement') ? 'SysMLRequirement' : types[0] ?? '';
  const others = new Map();
  for (const rel of M.elementsWhere(project, M.isRelationship)) {
    const [a, b] = M.relationshipEnds(rel).map((id) => index.get(id));
    if (!a || !b) continue;
    for (const [x, y] of [[a, b], [b, a]]) if (x._type === source && y._type !== source) others.set(y._type, (others.get(y._type) ?? 0) + 1);
  }
  const target = [...others.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? (types.includes('SysMLBlock') ? 'SysMLBlock' : source);
  return { sourceType: source, targetType: target, relationType: '', sourceScope: '', targetScope: '', direction: source === 'SysMLRequirement' ? 'colToRow' : 'rowToCol' };
}

function traceParams() {
  const tab = activeTab();
  const project = tab.project;
  const o = traceState.options;
  const name = (type) => typeLabel(type, lang());
  return {
    options: o,
    elementTypes: Tr.elementTypesIn(project).map(({ type, count }) => ({ type, label: name(type), count })),
    relationTypes: [...new Set([...Tr.relationTypesIn(project).map((x) => x.type), ...Tr.RELATION_TYPES])].map((type) => ({ type, label: name(type), count: 0 })),
    scopes: Tr.scopesIn(project),
    matrix: Tr.matrix(project, {
      sourceTypes: o.sourceType ? [o.sourceType] : [], targetTypes: o.targetType ? [o.targetType] : [], relationTypes: o.relationType ? [o.relationType] : [],
      sourceScope: o.sourceScope || null, targetScope: o.targetScope || null, language: lang(),
    }),
  };
}

function openTraceMatrix() {
  const tab = activeTab();
  if (!tab) return;
  if (!traceState.options || traceState.projectId !== tab.project._id) {
    traceState.options = defaultTraceOptions(tab.project, tab.index);
    traceState.projectId = tab.project._id;
  }
  popups.open('tracematrix', traceParams());
}

function postTraceMatrix() {
  if (activeTab() && traceState.options) popups.post('tracematrix', { type: 'trace-matrix', ...traceParams() });
}

/** A matrix cell click: deletes the chosen relationship between the two (either way), else creates it in the chosen direction. */
function toggleTraceCell(data) {
  const o = traceState.options;
  const type = o?.relationType;
  if (!type) { notify('info', t('trace.pickType')); return; }
  const [sourceId, targetId] = o.direction === 'colToRow' ? [data.colId, data.rowId] : [data.rowId, data.colId];
  change('op.traceToggle', (project) => {
    const forward = Tr.relationsBetween(project, sourceId, targetId, type).length;
    const back = Tr.relationsBetween(project, targetId, sourceId, type).length;
    return !forward && back ? Tr.toggleRelation(project, { sourceId: targetId, targetId: sourceId, type, language: lang() }) : Tr.toggleRelation(project, { sourceId, targetId, type, language: lang() });
  });
}

let traceRefreshTimer = 0;
/** Open requirement / matrix popups follow every edit (and undo). */
function refreshTracePopups() {
  if (!popups.isOpen('requirements') && !popups.isOpen('tracematrix')) return;
  clearTimeout(traceRefreshTimer);
  traceRefreshTimer = setTimeout(() => {
    if (!activeTab()) return;
    if (popups.isOpen('requirements')) popups.post('requirements', { type: 'req-rows', rows: requirementList() });
    if (popups.isOpen('tracematrix')) postTraceMatrix();
  }, 60);
}

function openFind() {
  popups.open('find', { query: '' });
}

function findElements(data) {
  const tab = activeTab();
  if (!tab) return [];
  return M.findElements(tab.project, data.text, { matchCase: data.matchCase, whole: data.whole, documentation: data.documentation !== false, language: lang() }).slice(0, 500).map((e) => ({ id: e._id, name: M.displayName(e, lang()), type: typeLabel(e._type, lang()), icon: typeDef(e._type)?.icon ?? 'umlClass', path: M.qualifiedName(tab.project, e._id, tab.index) }));
}

function revealElement(id) {
  const tab = activeTab();
  const element = tab?.index.get(id);
  if (!element) return;
  if (M.isDiagram(element)) { openDiagram(id); return; }
  selectElements([id]);
  explorerView?.reveal(id);
  const views = M.viewsEverywhere(tab.project, id);
  if (views.length && !views.some((x) => x.diagram._id === tab.view.diagramId)) { openDiagram(views[0].diagram._id, { reveal: id }); }
}

// ───────────────────────── print

function openPrint() {
  const tab = activeTab();
  state.view?.finishEdit?.();
  let setup = {};
  try { setup = JSON.parse(globalThis.localStorage?.getItem(PRINT_KEY) ?? '{}'); } catch { setup = {}; }
  popups.open('print', { doc: tab.project, title: tab.project.name, currentPageId: tab.view.diagramId, setup, theme: state.settings.diagramTheme, lineStyle: state.settings.defaultLineStyle });
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
    state.explorer = [];
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

// ───────────────────────── colours

async function pickColor(key, anchor = null) {
  const views = selectedViews();
  const current = views[0]?.[key] ?? '';
  const result = await popups.open('color', { key, current, colors: ['#fff2cc', '#dae8fc', '#d5e8d4', '#f8cecc', '#e1d5e7', '#ffe6cc', '#f5f5f5'] }, { anchor: anchor ?? anchorFor(key === 'fillColor' ? 'fillColor' : 'lineColor') });
  if (result && 'color' in result) applyColor(key, result.color);
}

function applyColor(key, color) {
  if (color && key in lastColors) lastColors[key] = color;
  setViewStyle({ [key]: color || null });
  renderToolbarState();
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
  return { ...point, flipY: toScreen(rect.left, rect.top - 2).y };
}

const anchorFor = (command) => anchorBelow(root.querySelector(`[data-command="${command}"]`) ?? root.querySelector('#toolbar'));

function menuItems(ids) {
  return ids.map((id) => (id === '-' ? { separator: true } : typeof id === 'object' ? {
    id: `submenu:${id.sub}`, label: t(`submenu.${id.sub}`), icon: SUBMENUS[id.sub].icon, submenu: true,
    disabled: !SUBMENUS[id.sub].items.some((item) => item !== '-' && commandEnabled(item)),
  } : {
    id, label: t(commands[id].label), icon: commands[id].icon, shortcut: commands[id].key ? keyLabel(commands[id].key) : '', disabled: !commandEnabled(id), checked: commands[id].checked?.(),
  }));
}

async function showMenu(items, anchor, name = 'context', context = {}) {
  state.openMenu = name;
  renderMenubar();
  const header = context.header ?? (MENUS[name] ? { icon: MENU_ICONS[name], title: t(`menu.${name}`) } : { icon: 'umlProject', title: 'MyUMLMaker' });
  const result = await popups.open('menu', { items, name, header }, { anchor });
  if (state.openMenu === name) {
    state.openMenu = null;
    state.lastMenuClose = { name, at: Date.now() };
    renderMenubar();
  }
  const id = result?.id;
  if (!id) return undefined;
  if (id.startsWith('submenu:')) {
    const key = id.slice('submenu:'.length);
    const at = result.at ?? anchor;
    const where = { x: at.x, y: at.y, flipY: at.flipY ?? at.y };
    const dynamic = state.dynamicMenus.get(key);
    if (dynamic) return showMenu(dynamic.items, where, name, { ...context, handlers: { ...context.handlers, ...dynamic.handlers }, header: dynamic.header });
    return showMenu(menuItems(SUBMENUS[key].items), where, name, { ...context, header: { icon: SUBMENUS[key].icon, title: t(`submenu.${key}`) } });
  }
  if (id.startsWith('custom:')) return context.handlers?.[id]?.();
  return run(id, context);
}

function openMenubarMenu(name) {
  const element = root.querySelector(`[data-menu="${name}"]`);
  if (!element) return;
  showMenu(menuItems(MENUS[name]), anchorBelow(element), name);
}

/** Context menus: a node, a line, several views, the canvas, an element in the explorer, tabs, panels … */
function contextMenu(event, kind, payload = {}) {
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  const tab = activeTab();
  if (kind === 'node' || kind === 'edge') {
    const v = viewById(payload.id);
    const element = v?.model ? tab.index.get(M.refId(v.model)) : null;
    const items = [{ id: 'custom:edit', label: t('canvas.edit'), icon: 'textTool', shortcut: 'F2' }, { separator: true }];
    const handlers = { 'custom:edit': () => state.view?.startEdit(payload.id) };
    if (element) {
      const related = E.relatedFor(element);
      if (related.length) {
        const key = `related:${payload.id}`;
        const leaves = related.map((k) => { handlers[`custom:rel:${k}`] = () => addRelated(payload.id, k); return { id: `custom:rel:${k}`, label: t(`related.${k}`), icon: TYPES[E.RELATED[k].type]?.icon ?? 'plus' }; });
        state.dynamicMenus.set(key, { items: leaves, handlers, header: { icon: 'plus', title: t('quick.related') } });
        items.push({ id: `submenu:${key}`, label: t('quick.related'), icon: 'plus', submenu: true });
      }
      const adds = addableTypes(element).filter((x) => TYPES[x].feature || ['UMLPort', 'UMLPart', 'UMLConstraint'].includes(x));
      for (const type of adds.slice(0, 8)) { handlers[`custom:add:${type}`] = () => addElementTo(element._id, type); items.push({ id: `custom:add:${type}`, label: t('action.addType', { type: typeLabel(type, lang()) }), icon: TYPES[type].icon }); }
      items.push({ separator: true });
    }
    items.push(...menuItems(['cut', 'copy', 'paste', 'duplicate', '-', 'delete', 'deleteFromModel', '-', 'selectInExplorer', ...(kind === 'edge' ? [sub('lineStyle')] : [sub('stereotype'), sub('display'), 'autoResize', 'fitContent']), sub('font'), 'fillColor', 'lineColor', '-', sub('order')]));
    if (element && kind === 'node') { handlers['custom:explorerAdd'] = () => addElementMenu(anchor, element._id); }
    const title = element ? `${typeLabel(element._type, lang())}${element.name ? `: ${element.name}` : ''}` : typeLabel(v?._type, lang());
    return showMenu(items, anchor, 'context', { handlers, header: { icon: element ? typeDef(element._type)?.icon : viewDef(v?._type).icon, title } });
  }
  if (kind === 'multi') return showMenu(menuItems(['cut', 'copy', 'duplicate', '-', 'delete', 'deleteFromModel', '-', sub('align'), sub('order'), sub('layout'), '-', sub('font'), 'fillColor', 'lineColor', sub('lineStyle')]), anchor, 'context', { header: { icon: 'selectAll', title: t('status.selected', { count: selectedIds().length }) } });
  if (kind === 'canvas') {
    const items = menuItems(['paste', 'selectAll', '-', 'quickAddHere', 'showRelations', '-', sub('layout'), '-', 'zoomIn', 'zoomOut', 'fitPage', '-', sub('show'), '-', 'exportImage', 'exportSvg']);
    return showMenu(items, anchor, 'context', { header: { icon: typeDef(currentDiagram()?._type)?.icon ?? 'dgClass', title: currentDiagram()?.name ?? '' }, point: payload.point });
  }
  if (kind === 'element') {
    const element = tab.index.get(payload.id);
    const handlers = {
      'custom:open': () => openDiagram(element._id),
      'custom:add': () => addElementMenu(anchor, element._id),
      'custom:addDiagram': () => { state.explorer = [element._id]; addDiagramMenu(anchor); },
      'custom:rename': () => explorerView?.startRename(element._id),
      'custom:codegen': () => openCodegen(),
      'custom:fragment': () => exportAs('mfj'),
    };
    const items = [];
    if (M.isDiagram(element)) items.push({ id: 'custom:open', label: t('explorer.openDiagram'), icon: 'folderOpen' }, { separator: true });
    if (addableTypes(element).length) items.push({ id: 'custom:add', label: t('action.addElement'), icon: 'plus', shortcut: '' });
    if (typeDef(element._type)?.namespace || element._type === 'Project') items.push({ id: 'custom:addDiagram', label: t('action.addDiagram'), icon: 'dgAdd' });
    items.push({ separator: true });
    if (element._type !== 'Project') items.push({ id: 'custom:rename', label: t('explorer.rename'), icon: 'textTool', shortcut: 'F2' });
    items.push(...menuItems(['selectInDiagram', 'copy', 'cut', 'paste', '-', 'moveUp', 'moveDown', '-', 'deleteFromModel']));
    if (!M.isDiagram(element)) items.push({ separator: true }, { id: 'custom:codegen', label: t('action.generateCode'), icon: 'generateCode' }, { id: 'custom:fragment', label: t('action.exportFragment'), icon: 'fragmentOut' });
    return showMenu(items, anchor, 'context', { handlers, header: { icon: element._type === 'Project' ? 'umlProject' : typeDef(element._type)?.icon, title: M.displayName(element, lang()) } });
  }
  if (kind === 'diagramTab') {
    const handlers = { 'custom:rename': () => renameDiagramTab(payload.id), 'custom:select': () => revealElement(payload.id) };
    return showMenu([{ id: 'custom:rename', label: t('explorer.rename'), icon: 'textTool' }, { id: 'custom:select', label: t('action.selectInExplorer'), icon: 'selectInExplorer' }, { separator: true }, ...menuItems(['prevDiagram', 'nextDiagram', '-', 'exportImage', 'exportSvg', 'exportMermaid', 'exportPlantUml'])], anchor, 'context', { handlers, header: { icon: 'dgClass', title: tab.index.get(payload.id)?.name ?? '' } });
  }
  if (kind === 'tab') {
    activateDoc(payload.id);
    return showMenu(menuItems(['save', 'saveAs', 'saveTemplate', '-', 'projectProps', 'print', '-', 'closeTab', '-', 'new']), anchor, 'context', { header: { icon: 'umlProject', title: docName(activeTab()) } });
  }
  if (kind === 'tool') return showMenu([{ id: 'custom:sticky', label: t('toolbox.stickyTip'), icon: 'info', disabled: true }], anchor, 'context', { header: { icon: 'toolbox', title: t('panel.toolbox') } });
  if (kind === 'panel') return showMenu(menuItems(['leftPanel', 'rightPanel', 'statusBar', '-', 'settings']), anchor, 'context', { header: { icon: 'panelLeft', title: t('panel.toolbox') } });
  if (kind === 'start') return showMenu(menuItems(['new', 'open', 'recent', '-', 'shuffleBackground', 'backgroundImage', '-', 'tutorial', 'about']), anchor, 'context', { header: { icon: 'home', title: t('action.startPage') } });
  if (kind === 'status') return showMenu(menuItems(['statusBar', '-', 'zoomIn', 'zoomOut', 'zoomReset', 'fitPage', '-', 'theme', 'language']), anchor, 'context', { header: { icon: 'statusBar', title: t('action.statusBar') } });
  return showMenu(menuItems(['new', 'open', 'save', '-', 'undo', 'redo', '-', 'settings', 'about']), anchor, 'context', { header: { icon: 'umlProject', title: 'MyUMLMaker' } });
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

function openReader(doc = 'tutorial', language = getLanguage()) {
  popups.hideMenu();
  state.reader = { doc, lang: language === 'en' ? 'en' : 'ko' };
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
  const language = state.reader.lang;
  host.innerHTML = `
    <div class="reader-bar">
      <button class="button" data-reader="home" title="${escapeHtml(t('tip.home'))}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button>
      <h2 class="reader-title">${icon(info.glyph)}<span>${escapeHtml(t(info.title))}</span></h2>
      <select class="reader-chapters" data-reader-chapter title="${escapeHtml(t('reader.chapters'))}" aria-label="${escapeHtml(t('reader.chapters'))}"><option value="">${escapeHtml(t('reader.chapters'))}</option></select>
      <span class="grow"></span>
      <span class="segmented" role="radiogroup" title="${escapeHtml(t('reader.language'))}">
        <button class="segment ${language === 'ko' ? 'active' : ''}" data-reader="lang" data-value="ko" role="radio" aria-checked="${language === 'ko'}" title="한국어">한국어</button>
        <button class="segment ${language === 'en' ? 'active' : ''}" data-reader="lang" data-value="en" role="radio" aria-checked="${language === 'en'}" title="English">English</button>
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

// ───────────────────────── presentation (full screen, diagram by diagram)

const presentationDiagrams = () => M.allDiagrams(activeTab().project).filter((d) => M.viewsOf(d).length);

async function startPresentation() {
  const tab = activeTab();
  if (!tab) return;
  state.view?.finishEdit?.();
  const diagrams = presentationDiagrams();
  if (!diagrams.length) { notify('info', t('notice.noDiagrams')); return; }
  state.presenting = { index: Math.max(0, diagrams.findIndex((d) => d._id === tab.view.diagramId)) };
  const host = root.querySelector('#presentation');
  host.hidden = false;
  renderPresentation();
  try { if (desktop) await appWindow.setFullscreen(true); else await document.documentElement.requestFullscreen?.(); } catch { /* windowed is fine */ }
  host.focus();
}

function renderPresentation() {
  const host = root.querySelector('#presentation');
  const diagrams = presentationDiagrams();
  const diagram = diagrams[state.presenting.index];
  if (!diagram) return;
  const { svg } = diagramSvg(diagram, { padding: 30 });
  host.innerHTML = `<div class="present-stage">${svg.replace('<svg ', '<svg preserveAspectRatio="xMidYMid meet" ').replace(/ width="[\d.]+" height="[\d.]+"/, ' width="100%" height="100%"')}</div>
    <div class="present-bar"><button class="icon-button" data-present="prev" title="${escapeHtml(t('present.prev'))}" aria-label="${escapeHtml(t('present.prev'))}">${icon('chevronLeft')}</button><span>${escapeHtml(`${diagram.name} · ${state.presenting.index + 1} / ${diagrams.length}`)}</span><button class="icon-button" data-present="next" title="${escapeHtml(t('present.next'))}" aria-label="${escapeHtml(t('present.next'))}">${icon('chevronRight')}</button><button class="icon-button" data-present="exit" title="${escapeHtml(t('present.exit'))}" aria-label="${escapeHtml(t('present.exit'))}">${icon('close')}</button></div>`;
  host.tabIndex = 0;
}

function presentStep(direction) {
  if (!state.presenting) return;
  const count = presentationDiagrams().length;
  const next = state.presenting.index + direction;
  if (next < 0 || next >= count) { if (next >= count) stopPresentation(); return; }
  state.presenting.index = next;
  renderPresentation();
}

async function stopPresentation() {
  if (!state.presenting) return;
  const diagram = presentationDiagrams()[state.presenting.index];
  state.presenting = null;
  const host = root.querySelector('#presentation');
  host.hidden = true;
  host.innerHTML = '';
  try { if (desktop) await appWindow.setFullscreen(false); else if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* ignore */ }
  if (diagram) openDiagram(diagram._id);
}

if (!desktop) document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && state.presenting) stopPresentation(); });

// ───────────────────────── external drag & drop

async function handleDroppedPaths(paths) {
  const sources = paths.filter((p) => isSourceFileName(baseName(p)));
  if (sources.length) await reverseFiles(await readSources(sources, directoryOf(sources[0])), languageOfFile(sources[0]));
  for (const path of paths.filter((p) => !isSourceFileName(baseName(p)))) {
    const name = baseName(path);
    try {
      if (isOpenableFileName(name) || isFragmentFileName(name) || isTextModelFileName(name)) await openPath(path);
      else if (isImageFileName(name)) await setBackgroundFromPath(path);
      else notify('error', t('notice.unsupportedDrop', { name }));
    } catch (error) {
      showError('error.drop', error, path);
    }
  }
}

async function handleDroppedFiles(files, text) {
  const sources = files.filter((f) => isSourceFileName(f.name));
  if (sources.length) reverseFiles(await Promise.all(sources.map(async (f) => ({ name: f.name, content: await f.text() }))), languageOfFile(sources[0].name));
  for (const file of files.filter((f) => !isSourceFileName(f.name))) {
    try {
      if (isOpenableFileName(file.name)) await openContent(file.name, await file.text());
      else if (isFragmentFileName(file.name)) finishFragment(await file.text());
      else if (isTextModelFileName(file.name)) await openTextImport({ text: await file.text(), format: /p(lant)?u(ml)?$/.test(extensionOf(file.name)) ? 'plantuml' : 'mermaid' });
      else if (isImageFileName(file.name) || file.type.startsWith('image/')) await setBackgroundFromFile(file);
      else notify('error', t('notice.unsupportedDrop', { name: file.name }));
    } catch (error) {
      showError('error.drop', error, file.name);
    }
  }
  if (!files.length && text && /^\s*(classDiagram|sequenceDiagram|flowchart|graph|erDiagram|stateDiagram|@startuml)/.test(text)) await openTextImport({ text, format: /@startuml/.test(text) ? 'plantuml' : 'mermaid' });
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
    if (target.closest('#presentation')) return presentStep(1);
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
      const anchor = ['themeMenu', 'exportMenu', 'alignMenu', 'layoutMenu', 'lineStyleMenu', 'recentFolders', 'fillColor', 'lineColor', 'fontColor', 'addDiagram', 'addElement', 'reverse'].includes(id) ? anchorBelow(command.closest('.split-button') ?? command) : undefined;
      return run(id, { anchor });
    }
    const tool = target.closest('[data-tool]:not(#app)');
    if (tool) return pickTool(tool.dataset.tool);
    const tbToggle = target.closest('[data-toolbox-toggle]');
    if (tbToggle) { const id = tbToggle.dataset.toolboxToggle; if (state.collapsedToolbox.has(id)) state.collapsedToolbox.delete(id); else state.collapsedToolbox.add(id); return renderToolbox(); }
    if (target.closest('[data-toolbox-compact]')) { updateSettings({ toolboxCompact: !state.settings.toolboxCompact }, { quiet: true }); return renderToolbox(); }
    const editorTab = target.closest('[data-editor-tab]');
    if (editorTab) { state.rightTab = editorTab.dataset.editorTab; return renderEditors(); }
    const editorToggle = target.closest('[data-editor-toggle]');
    if (editorToggle) { const id = editorToggle.dataset.editorToggle; if (state.collapsedEditors.has(id)) state.collapsedEditors.delete(id); else state.collapsedEditors.add(id); return renderEditors(); }
    const goto = target.closest('[data-goto]');
    if (goto) return revealElement(goto.dataset.goto);
    const openD = target.closest('[data-open-diagram]');
    if (openD) return openDiagram(openD.dataset.openDiagram, { reveal: openD.dataset.reveal });
    const memberAdd = target.closest('[data-member-add]');
    if (memberAdd) return memberAction('add', { spec: memberAdd.dataset.memberAdd, owner: memberAdd.dataset.owner });
    const memberDel = target.closest('[data-member-delete]');
    if (memberDel) return memberAction('delete', { id: memberDel.dataset.memberDelete });
    const memberMove = target.closest('[data-member-move]');
    if (memberMove) return memberAction('move', { spec: memberMove.dataset.memberMove });
    const tagAdd = target.closest('[data-tag-add]');
    if (tagAdd) return tagAction('add', { id: tagAdd.dataset.tagAdd });
    const tagDel = target.closest('[data-tag-delete]');
    if (tagDel) return tagAction('delete', { id: tagDel.dataset.tagDelete });
    const styleColor = target.closest('[data-style-color]');
    if (styleColor) return pickColor(styleColor.dataset.styleColor, anchorBelow(styleColor));
    const styleClear = target.closest('[data-style-clear]');
    if (styleClear) return setViewStyle({ [styleClear.dataset.styleClear]: null });
    const styleToggle = target.closest('[data-style-toggle]');
    if (styleToggle) { const key = styleToggle.dataset.styleToggle; return setViewStyle({ [key]: !selectedViews().every((v) => v[key]) || null }); }
    const styleSet = target.closest('[data-style-set]');
    if (styleSet) { const [key, value] = styleSet.dataset.styleSet.split(':'); return setViewStyle({ [key]: value || null, ...(key === 'lineStyle' ? { points: [] } : {}) }); }
    const styleAction = target.closest('[data-style-action]');
    if (styleAction) {
      if (styleAction.dataset.styleAction === 'fit') return fitToContent();
      return change('op.style', (project, diagram) => { for (const id of selectedIds()) { const v = M.findView(diagram, id); if (!v) continue; for (const key of ['fillColor', 'lineColor', 'fontColor', 'fontFace', 'fontSize', 'bold', 'italic', 'lineWidth', 'showShadow', 'stereotypeDisplay', 'suppressAttributes', 'suppressOperations', 'suppressReceptions', 'suppressLiterals', 'showVisibility', 'showNamespace', 'showOperationSignature', 'showProperty', 'showType', 'showMultiplicity', 'wordWrap', 'autoResize', 'lineStyle']) delete v[key]; } });
    }
    const imagePick = target.closest('[data-image-pick]');
    if (imagePick) return pickImageFor(imagePick.dataset.imagePick);
    const diagramTab = target.closest('[data-diagram-tab]');
    if (diagramTab) {
      const id = diagramTab.dataset.diagramTab;
      // The second press of a double click (the first one re-rendered the tab bar, so no dblclick event follows).
      if (event.detail === 2 && id === currentDiagram()?._id && !state.showStart) return renameDiagramTab(id);
      if (id !== currentDiagram()?._id || state.showStart || state.reader) openDiagram(id);
      return scrollActiveTabIntoView();
    }
    const scroll = target.closest('[data-tab-scroll]');
    if (scroll) return scrollTabs(Number(scroll.dataset.tabScroll));
    return undefined;
  });

  root.addEventListener('dblclick', (event) => {
    const diagramTab = event.target.closest('[data-diagram-tab]');
    if (diagramTab) renameDiagramTab(diagramTab.dataset.diagramTab);
    const tool = event.target.closest('[data-tool]:not(#app)');
    if (tool && state.tool) state.tool = { ...state.tool, sticky: true };
  });

  // Toolbox → canvas with the pointer: drag a tool onto the diagram to place it there.
  root.addEventListener('pointerdown', (event) => {
    const item = event.button === 0 ? event.target.closest?.('.tool-item[data-tool]') : null;
    if (!item) return;
    const diagram = currentDiagram();
    const tool = diagram && toolById(diagram._type, item.dataset.tool);
    if (!tool || tool.kind !== 'node') return;
    const start = { x: event.clientX, y: event.clientY };
    let ghost = null;
    const overCanvas = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest('.canvas-scroll');
    const move = (e) => {
      if (!ghost) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
        ghost = document.createElement('div');
        ghost.className = 'stencil-ghost';
        ghost.innerHTML = item.querySelector('svg')?.outerHTML ?? '';
        document.body.append(ghost);
      }
      ghost.style.transform = `translate(${e.clientX - 14}px, ${e.clientY - 14}px)`;
      ghost.classList.toggle('over', Boolean(overCanvas(e)));
    };
    const up = (e) => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      if (!ghost) return;
      ghost.remove();
      const swallow = (c) => { c.stopPropagation(); c.preventDefault(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, true), 0);
      if (e.type === 'pointerup' && overCanvas(e) && state.view?.toPage) { const p = state.view.toPage(e.clientX, e.clientY); createNodeAt(tool, { x: state.view.snap(p.x), y: state.view.snap(p.y), w: 0, h: 0 }); }
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  });

  root.addEventListener('contextmenu', (event) => {
    const editable = event.target.closest('input:not([type="range"]):not([type="checkbox"]), textarea');
    if (editable) { event.preventDefault(); return textContextMenu(editable, event); }
    if (event.defaultPrevented) return undefined;
    event.preventDefault();
    const diagramTab = event.target.closest('[data-diagram-tab]');
    if (diagramTab) { openDiagram(diagramTab.dataset.diagramTab); return contextMenu(event, 'diagramTab', { id: diagramTab.dataset.diagramTab }); }
    if (event.target.closest('#start-page')) return contextMenu(event, 'start');
    if (event.target.closest('#statusbar')) return contextMenu(event, 'status');
    if (event.target.closest('.side-panel, #toolbar, #menubar')) return contextMenu(event, 'panel');
    return contextMenu(event, 'default');
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target.dataset.field && target.dataset.target) return setField(target.dataset.target, target.dataset.field, target.value, target);
    if (target.dataset.style) {
      const key = target.dataset.style;
      if (target.type === 'checkbox') return setViewStyle({ [key]: target.checked });
      const value = ['fontSize', 'lineWidth'].includes(key) ? Number(target.value) || null : target.value || null;
      return setViewStyle({ [key]: value });
    }
    if (target.dataset.tagField) { return tagAction('field', { spec: target.dataset.tagField, value: target.value }); }
    if (target.dataset.viewText) return change('op.edit', (project, diagram) => { const v = M.findView(diagram, target.dataset.viewText); if (v) v.text = target.value; });
    if (target.dataset.viewField) return change('op.edit', (project, diagram) => { const v = M.findView(diagram, target.dataset.view); if (v) v[target.dataset.viewField] = target.value; });
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
    if (target.id === 'toolbox-search') {
      clearTimeout(bindEvents.searchTimer);
      bindEvents.searchTimer = setTimeout(() => {
        state.toolboxQuery = target.value;
        const pos = target.selectionStart;
        renderToolbox();
        const input = root.querySelector('#toolbox-search');
        input?.focus();
        input?.setSelectionRange(pos, pos);
      }, 150);
    }
    if ('startSpeed' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}%`; state.settings.animationSpeed = Number(target.value); }
  });

  root.addEventListener('keydown', (event) => {
    if (event.target.id === 'zoom-value' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); setCanvasZoom(zoomStep(zoomPercent(), event.key === 'ArrowUp' ? 1 : -1)); } else if (event.target.id === 'zoom-value' && event.key === 'Enter') event.target.blur();
    else if (event.target.matches?.('#editors input[type="text"]') && event.key === 'Enter') { event.preventDefault(); event.target.dispatchEvent(new Event('change', { bubbles: true })); event.target.blur(); }
  });

  root.addEventListener('wheel', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.defaultPrevented) return;
    if (event.target.closest('.canvas-scroll')) return;
    event.preventDefault();
    setUiZoom(state.settings.zoom + (event.deltaY < 0 ? ZOOM.step : -ZOOM.step));
  }, { passive: false });

  root.querySelector('#tabs').addEventListener('wheel', (event) => {
    const strip = root.querySelector('.tab-strip');
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    event.preventDefault();
    strip.scrollLeft += event.deltaY || event.deltaX;
    updateTabNav();
  }, { passive: false });

  root.querySelectorAll('[data-split="left"], [data-split="right"]').forEach((splitter) => splitter.addEventListener('pointerdown', (event) => {
    const side = splitter.dataset.split;
    if ((side === 'left' && !state.settings.showLeftPanel) || (side === 'right' && !state.settings.showRightPanel)) return;
    event.preventDefault();
    const key = side === 'left' ? 'leftWidth' : 'rightWidth';
    const startWidth = state.settings[key];
    const minimum = side === 'left' ? PANEL_MIN.left : PANEL_MIN.right;
    pointerDrag(event, {
      cursor: 'col-resize',
      move: (dx) => {
        const width = Math.max(minimum, Math.min(700, startWidth + (side === 'left' ? dx : -dx)));
        root.style.setProperty(side === 'left' ? '--left-width' : '--right-width', `${width}px`);
        state.settings[key] = width;
      },
      end: (e, moved) => { if (moved) updateSettings({ [key]: state.settings[key] }, { quiet: true }); },
    });
  }));

  root.querySelector('[data-resize-grip]')?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    appWindow?.startResizeDragging('SouthEast').catch(() => {});
  });

  window.addEventListener('resize', frameThrottle(() => {
    updateTabNav();
    if (state.presenting) renderPresentation();
    if (desktop && state.minWidth && window.innerWidth < state.minWidth - 1) native.setMinimumSize(state.minWidth, 600).catch(() => {});
  }));

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', (event) => { if (event.key === ' ' && state.view) state.view.spaceDown = false; }, true);

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
    }
  });

  if (!desktop) {
    let depth = 0;
    document.addEventListener('dragenter', (event) => { if ([...(event.dataTransfer?.types ?? [])].includes('Files')) { depth += 1; setDropActive(true); event.preventDefault(); } });
    document.addEventListener('dragover', (event) => { event.preventDefault(); });
    document.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) setDropActive(false); });
    document.addEventListener('drop', (event) => {
      event.preventDefault();
      depth = 0;
      setDropActive(false);
      handleDroppedFiles([...(event.dataTransfer?.files ?? [])], event.dataTransfer?.getData('text/plain') ?? '');
    });
    window.addEventListener('beforeunload', (event) => {
      if (state.docs.some((doc) => doc.dirty)) { event.preventDefault(); event.returnValue = ''; }
    });
  }

  setInterval(() => {
    const clock = root.querySelector('#status-clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, 15000);
  setInterval(() => {
    const minutes = state.settings.autoSaveMinutes;
    if (!minutes || !desktop) return;
    const now = Date.now();
    for (const tab of state.docs) if (tab.path && tab.dirty && now - (tab.autoSavedAt ?? 0) > minutes * 60000) { tab.autoSavedAt = now; saveDoc(tab); }
  }, 30000);
}

async function pickImageFor(viewId) {
  try {
    let src = null;
    if (desktop) { const path = await native.chooseImage(state.settings.lastDirectory); if (path) src = `data:image/${extensionOf(path) === 'svg' ? 'svg+xml' : extensionOf(path) === 'jpg' ? 'jpeg' : extensionOf(path)};base64,${await native.readBase64File(path, `op-${M.newId()}`)}`; } else {
      const [file] = await native.pickWithInput('image/*');
      if (file) src = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(file); });
    }
    if (src) change('op.edit', (project, diagram) => { const v = M.findView(diagram, viewId); if (v) v.src = src; });
  } catch (error) { showError('error.picture', error); }
}

/** Ctrl+key shortcuts: [key, shift, command]. */
const SHORTCUTS = [
  ['n', false, 'new'], ['o', false, 'open'], ['s', false, 'save'], ['s', true, 'saveAs'], ['w', false, 'closeTab'], ['p', false, 'print'],
  ['z', false, 'undo'], ['y', false, 'redo'], ['z', true, 'redo'], ['x', false, 'cut'], ['c', false, 'copy'], ['v', false, 'paste'], ['d', false, 'duplicate'],
  ['a', false, 'selectAll'], ['f', false, 'find'], ['e', false, 'selectInExplorer'], ['delete', false, 'deleteFromModel'],
  ['=', false, 'zoomIn'], ['+', false, 'zoomIn'], ['-', false, 'zoomOut'], ['0', false, 'zoomReset'], ['w', true, 'fitPage'],
  ['b', false, 'bold'], ['i', false, 'italic'], ['>', true, 'fontUp'], ['.', true, 'fontUp'], ['<', true, 'fontDown'], [',', true, 'fontDown'],
  ['f', true, 'bringFront'], ['k', true, 'sendBack'], ['g', true, 'generateCode'], ['r', true, 'reverse'], ['v', true, 'validate'], ['1', false, 'tool:pointer'],
  [',', false, 'settings'], ['l', true, 'language'], ['!', true, 'leftPanel'], ['1', true, 'leftPanel'], ['@', true, 'rightPanel'], ['2', true, 'rightPanel'],
  ['q', false, 'exit'], ['h', true, 'startPage'], ['b', true, 'shuffleBackground'], ['pageup', false, 'prevDiagram'], ['pagedown', false, 'nextDiagram'],
  ['arrowup', false, 'moveUp'], ['arrowdown', false, 'moveDown'], ['r', false, 'recent'],
];

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  if (state.presenting) {
    event.preventDefault();
    if (key === 'escape') stopPresentation();
    else if (['arrowright', 'arrowdown', 'pagedown', ' ', 'enter'].includes(key)) presentStep(1);
    else if (['arrowleft', 'arrowup', 'pageup', 'backspace'].includes(key)) presentStep(-1);
    else if (key === 'home') { state.presenting.index = 0; renderPresentation(); } else if (key === 'end') { state.presenting.index = presentationDiagrams().length - 1; renderPresentation(); }
    return;
  }
  if (tutorial?.active && key === 'escape') { event.preventDefault(); tutorial.stop(); return; }
  const editing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.altKey && key === 's') { event.preventDefault(); run('saveAll'); return; }
  if (mod && !event.altKey) {
    if (editing && ['x', 'c', 'v', 'z', 'y', 'a', 'b', 'i', 'arrowup', 'arrowdown', 'delete'].includes(key)) return;
    if (key === 'tab') { event.preventDefault(); cycleTab(event.shiftKey ? -1 : 1); return; }
    const shortcut = SHORTCUTS.find(([k, shift]) => k === key && shift === event.shiftKey);
    if (shortcut) { event.preventDefault(); event.stopPropagation(); run(shortcut[2]); }
    return;
  }
  if (key === 'f1') { event.preventDefault(); run('about'); return; }
  if (key === 'f5') { event.preventDefault(); run('presentation'); return; }
  if (key === 'f11') { event.preventDefault(); run('tutorial'); return; }
  if (editing) {
    if (key === 'escape' && !event.target.classList.contains('text-editor')) event.target.blur();
    return;
  }
  if (event.target.closest?.('#explorer')) return;
  const canvas = state.view instanceof DiagramView ? state.view : null;
  if (key === ' ' && canvas) { event.preventDefault(); canvas.spaceDown = true; return; }
  if (key === 'f2' && canvas && selectedIds().length === 1) { event.preventDefault(); canvas.startEdit(selectedIds()[0]); return; }
  if (key === 'delete' || key === 'backspace') { event.preventDefault(); run('delete'); return; }
  if (key === 'escape') {
    if (state.tool) { setTool(null); return; }
    run('clearSelection');
    return;
  }
  if (key === 'enter' && canvas && selectedIds().length === 1) { event.preventDefault(); canvas.startEdit(selectedIds()[0]); return; }
  if (canvas && key.startsWith('arrow') && selectedIds().length) {
    event.preventDefault();
    const step = event.shiftKey ? 1 : Math.max(1, Math.round(canvas.gridStep()));
    const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
    const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
    change('op.nudge', (project, diagram) => E.moveViews(diagram, selectedIds(), dx, dy));
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
  popups.on('find-run', (data, kind) => popups.post(kind, { type: 'find-results', results: findElements(data) }));
  popups.on('find-select', (data) => revealElement(data.id));
  popups.on('validation-select', (data) => { if (data.id) revealElement(data.id); });
  popups.on('raise-test-panic', () => native.invoke('raise_test_panic').catch((error) => showError('error.unexpected', error)));
  popups.on('db-password', (data) => { dbSessionPassword = String(data.password ?? ''); });
  popups.on('db-test', (data, kind) => testDatabase(String(data.password ?? ''), kind));
  popups.on('db-browse', () => chooseDatabaseFile());
  popups.on('db-delete', (data) => deleteDatabaseProject(data.id, data.title));
  popups.on('db-refresh', async () => {
    const db = dbReady();
    if (db) popups.post('database', { type: 'db-list', items: await dbList(db).catch((error) => { showError('error.dbOpen', error, db.where); return []; }) });
  });
  popups.on('codegen-preview', (data, kind) => {
    try {
      const tab = activeTab();
      const files = generateCode(tab.project, data.scope === 'selection' ? data.rootId ?? '' : '', data.language, data.options);
      popups.post(kind, { type: 'codegen-preview', files: files.slice(0, 60) });
    } catch (error) { popups.post(kind, { type: 'codegen-preview', error: formatError(error).message, files: [] }); }
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

/** What the views, the explorer, the editors and the tutorial use. */
const appApi = {
  state,
  t,
  measure,
  language: () => getLanguage(),
  version: () => (state.info?.version ?? VERSION),
  settings: () => state.settings,
  tab: () => activeTab(),
  doc: () => activeTab(),
  diagram: () => currentDiagram(),
  selection: () => state.selection,
  explorerSelection: () => state.explorer,
  tool: () => state.tool,
  isSelected,
  select,
  selectElements,
  clearSelection,
  setTool,
  pickTool,
  pointerAt,
  contextMenu,
  run,
  commands,
  popups,
  notify,
  showError,
  change,
  openDiagram,
  openDiagramType,
  closeDiagram,
  addDiagram,
  createNodeAt,
  createEdgeBetween,
  canConnect,
  addMessageOnConnector,
  moveViewsLive,
  commitViews,
  reconnect,
  removeBend,
  renameElement,
  editModeOf,
  commitEdit,
  quickAction,
  dropElements,
  moveElements,
  viewsOfElement,
  zoomChanged,
  showStartPage,
  updateSettings,
  newProject,
  newDrawing: newProject,
  openSampleBuiltin,
  openMenubarMenu,
  shuffleBackground,
  renderAll,
  renderToolbarState,
  anchorBelow,
  closeDoc,
  ask,
  openReader: (doc, language) => openReader(doc, language),
  closeReader: () => { if (state.reader) { state.reader = null; if (activeTab()) mountView(); renderAll(); } },
  get view() { return state.view; },
  get explorer() { return explorerView; },
};

async function start() {
  renderShell();
  bindEvents();
  bindPopupActions();
  await popups.init();
  state.info = await native.appInfo().catch(() => null);
  if (state.settings.animationRandom) updateSettings({ animation: randomAnimation(state.settings.animation) }, { quiet: true });
  setInterval(tickStartBackground, 1000);
  document.title = `MyUMLMaker v${state.info?.version ?? VERSION}`;
  native.setBackendLanguage(state.settings.language);
  state.samples = await native.sampleFiles().catch(() => []);
  native.listFonts().then((fonts) => { state.fonts = fonts ?? []; }).catch(() => {});
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
      else if (type === 'drop') { setDropActive(false); handleDroppedPaths(event.payload.paths ?? []); }
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
  if (!state.docs.length && !state.settings.showStartPage) newProject();
  if (!state.active && state.docs.length) activate(state.docs[0].id);
  else renderAll();
  if (desktop) {
    await appWindow.show();
    await appWindow.setFocus();
    setTimeout(() => popups.prewarm('menu'), 400);
  }
  if (!state.settings.tutorialOffered && !globalThis.__MYUMLMAKER_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome')) {
    updateSettings({ tutorialOffered: true }, { quiet: true });
    setTimeout(async () => {
      const result = await popups.open('welcome', {});
      if (result?.choice === 'tutorial') startTutorial();
      else if (result?.choice === 'sample') openSampleAsk();
    }, 600);
  }
}

// Test hook: the E2E suites drive the app through this (no effect on normal use).
window.__myumlmaker = {
  state,
  t,
  commands,
  popups,
  run,
  api: appApi,
  debug: () => ({ openMenu: state.openMenu, showStart: state.showStart, tool: state.tool?.id ?? null, focus: document.activeElement?.outerHTML?.slice(0, 80) ?? null, pending: [...popups.pending.keys()] }),
  actions: {
    newProject, openPath, openContent, saveDoc, closeDoc, select, selectElements, change, undo, redo, copySelection, pasteClipboard, duplicate, deleteFromView, deleteFromModel,
    setCanvasZoom, updateSettings, handleDroppedPaths, handleDroppedFiles, setBackgroundFromPath, removeBackground, confirmExit, openRecent, showError, openMenubarMenu,
    contextMenu, activeDoc, toScreen, docName, scrollTabs, withProgress, showStartPage, exportAs, exportImage, exportPdf, exportAllImages, createNodeAt, createEdgeBetween,
    align, distribute, reorder, setViewStyle, commitEdit, addDiagram, openDiagram, openDiagramType, closeDiagram, renameElement, addElementTo, addRelated, quickAction, dropElements, moveElements,
    runLayout, runValidation, openCodegen, reverseFiles, openTextImport, startTutorial, startPresentation, stopPresentation, presentStep, setTool, pickTool, findElements, revealElement,
    rememberDirectory, applyColor, openSampleBuiltin, shuffleBackground, fitToContent, showRelations,
  },
  domain: { M, E, TYPES, DIAGRAM_TYPES, TEMPLATES, toolboxFor, buildTemplate, buildSample, renderDiagramSvg, diagramBounds, tutorialSteps: () => TUTORIAL_STEPS.length },
  tutorial: () => tutorial,
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => {
    if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {});
  });
