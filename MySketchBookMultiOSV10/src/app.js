// MySketchBook main window: menu bar (also the title bar), toolbar, the left
// panel (library, materials, tool palette), the 3D view with its scene tabs, the
// right panel (outliner + editors) and the status bar with the Measurements box.
//
// The shell (menus as popup windows, toolbar, panels, start page, settings,
// themes, progress popups) follows MyUMLMaker; the 3D work is in engine/,
// tools/ and library/.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import * as THREE from 'three';
import APP_ICON from '../assets/icon-256.png';
import { createProject, History, newId, normalizeProject, buildIndex, removeEntities, levelOf, formatLength, parseLength, fromUnits, toUnits, polygonArea, polygonCentroid, formatArea } from './engine/document.js';
import { Viewport, VIEWS, STYLE_MODES } from './engine/viewport.js';
import { SceneBuilder } from './engine/builder.js';
import { Overlay } from './engine/overlay.js';
import { TEMPLATES, buildTemplate } from './engine/templates.js';
import { buildSampleProject } from './engine/samples.js';
import { packProject, unpackProject, isProjectName, isModelName } from './engine/fileformat.js';
import { wallDir, wallLength, wallNormal, splitWall, projectOnSegment } from './engine/walls.js';
import { getMaterial, presetOf, defineCustomMaterial, MATERIAL_PRESETS, clearMaterialCache } from './engine/materials.js';
import { CATEGORIES, catalogItem, itemName, itemParams, loadAssetItems, onCatalogChange, registerUserItem, searchItems, assetApi } from './library/catalog.js';
import * as Tools from './tools/tools.js';
import {
  ANIMATIONS, CANVAS_ZOOM, loadSettings, PANEL_MIN, RECENT_DIRS_KEY, RECENT_KEY, SESSION_KEY, STORAGE_KEY, storeSettings, MY_OBJECTS_KEY,
} from './domain/settings.js';
import { addRecent, loadRecent, loadRecentDirs, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import { baseName, directoryOf, extensionOf, fileSafe, stripExtension, withExtension } from './domain/paths.js';
import { switchFlag } from './flags.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { idbGet, idbSet, idbDelete } from './platform/idb.js';
import { PopupHost } from './platform/popups.js';
import { applyFont, applyTheme, randomThemeId, resolveTheme, themeName } from './themes.js';
import { escapeHtml, frameThrottle, isMac, keyLabel, pointerDrag } from './ui/dom.js';
import { AnimatedBackground } from './ui/background.js';
import { startPageHtml } from './ui/startpage.js';
import { startBoard } from './ui/startboard.js';
import { STEPS as TUTORIAL_STEPS, Tutorial } from './ui/tutorial.js';
import { entityInfoHtml, levelsHtml, libraryHtml, materialsHtml, outlinerHtml, paletteHtml, scenesHtml, shadowsHtml, stylesHtml, tagsHtml, PLACES } from './ui/panels.js';
import { itemThumbnail, materialThumbnail, cancelThumbnails, cachedThumbnail } from './ui/thumbnails.js';
import { Rulers } from './ui/rulers.js';
import { ScaleBar } from './ui/scalebar.js';
import { DOC_KINDS, docLabel, docWindowTitle } from './domain/helpdocs.js';
import { bytesToBase64 } from './export/files.js';
import { checkProject, countBySeverity } from './engine/checks.js';

const modelingModules = import.meta.glob('./tools/modeling.js', { eager: true });
const Modeling = Object.values(modelingModules)[0] ?? null;
const ioImport = import.meta.glob('./io/import.js');
const ioExport = import.meta.glob('./io/export.js');
const envModules = import.meta.glob('./library/environments.js', { eager: true });
const Env = Object.values(envModules)[0] ?? null;

const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const lang = () => getLanguage();

const state = {
  settings: loadSettings(globalThis.localStorage),
  recent: loadRecent(globalThis.localStorage),
  recentDirs: loadRecentDirs(globalThis.localStorage),
  doc: null,
  selection: [],
  hover: null,
  erase: [],
  tool: 'select',
  toolObject: null,
  placeItem: null,
  placeCategory: null,
  notice: null,
  info: null,
  openMenu: null,
  lastMenuClose: { name: null, at: 0 },
  quitting: false,
  untitled: 0,
  dropActive: false,
  minWidth: 0,
  maximized: false,
  clipboard: null,
  showStart: false,
  leftTab: 'library',
  rightTab: 'entity',
  libraryCategory: 'all',
  libraryQuery: '',
  materialCategory: 'all',
  materialQuery: '',
  outlinerQuery: '',
  outlinerCollapsed: new Set(),
  brush: 'wall-paint-sage',
  planView: false,
  vcb: { label: 'vcb.measurements', value: '' },
  stats: { fps: 0, calls: 0, triangles: 0, ms: 0 },
  dynamicMenus: new Map(),
  fonts: [],
  // Bottom panel: Problems (model checks), Messages (notices and errors), Information (the project in numbers).
  bottomTab: 'problems',
  problems: [],
  problemFilter: 'all',
  problemSelected: null,
  log: [],
};

const doc = () => state.doc;
const project = () => state.doc?.project ?? null;
const hasDoc = () => Boolean(state.doc) && !state.showStart;
const units = () => project()?.units ?? state.settings.units ?? 'mm';

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
    app: info ? `${info.name} ${info.version} (${info.web ? 'web' : `${info.os}/${info.arch}`}, ${info.commit})` : `MySketchBook ${VERSION}`,
  });
}

window.addEventListener('error', (event) => { if (event.error || event.message) showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''); });
window.addEventListener('unhandledrejection', (event) => showError('error.unexpected', event.reason));

// ───────────────────────── documents (one project at a time)

class Doc {
  constructor(projectData, { path = null, name = null, handle = null, assets = new Map() } = {}) {
    this.id = newId('doc');
    this.project = projectData;
    this.history = new History(projectData);
    this.path = path;
    this.name = name;
    this.handle = handle;
    this.assets = assets;
    this.revision = 0;
    this.savedRevision = 0;
  }
  get dirty() { return this.revision !== this.savedRevision; }
  markSaved() { this.savedRevision = this.revision; }
}

const docName = (d = doc()) => (d ? (d.path ? baseName(d.path) : d.name ?? (d.project.name || t('tabs.untitled', { n: 1 }))) : '');

function untitledName() { state.untitled += 1; return t('tabs.untitled', { n: state.untitled }); }

function setDoc(d) {
  // Leaving the start page closes the welcome popup (the tutorial's own card stays while it runs).
  if (!tutorial?.active) popups.close('welcome');
  state.doc = d;
  state.selection = [];
  state.hover = null;
  state.showStart = false;
  registerProjectAssets(d);
  for (const m of d.project.materials ?? []) defineCustomMaterial(m);
  mountViewport();
  builder.clearTemplates();
  syncScene();
  applyProjectView();
  viewport.setCameraState(d.project.camera);
  setTool('select');
  persistSession();
  scheduleProblems(0);
  renderAll();
}

function newProject(templateId = 'empty') {
  const name = templateId === 'empty' ? untitledName() : t(`template.${templateId}`);
  const p = buildTemplate(templateId, { name, names: (k) => t(`room.${k}`), wallHeight: state.settings.defaultWallHeight || 2.4 });
  p.units = state.settings.units;
  const d = new Doc(p, { name });
  setDoc(d);
  notify('success', t(templateId === 'empty' ? 'notice.newProject' : 'notice.fromTemplate', { name }));
  if (templateId === 'empty') viewport.setView('iso', { animate: false, box: new THREE.Box3(new THREE.Vector3(-4, 0, -4), new THREE.Vector3(4, 2.5, 4)) });
  return d;
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

async function newProjectAsk(templateId = 'empty') {
  if (!(await confirmReplace())) return null;
  return newProject(templateId);
}

async function openSampleAsk(id) {
  if (!(await confirmReplace())) return null;
  const p = buildSampleProject(id, lang());
  if (!p) return null;
  const d = new Doc(normalizeProject(p), { name: p.name });
  setDoc(d);
  return d;
}

function persistSession() {
  if (state.instance && !state.instance.first) return;
  try { globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify({ files: state.doc?.path ? [state.doc.path] : [] })); } catch { /* ignore */ }
}

// ───────────────────────── changes, undo

/**
 * Applies a change as one undo step: mutate(project) runs, the scene syncs, panels redraw.
 * `touch` = the collections it changes (faster undo snapshots); null = all.
 */
function change(labelKey, mutate, touch = null) {
  const d = doc();
  if (!d) return undefined;
  const result = mutate(d.project);
  commit(labelKey, touch);
  return result;
}

/** Records the current (already changed) state as one undo step. */
function commit(labelKey, touch = null) {
  const d = doc();
  if (!d) return;
  d.history.commit(d.project, t(labelKey), touch);
  d.revision += 1;
  afterChange();
}

/** A live preview step (dragging): the scene follows, no undo step yet. */
function live() {
  syncScene();
  updateSelectionBoxes();
}

function afterChange() {
  scheduleProblems();
  pruneSelection();
  syncScene();
  updateSelectionBoxes();
  renderTitleProject();
  renderTabs();
  renderRight();
  renderStatus();
  renderToolbarState();
}

function undo() {
  const d = doc();
  const label = d?.history.undo(d.project);
  if (label == null) return;
  d.revision += 1;
  afterChange();
  applyProjectView();
  notify('info', t('notice.undone', { label }));
}

function redo() {
  const d = doc();
  const label = d?.history.redo(d.project);
  if (label == null) return;
  d.revision += 1;
  afterChange();
  applyProjectView();
  notify('info', t('notice.redone', { label }));
}

// ───────────────────────── 3D view

let viewport = null;
let builder = null;
let overlay = null;
let rulers = null;
let scaleBar = null;
let dimsKey = '';

function mountViewport() {
  if (viewport) return;
  const host = root.querySelector('#view-host');
  host.innerHTML = `<div class="vp-labels"></div><div class="vp-select-rect" hidden></div>${navPadHtml()}`;
  viewport = new Viewport(host, {
    settings: () => ({ ...state.settings, quality: state.settings.renderQuality === 'fast' ? 'low' : 'high' }),
    onStats: (stats, final) => { state.stats = stats; if (final || stats.fps) renderStats(); },
    onCamera: (camera) => { if (doc()) doc().project.camera = camera; },
  });
  overlay = new Overlay(viewport, host.querySelector('.vp-labels'));
  builder = new SceneBuilder(viewport, { settings: () => ({ quality: state.settings.renderQuality === 'fast' ? 'low' : 'high' }), onAsync: () => updateSelectionBoxes() });
  builder.meshOf = Modeling?.meshOf ?? null;
  // The 2D plan always shows the active level alone; the 3D view follows the project's Level view.
  builder.levelMode = (p) => (state.planView ? 'active' : p.levelView ?? 'all');
  rulers = new Rulers(host, viewport, { units, enabled: () => state.settings.showRulers !== false, format: (v, o = {}) => formatLength(v, units(), { suffix: !o.short }) });
  scaleBar = new ScaleBar(host, viewport, {
    enabled: () => state.settings.showScaleBar !== false,
    format: (m) => formatLength(m, units() === 'mm' && m >= 1 ? 'm' : units()),
    position: () => state.settings.scaleBarPos,
    onMove: (pos, { live }) => { if (live) state.settings.scaleBarPos = pos; else updateSettings({ scaleBarPos: pos }, { quiet: true }); },
    title: t('tip.scaleBar'),
  });
  viewport.applySettings();
  bindViewportEvents(host);
  bindNavPad(host);
}

/** On-screen navigation: orbit, pan and zoom buttons (hold to keep moving), zoom extents and the top view. */
function navPadHtml() {
  const b = (nav, glyph, key) => `<button class="nav-button" data-nav="${nav}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(glyph)}</button>`;
  return `<div class="nav-pad" role="toolbar" aria-label="${escapeHtml(t('nav.title'))}">
    <div class="nav-ring nav-orbit" title="${escapeHtml(t('nav.orbitTip'))}">${b('orbit-up', 'chevronUp', 'nav.orbitUp')}${b('orbit-left', 'chevronLeft', 'nav.orbitLeft')}<span class="nav-center">${icon('orbitTool')}</span>${b('orbit-right', 'chevronRight', 'nav.orbitRight')}${b('orbit-down', 'chevronDown', 'nav.orbitDown')}</div>
    <div class="nav-ring nav-pan" title="${escapeHtml(t('nav.panTip'))}">${b('pan-up', 'chevronUp', 'nav.panUp')}${b('pan-left', 'chevronLeft', 'nav.panLeft')}<span class="nav-center">${icon('panTool')}</span>${b('pan-right', 'chevronRight', 'nav.panRight')}${b('pan-down', 'chevronDown', 'nav.panDown')}</div>
    <div class="nav-column">${b('zoom-in', 'zoomIn', 'nav.zoomIn')}${b('zoom-out', 'zoomOut', 'nav.zoomOut')}${b('extents', 'zoomExtents', 'action.zoomExtents')}</div>
  </div>`;
}

function bindNavPad(host) {
  const pad = host.querySelector('.nav-pad');
  let timer = 0;
  const step = (nav) => {
    const vp = viewport;
    const pivot = vp.target.clone();
    const s = 6;
    switch (nav) {
      case 'orbit-left': vp.orbit(-s, 0, pivot); break;
      case 'orbit-right': vp.orbit(s, 0, pivot); break;
      case 'orbit-up': vp.orbit(0, -s, pivot); break;
      case 'orbit-down': vp.orbit(0, s, pivot); break;
      case 'pan-left': vp.pan(-s * 2, 0, pivot); break;
      case 'pan-right': vp.pan(s * 2, 0, pivot); break;
      case 'pan-up': vp.pan(0, -s * 2, pivot); break;
      case 'pan-down': vp.pan(0, s * 2, pivot); break;
      case 'zoom-in': vp.dolly(0.94, pivot); break;
      case 'zoom-out': vp.dolly(1 / 0.94, pivot); break;
      case 'extents': vp.zoomExtents(); return false;
      default: return false;
    }
    vp.touchInteraction();
    if (doc()) doc().project.camera = vp.cameraState();
    return true;
  };
  const stop = () => { clearInterval(timer); timer = 0; };
  pad.addEventListener('pointerdown', (e) => {
    const button = e.target.closest('[data-nav]');
    if (!button || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    stop();
    // Held down: keeps moving (about 40 steps a second).
    if (step(button.dataset.nav)) timer = setInterval(() => step(button.dataset.nav), 25);
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) pad.addEventListener(type, stop);
  window.addEventListener('blur', stop);
}

function syncScene() {
  if (!viewport || !doc()) return;
  const p = doc().project;
  builder.sync(p);
  viewport.groundY = levelOf(p, p.activeLevel).elevation;
  viewport.grid.position.y = viewport.groundY - 0.002;
  renderAnnotations();
  updateSections();
  viewport.requestRender();
}

/** Style, sun, environment and plan-view state of the project → the viewport. */
function applyProjectView() {
  const p = project();
  if (!p || !viewport) return;
  viewport.setStyle(p.style.mode, { edges: p.style.edges !== false });
  viewport.renderer.toneMappingExposure = p.style.exposure ?? 1;
  viewport.setSun(p.sun, { enabled: state.settings.shadows !== false });
  const bg = p.style.background ?? 'sky';
  const dark = resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme).dark;
  if (bg === 'white') viewport.setSkyColors({ top: '#ffffff', horizon: '#ffffff', ground: '#f3f3f3' });
  else if (bg === 'dark') viewport.setSkyColors({ top: '#1b2230', horizon: '#2b3443', ground: '#20242b' });
  else viewport.setSkyColors(dark ? { top: '#5d7fa6', horizon: '#a9b8c8', ground: '#7d7a74' } : { top: '#9fc4ea', horizon: '#e8eef3', ground: '#d9d4cb' });
  applyEnvironment(p.style.environment ?? 'room', bg === 'environment');
  viewport.requestRender();
}

let envToken = 0;
async function applyEnvironment(id, asBackground) {
  const token = ++envToken;
  if (!Env?.loadEnvironment || id === 'room') { viewport.setEnvironment(null, { intensity: 0.55 }); viewport.photoEnvironment = null; return; }
  try {
    const env = await withProgress('progress.environment', id, () => Env.loadEnvironment(id, viewport.renderer), { delay: 400 });
    if (token !== envToken) return;
    viewport.setEnvironment(env.texture, { background: asBackground ? env.background ?? env.texture : null, intensity: 0.8 });
    // The path tracer lights the photo with the same HDRI (an equirectangular texture, not the PMREM).
    viewport.photoEnvironment = env.background ?? null;
  } catch (error) { showError('error.environment', error, id); }
}

function updateSections() {
  const p = project();
  const planes = (p?.sections ?? []).filter((s) => s.active).map((s) => new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...s.normal), new THREE.Vector3(...s.point)));
  viewport.setSectionPlanes(planes);
}

/** Dimensions, texts and guides: overlay lines + labels, rebuilt when they change. */
function renderAnnotations() {
  const p = project();
  if (!p || !overlay) return;
  const key = JSON.stringify([p.dimensions, p.texts, p.guides, p.units, state.planView]);
  if (key === dimsKey) return;
  dimsKey = key;
  for (const name of [...overlay.labels.keys()]) if (name.startsWith('ann-')) overlay.clearLabel(name);
  const lines = [];
  for (const d of p.dimensions) {
    const a = new THREE.Vector3(...d.a); const b = new THREE.Vector3(...d.b); const o = new THREE.Vector3(...d.offset);
    lines.push(...Tools.dimensionLines(a, b, o));
    overlay.label(`ann-${d.id}`, a.clone().add(b).multiplyScalar(0.5).add(o), formatLength(a.distanceTo(b), p.units), { kind: 'dimension', dx: -20, dy: -20 });
  }
  overlay.lines('ann-dims', lines, { color: '#111827', depthTest: true });
  for (const tx of p.texts) overlay.label(`ann-${tx.id}`, new THREE.Vector3(...tx.point), tx.text, { kind: 'text', dx: 8, dy: -28 });
  overlay.lines('ann-guides', p.guides.flatMap((g) => [new THREE.Vector3(...g.a), new THREE.Vector3(...g.b)]), { color: '#6b7280', dashed: true, depthTest: true, opacity: 0.8 });
}

function bindViewportEvents(host) {
  const canvas = viewport.canvas;
  const toolOf = () => state.toolObject;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || viewport.navTool) return;
    canvas.focus();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointers (tests) */ }
    try { toolOf()?.down(e); } catch (error) { showError('error.tool', error); }
  });
  canvas.addEventListener('pointermove', frameThrottle((e) => {
    if (viewport.navDrag) return;
    try { toolOf()?.move(e); } catch (error) { showError('error.tool', error); }
    pointerStatus(e);
  }));
  canvas.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || viewport.navTool) return;
    // The pointer moves are throttled to frames: bring the tool to the release point first, so a quick click uses where it happened.
    try { if (!(toolOf() instanceof Tools.SelectTool)) toolOf()?.move(e); toolOf()?.up(e); } catch (error) { showError('error.tool', error); }
  });
  canvas.addEventListener('dblclick', (e) => { try { toolOf()?.dblclick(e); } catch (error) { showError('error.tool', error); } });
  canvas.addEventListener('pointerleave', () => { setHover(null); });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (viewport.navDrag?.moved) return;
    const hit = viewport.pick(e.clientX, e.clientY);
    if (hit?.entity && !isSelected(hit.entity.id)) select([hit.entity.id]);
    contextMenu(e, hit?.entity ? 'entity' : 'canvas', { hit });
  });
  // Library drag & drop onto the view.
  host.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('text/x-msk-item')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
}

function pointerStatus(e) {
  const g = viewport?.pickPoint(e.clientX, e.clientY);
  rulers?.setPointer(viewport?.planMode ? groundPoint(e) : null);
  const el = root.querySelector('#status-pointer');
  if (g && el) el.textContent = `${formatLength(g.x, units(), { suffix: false })}, ${formatLength(-g.z, units(), { suffix: false })}, ${formatLength(g.y, units(), { suffix: false })}`;
}

/** The point on the active level's floor plane under the cursor (tools). */
function groundPoint(e) {
  const p = project();
  if (!p || !viewport) return null;
  const y = levelOf(p, p.activeLevel).elevation;
  return viewport.screenToWorldOnPlane(e.clientX, e.clientY, new THREE.Vector3(0, y, 0), new THREE.Vector3(0, 1, 0));
}

// ───────────────────────── selection

const isSelected = (id) => state.selection.includes(id);
function entity(id) { const p = project(); if (!p) return null; return buildIndex(p).get(id) ?? null; }
const kindOf = (id) => ({ walls: 'wall', rooms: 'room', openings: 'opening', objects: 'object', models: 'model' })[entity(id)?.kind] ?? entity(id)?.kind ?? null;
const isLocked = (id) => Boolean(entity(id)?.entity.locked);

function select(ids, { add = false, toggle = false } = {}) {
  let next;
  if (toggle) { next = new Set(state.selection); for (const id of ids) { if (next.has(id)) next.delete(id); else next.add(id); } next = [...next]; }
  else if (add) next = [...new Set([...state.selection, ...ids])];
  else next = [...ids];
  state.selection = next;
  selectionChanged();
}

function clearSelection() { if (!state.selection.length) return; state.selection = []; selectionChanged(); }

function selectionChanged() {
  updateSelectionBoxes();
  if (state.rightTab !== 'entity' && state.selection.length && ['tags', 'scenes', 'levels'].includes(state.rightTab)) state.rightTab = 'entity';
  renderRight();
  renderStatus();
  renderToolbarState();
}

function pruneSelection() {
  const p = project();
  if (!p) { state.selection = []; return; }
  const index = buildIndex(p);
  state.selection = state.selection.filter((id) => index.has(id));
}

function setHover(id) {
  if (state.hover === id) return;
  state.hover = id;
  updateSelectionBoxes();
}

function markErase(ids) { state.erase = ids; updateSelectionBoxes(); }

function updateSelectionBoxes() {
  if (!viewport || !builder) return;
  const boxes = state.selection.map((id) => builder.orientedBox(id)).filter(Boolean);
  const hover = state.hover && !isSelected(state.hover) ? builder.orientedBox(state.hover) : null;
  viewport.setSelectionBoxes(boxes, { hover });
  if (state.erase.length) viewport.setSelectionBoxes([...boxes, ...state.erase.map((id) => builder.orientedBox(id)).filter(Boolean)], { color: '#d6303b' });
}

/** Entities whose screen footprint is inside (window) or touches (crossing) a screen rectangle. */
function entitiesInRect(box, { crossing = false } = {}) {
  const x0 = Math.min(box.x0, box.x1); const x1 = Math.max(box.x0, box.x1);
  const y0 = Math.min(box.y0, box.y1); const y1 = Math.max(box.y0, box.y1);
  const ids = [];
  for (const [id] of builder.built) {
    const ob = builder.orientedBox(id);
    if (!ob || !builder.objectOf(id)?.visible) continue;
    const pts = ob.corners.map((c) => viewport.worldToScreen(c));
    const inside = pts.every((s) => s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1);
    const touch = pts.some((s) => s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1);
    if (inside || (crossing && touch)) ids.push(id);
  }
  for (const mesh of builder.groups.walls.children) {
    const id = mesh.userData.entityId;
    const ob = builder.orientedBox(id);
    if (!ob) continue;
    const pts = ob.corners.map((c) => viewport.worldToScreen(c));
    const inside = pts.every((s) => s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1);
    const touch = pts.some((s) => s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1);
    if (inside || (crossing && touch)) ids.push(id);
  }
  return [...new Set(ids)];
}

function showSelectionRect(box) {
  const el = root.querySelector('.vp-select-rect');
  if (!el) return;
  if (!box) { el.hidden = true; return; }
  const r = root.querySelector('#view-host').getBoundingClientRect();
  el.hidden = false;
  el.classList.toggle('crossing', box.x1 < box.x0);
  el.style.left = `${Math.min(box.x0, box.x1) - r.left}px`;
  el.style.top = `${Math.min(box.y0, box.y1) - r.top}px`;
  el.style.width = `${Math.abs(box.x1 - box.x0)}px`;
  el.style.height = `${Math.abs(box.y1 - box.y0)}px`;
}

// ───────────────────────── entity operations

/** Moves entities by a world vector (live; the caller commits). Walls and rooms move their points. */
function moveEntities(ids, delta, { live: isLive = true } = {}) {
  const p = project();
  if (!p) return;
  const index = buildIndex(p);
  const moveWalls = new Set();
  for (const id of ids) {
    const hit = index.get(id);
    if (!hit || hit.entity.locked) continue;
    const e = hit.entity;
    if (hit.kind === 'objects' || hit.kind === 'models') { e.position = [e.position[0] + delta.x, e.position[1] + delta.y, e.position[2] + delta.z]; }
    else if (hit.kind === 'walls') moveWalls.add(e.id);
    else if (hit.kind === 'rooms') e.points = e.points.map(([x, z]) => [x + delta.x, z + delta.z]);
    else if (hit.kind === 'openings') {
      const wall = p.walls.find((w) => w.id === e.wall);
      if (wall) { const d = wallDir(wall); const L = wallLength(wall); e.offset = Math.max(e.width / 2, Math.min(L - e.width / 2, e.offset + d[0] * delta.x + d[1] * delta.z)); }
    } else if (hit.kind === 'dimensions') { e.a = add3(e.a, delta); e.b = add3(e.b, delta); }
    else if (hit.kind === 'texts') e.point = add3(e.point, delta);
    else if (hit.kind === 'guides') { e.a = add3(e.a, delta); e.b = add3(e.b, delta); }
  }
  // Moving walls drags the ends of walls joined to them (SketchUp's sticky geometry).
  if (moveWalls.size) {
    const moved = p.walls.filter((w) => moveWalls.has(w.id));
    const ends = moved.flatMap((w) => [w.a, w.b]).map((q) => [...q]);
    const near = (q) => ends.some((e) => Math.hypot(e[0] - q[0], e[1] - q[1]) < 0.01);
    for (const w of p.walls) {
      if (moveWalls.has(w.id)) { w.a = [w.a[0] + delta.x, w.a[1] + delta.z]; w.b = [w.b[0] + delta.x, w.b[1] + delta.z]; continue; }
      if (near(w.a)) w.a = [w.a[0] + delta.x, w.a[1] + delta.z];
      if (near(w.b)) w.b = [w.b[0] + delta.x, w.b[1] + delta.z];
    }
  }
  if (isLive) live();
}
const add3 = (a, d) => [a[0] + d.x, a[1] + d.y, a[2] + d.z];

/** Rotates entities about a vertical axis through `center` by `angle` (radians, counter-clockwise from above). */
function rotateEntities(ids, center, angle, { live: isLive = true } = {}) {
  const p = project();
  const index = buildIndex(p);
  const c = Math.cos(angle); const s = Math.sin(angle);
  const rot = ([x, z]) => { const dx = x - center.x; const dz = z - center.z; return [center.x + dx * c + dz * s, center.z - dx * s + dz * c]; };
  for (const id of ids) {
    const hit = index.get(id);
    if (!hit || hit.entity.locked) continue;
    const e = hit.entity;
    if (hit.kind === 'objects' || hit.kind === 'models') {
      const [x, z] = rot([e.position[0], e.position[2]]);
      e.position = [x, e.position[1], z];
      e.rotation = [e.rotation[0], e.rotation[1] + angle, e.rotation[2]];
    } else if (hit.kind === 'walls') { e.a = rot(e.a); e.b = rot(e.b); }
    else if (hit.kind === 'rooms') e.points = e.points.map(rot);
  }
  if (isLive) live();
}

/** Rotates the selection about its own centre (Rotate 90°, typed angles). */
function rotateSelection(angle) {
  const ids = state.selection.filter((id) => !isLocked(id));
  if (!ids.length) return;
  const box = new THREE.Box3();
  for (const id of ids) { const b = builder.worldBox(id); if (b) box.union(b); }
  rotateEntities(ids, box.getCenter(new THREE.Vector3()), angle);
  commit('op.rotate', ['objects', 'models', 'walls', 'rooms']);
}

function scaleEntities(ids, center, ratio, { live: isLive = true } = {}) {
  const p = project();
  const index = buildIndex(p);
  for (const id of ids) {
    const hit = index.get(id);
    if (!hit || !['objects', 'models'].includes(hit.kind)) continue;
    const e = hit.entity;
    e.scale = e.scale.map((v) => v * ratio);
    e.position = [center.x + (e.position[0] - center.x) * ratio, e.position[1], center.z + (e.position[2] - center.z) * ratio];
  }
  if (isLive) live();
}

/** Copies entities (new ids) in place; returns the new ids. Walls copy with their openings. */
function duplicateEntities(ids, { live: isLive = false } = {}) {
  const p = project();
  const index = buildIndex(p);
  const out = [];
  const wallMap = new Map();
  for (const id of ids) {
    const hit = index.get(id);
    if (!hit || ['levels', 'tags', 'scenes', 'materials'].includes(hit.kind)) continue;
    const copy = JSON.parse(JSON.stringify(hit.entity));
    copy.id = newId(hit.kind.slice(0, 2));
    if (hit.kind === 'walls') wallMap.set(id, copy.id);
    if (hit.kind === 'openings' && !ids.includes(hit.entity.wall)) continue;
    p[hit.kind].push(copy);
    out.push(copy.id);
  }
  for (const o of [...p.openings]) {
    if (wallMap.has(o.wall)) { const c = { ...JSON.parse(JSON.stringify(o)), id: newId('op'), wall: wallMap.get(o.wall) }; p.openings.push(c); }
  }
  if (isLive) live();
  return out;
}

async function deleteEntities(ids, { live: isLive = false } = {}) {
  const list = ids.filter((id) => !isLocked(id));
  if (!list.length) return;
  if (isLive) { removeEntities(project(), list); live(); return; }
  change('op.delete', (p) => removeEntities(p, list), null);
  notify('info', t('notice.deleted', { count: list.length }));
}

/** Paint bucket on a surface: wall side, floor/ceiling, a placed object's material, a modelled face. */
function paintHit(hit, preset) {
  const ent = hit.entity;
  if (!ent) return;
  const p = project();
  const e = entity(ent.id)?.entity;
  if (!e) return;
  if (ent.kind === 'wall') {
    const slots = hit.object.userData.slots ?? [];
    const slot = slots[Tools.geometryGroupOf(hit)] ?? 'left';
    const side = slot === 'right' ? 'right' : slot === 'top' ? 'top' : 'left';
    change('op.paint', () => { e.material = { ...(e.material ?? {}), [side]: preset }; }, ['walls']);
  } else if (ent.kind === 'room') {
    const part = hit.object.userData.part === 'ceiling' ? 'ceiling' : 'floor';
    change('op.paint', () => { e[part] = preset; }, ['rooms']);
  } else if (ent.kind === 'object' || ent.kind === 'opening') {
    const mats = Array.isArray(hit.object.userData.baseMaterial ?? hit.object.material) ? (hit.object.userData.baseMaterial ?? hit.object.material) : [hit.object.userData.baseMaterial ?? hit.object.material];
    const m = mats[Tools.geometryGroupOf(hit)] ?? mats[0];
    const original = originalPresetOf(e, m?.userData?.preset);
    if (!original) return;
    const kind = ent.kind === 'object' ? 'objects' : 'openings';
    change('op.paint', () => { e.materials = { ...(e.materials ?? {}), [original]: preset }; }, [kind]);
  } else if (ent.kind === 'model' && Modeling?.paintModelFace) {
    Modeling.paintModelFace(toolApi, ent.id, hit, preset);
  }
  void p;
}

/** The preset a part had before any override (overrides map original → chosen). */
function originalPresetOf(e, current) {
  if (!current) return null;
  const entry = Object.entries(e.materials ?? {}).find(([, v]) => v === current);
  return entry ? entry[0] : current;
}

/** The presets used by an object's meshes (Entity Info › Materials). */
function materialsOf(id) {
  const e = entity(id)?.entity;
  const item = catalogItem(e?.item);
  if (!item) return [];
  const template = item.kind === 'parametric' ? builder.instance(item, itemParams(item, e.params), {}) : builder.objectOf(id);
  const set = new Set();
  template?.traverse((o) => {
    if (!o.isMesh) return;
    const ms = o.userData.baseMaterial ?? o.material;
    for (const m of [].concat(ms)) if (m?.userData?.preset && m.userData.preset !== 'default') set.add(originalPresetOf(e, m.userData.preset));
  });
  return [...set].slice(0, 12);
}

function describeEntity(id) {
  const hit = entity(id);
  if (!hit) return '';
  const e = hit.entity;
  if (hit.kind === 'rooms') return `${e.name}\n${formatArea(polygonArea(e.points), units())}`;
  if (hit.kind === 'walls') return formatLength(wallLength(e), units());
  if (hit.kind === 'objects') return e.name || itemName(catalogItem(e.item), lang());
  return '';
}

/** Double-click: rooms/walls show Entity Info, models open for editing (SketchUp groups), objects select. */
function editEntity(id) {
  const kind = kindOf(id);
  if (kind === 'model' && Modeling?.editModel) { Modeling.editModel(toolApi, id); return; }
  state.rightTab = 'entity';
  if (!state.settings.showRightPanel) updateSettings({ showRightPanel: true });
  select([id]);
}

// ───────────────────────── tools

function makeTool(id) {
  switch (id) {
    case 'select': return new Tools.SelectTool(toolApi);
    case 'wall': return new Tools.WallTool(toolApi);
    case 'room': return new Tools.RoomTool(toolApi);
    case 'move': return new Tools.MoveTool(toolApi);
    case 'rotate': return new Tools.RotateTool(toolApi);
    case 'scale': return new Tools.ScaleTool(toolApi);
    case 'eraser': return new Tools.EraserTool(toolApi);
    case 'paint': return new Tools.PaintTool(toolApi);
    case 'tape': return new Tools.TapeTool(toolApi);
    case 'dimension': return new Tools.DimensionTool(toolApi);
    case 'text': return new Tools.TextTool(toolApi);
    case 'section': return new Tools.SectionTool(toolApi);
    case 'walk': return new Tools.WalkTool(toolApi);
    case 'orbit': case 'pan': case 'zoom': return new Tools.NavTool(toolApi, id);
    default: return Modeling?.createTool?.(toolApi, id) ?? null;
  }
}

/** Activates a tool by id (or a PlaceTool for a library item: { item }). */
function setTool(id, options = {}) {
  if (!viewport) return;
  try { state.toolObject?.deactivate(); } catch { /* ignore */ }
  overlay.reset();
  renderAnnotations();
  dimsKey = '';
  renderAnnotations();
  state.placeItem = null;
  state.placeCategory = null;
  let tool;
  if (id === 'place') {
    tool = new Tools.PlaceTool(toolApi, options.item, { params: options.params, sticky: options.sticky ?? true });
    state.placeItem = options.item.id;
    state.placeCategory = options.item.category;
  } else tool = makeTool(id);
  if (!tool) { notify('info', t('notice.toolUnavailable')); tool = makeTool('select'); id = 'select'; }
  state.tool = id;
  state.toolObject = tool;
  tool.activate();
  viewport.canvas.style.cursor = tool.cursor;
  root.querySelector('#view-host').dataset.tool = id;
  setVcb(tool.vcbLabel?.() ?? 'vcb.measurements', '');
  renderToolbarState();
  renderPalette();
  renderStatus();
  if (state.leftTab === 'library') root.querySelectorAll('.lib-card').forEach((el) => el.classList.toggle('active', el.dataset.item === state.placeItem));
}

function startPlacing(itemId, options = {}) {
  const item = catalogItem(itemId);
  if (!item || !hasDoc()) return;
  setTool('place', { item, ...options });
  notify('info', t(item.placement === 'opening' ? 'hint.placeOpening' : 'hint.place'));
}

function setVcb(labelKey, value) {
  state.vcb = { label: labelKey ?? state.vcb.label, value: value ?? '' };
  const label = root.querySelector('#vcb-label');
  const input = root.querySelector('#vcb');
  if (label) label.textContent = t(state.vcb.label);
  if (input && document.activeElement !== input) input.value = state.vcb.value;
}

function vcbEnter(text) {
  const tool = state.toolObject;
  if (!text.trim()) return;
  let ok = false;
  try { ok = tool?.vcb?.(text) ?? false; } catch (error) { showError('error.tool', error); return; }
  if (!ok) notify('error', t('notice.vcbInvalid', { text }));
}

async function prompt({ title, label, value = '' }) {
  const result = await popups.open('prompt', { title, label, value });
  return result?.value ?? null;
}

/** What the tools see of the app (tools/tools.js, tools/modeling.js). */
const toolApi = {
  get viewport() { return viewport; },
  get overlay() { return overlay; },
  get builder() { return builder; },
  project, level: () => levelOf(project(), project().activeLevel), units, settings: () => state.settings, t, notify, showError,
  change, commit, live, select, clearSelection, selection: () => state.selection, isSelected, isLocked, kindOf, setHover, markErase,
  moveEntities, rotateEntities, rotateSelection, scaleEntities, duplicateEntities, deleteEntities, paintHit, setTool, setVcb, groundPoint,
  entitiesInRect, showSelectionRect, editEntity, describeEntity, prompt, brush: () => state.brush, setBrush: (id) => { state.brush = id; renderLeft(); notify('info', t('notice.brush', { name: presetName(id) })); },
  sync: () => syncScene(), renderRight: () => renderRight(),
  eraseModel: (e) => Modeling?.eraseAt?.(toolApi, e) ?? false,
  cameraMoved: () => { if (doc()) doc().project.camera = viewport.cameraState(); },
};

const presetName = (id) => { const p = presetOf(id); return lang() === 'ko' ? p.ko : p.en; };

// ───────────────────────── commands

const sel = () => state.selection.length > 0;
const toggle = (key) => updateSettings({ [key]: !state.settings[key] });
const toolCommand = (id, glyph, key = null) => ({ icon: glyph, label: `tool.${id}`, key, enabled: hasDoc, checked: () => state.tool === id, run: () => setTool(id) });
const styleCommand = (mode, glyph) => ({ icon: glyph, label: `style.${mode}`, enabled: hasDoc, checked: () => project()?.style.mode === mode, run: () => setStyle({ mode }) });
const viewCommand = (name, glyph) => ({ icon: glyph, label: `view.${name}`, enabled: hasDoc, run: () => { if (state.planView && name !== 'top') setPlanView(false); viewport.setView(name); } });

const commands = {
  // file
  new: { icon: 'fileNew', label: 'action.new', key: 'Ctrl+N', run: () => newProjectAsk('empty') },
  newFromTemplate: { icon: 'template', label: 'action.newFromTemplate', run: (c) => templateMenu(c?.anchor) },
  open: { icon: 'folderOpen', label: 'action.open', key: 'Ctrl+O', run: () => openWithDialog() },
  startPage: { icon: 'home', label: 'action.startPage', key: 'Ctrl+Shift+H', checked: () => state.showStart || !state.doc, run: () => showStartPage(!state.showStart || !state.doc) },
  save: { icon: 'save', label: 'action.save', key: 'Ctrl+S', enabled: hasDoc, run: () => saveDoc() },
  saveAs: { icon: 'saveAs', label: 'action.saveAs', key: 'Ctrl+Shift+S', enabled: hasDoc, run: () => saveDoc({ saveAs: true }) },
  recent: { icon: 'recent', label: 'action.recent', key: 'Ctrl+R', run: () => popups.open('recent', {}) },
  recentFolders: { icon: 'recentFolder', label: 'action.recentFolders', run: (c) => recentFoldersMenu(c?.anchor) },
  clearRecent: { icon: 'clearHistory', label: 'action.clearRecent', enabled: () => state.recent.length > 0 || state.recentDirs.length > 0, run: () => clearRecentAll() },
  importModel: { icon: 'importModel', label: 'action.importModel', key: 'Ctrl+I', enabled: hasDoc, run: () => importModelDialog() },
  exportMenu: { icon: 'chevronDown', label: 'action.exportMenu', enabled: hasDoc, run: (c) => showMenu(menuItems(SUBMENUS.exportTo.items), c?.anchor ?? anchorFor('exportMenu'), 'context', { header: { icon: 'exportFile', title: t('submenu.exportTo') } }) },
  exportImage: { icon: 'exportImage', label: 'action.exportImage', key: 'Ctrl+Shift+E', enabled: hasDoc, run: () => exportImage() },
  renderPhoto: { icon: 'renderPhoto', label: 'action.renderPhoto', key: 'F9', enabled: hasDoc, run: () => renderPhoto() },
  exportGlb: { icon: 'exportModel', label: 'action.exportGlb', enabled: hasDoc, run: () => exportModel('glb') },
  exportGltf: { icon: 'exportModel', label: 'action.exportGltf', enabled: hasDoc, run: () => exportModel('gltf') },
  exportObj: { icon: 'exportModel', label: 'action.exportObj', enabled: hasDoc, run: () => exportModel('obj') },
  exportStl: { icon: 'exportModel', label: 'action.exportStl', enabled: hasDoc, run: () => exportModel('stl') },
  exportPly: { icon: 'exportModel', label: 'action.exportPly', enabled: hasDoc, run: () => exportModel('ply') },
  exportUsdz: { icon: 'exportModel', label: 'action.exportUsdz', enabled: hasDoc, run: () => exportModel('usdz') },
  exportPlan: { icon: 'plan2d', label: 'action.exportPlan', enabled: hasDoc, run: () => exportPlanImage() },
  exportSelection: { icon: 'exportModel', label: 'action.exportSelection', enabled: () => hasDoc() && sel(), run: () => exportModel('glb', { selection: true }) },
  closeProject: { icon: 'closeTab', label: 'action.closeProject', key: 'Ctrl+W', enabled: () => Boolean(state.doc), run: () => closeProject() },
  exit: { icon: 'exit', label: 'action.exit', key: isMac ? 'Ctrl+Q' : 'Alt+F4', run: () => requestExit() },
  // edit
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: () => Boolean(doc()?.history.canUndo), run: () => undo() },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: () => Boolean(doc()?.history.canRedo), run: () => redo() },
  cut: { icon: 'cut', label: 'action.cut', key: 'Ctrl+X', enabled: sel, run: () => { copySelection(); deleteEntities(state.selection); } },
  copy: { icon: 'copy', label: 'action.copy', key: 'Ctrl+C', enabled: sel, run: () => copySelection() },
  paste: { icon: 'paste', label: 'action.paste', key: 'Ctrl+V', enabled: () => hasDoc() && Boolean(state.clipboard), run: () => pasteClipboard() },
  duplicate: { icon: 'duplicate', label: 'action.duplicate', key: 'Ctrl+D', enabled: sel, run: () => { const ids = duplicateEntities(state.selection); moveEntities(ids, new THREE.Vector3(0.3, 0, 0.3), { live: false }); commit('op.duplicate'); select(ids); } },
  delete: { icon: 'trash', label: 'action.delete', key: 'Delete', enabled: sel, run: () => deleteEntities(state.selection) },
  selectAll: { icon: 'selectAll', label: 'action.selectAll', key: 'Ctrl+A', enabled: hasDoc, run: () => select([...builder.built.keys(), ...builder.groups.walls.children.map((m) => m.userData.entityId)].filter((id, i, a) => a.indexOf(id) === i)) },
  clearSelection: { icon: 'deselect', label: 'action.clearSelection', key: 'Esc', enabled: sel, run: () => clearSelection() },
  hide: { icon: 'hideTool', label: 'action.hide', enabled: sel, run: () => setEntityFlag('hidden', true) },
  unhideAll: { icon: 'unhideAll', label: 'action.unhideAll', enabled: hasDoc, run: () => change('op.unhide', (p) => { for (const k of ['walls', 'rooms', 'objects', 'models', 'openings']) for (const e of p[k]) delete e.hidden; }) },
  lock: { icon: 'lock', label: 'action.lock', enabled: sel, run: () => setEntityFlag('locked', true) },
  unlock: { icon: 'unlock', label: 'action.unlock', enabled: sel, run: () => setEntityFlag('locked', false) },
  rotate90: { icon: 'rotateTool', label: 'action.rotate90', key: 'Ctrl+]', enabled: sel, run: () => rotateSelection(-Math.PI / 2) },
  rotateMinus90: { icon: 'rotateTool', label: 'action.rotateMinus90', key: 'Ctrl+[', enabled: sel, run: () => rotateSelection(Math.PI / 2) },
  mirrorObject: { icon: 'flipTool', label: 'action.mirror', enabled: () => state.selection.some((id) => kindOf(id) === 'object'), run: () => change('op.mirror', (p) => { for (const o of p.objects) if (isSelected(o.id)) o.scale = [-o.scale[0], o.scale[1], o.scale[2]]; }, ['objects']) },
  dropToFloor: { icon: 'arrowDown', label: 'action.dropToFloor', enabled: () => state.selection.some((id) => kindOf(id) === 'object'), run: () => change('op.move', (p) => { for (const o of p.objects) if (isSelected(o.id)) o.position = [o.position[0], 0, o.position[2]]; }, ['objects']) },
  resetMaterials: { icon: 'refresh', label: 'action.resetMaterials', enabled: () => state.selection.length === 1, run: () => change('op.paint', () => { const e = entity(state.selection[0])?.entity; if (e) e.materials = {}; }, ['objects', 'openings']) },
  replaceItem: { icon: 'library', label: 'action.replaceItem', enabled: () => state.selection.length === 1 && ['object', 'opening'].includes(kindOf(state.selection[0])), run: (c) => replaceItemMenu(c?.anchor) },
  splitWall: { icon: 'lineTool', label: 'action.splitWall', enabled: () => state.selection.length === 1 && kindOf(state.selection[0]) === 'wall', run: () => splitSelectedWall() },
  flipWall: { icon: 'flipTool', label: 'action.flipWall', enabled: () => state.selection.length === 1 && kindOf(state.selection[0]) === 'wall', run: () => change('op.flip', () => { const w = entity(state.selection[0]).entity; [w.a, w.b] = [w.b, w.a]; w.material = { left: w.material?.right, right: w.material?.left, top: w.material?.top }; for (const o of project().openings) if (o.wall === w.id) o.offset = wallLength(w) - o.offset; }, ['walls', 'openings']) },
  deleteGuides: { icon: 'guide', label: 'action.deleteGuides', enabled: () => Boolean(project()?.guides.length), run: () => change('op.delete', (p) => { p.guides = []; }, ['guides']) },
  makeGroup: { icon: 'makeGroup', label: 'action.makeGroup', key: 'G', enabled: () => Boolean(Modeling?.makeGroup) && sel(), run: () => Modeling.makeGroup(toolApi, state.selection) },
  editModel: { icon: 'cube', label: 'action.editModel', enabled: () => Boolean(Modeling?.editModel) && state.selection.length === 1 && kindOf(state.selection[0]) === 'model', run: () => Modeling.editModel(toolApi, state.selection[0]) },
  explodeModel: { icon: 'explode', label: 'action.explode', enabled: () => Boolean(Modeling?.explode) && state.selection.some((id) => kindOf(id) === 'model'), run: () => Modeling.explode(toolApi, state.selection) },
  // draw / tools (SketchUp shortcuts)
  'tool:select': toolCommand('select', 'select', 'Space'),
  'tool:eraser': toolCommand('eraser', 'eraser', 'E'),
  'tool:paint': toolCommand('paint', 'paintBucket', 'B'),
  'tool:wall': toolCommand('wall', 'wallTool', 'W'),
  'tool:room': toolCommand('room', 'roomTool', 'Shift+R'),
  door: { icon: 'doorTool', label: 'tool.door', enabled: hasDoc, checked: () => state.placeCategory === 'doors', run: () => { showLibrary('doors'); startPlacing(searchItems({ category: 'doors' })[0]?.id ?? 'door-single'); } },
  window: { icon: 'windowTool', label: 'tool.window', enabled: hasDoc, checked: () => state.placeCategory === 'windows', run: () => { showLibrary('windows'); startPlacing(searchItems({ category: 'windows' })[0]?.id ?? 'window-casement'); } },
  'tool:line': toolCommand('line', 'lineTool', 'L'),
  'tool:rectangle': toolCommand('rectangle', 'rectTool', 'R'),
  'tool:circle': toolCommand('circle', 'circleTool', 'C'),
  'tool:arc': toolCommand('arc', 'arcTool', 'A'),
  'tool:polygon': toolCommand('polygon', 'polygonTool', 'Shift+P'),
  'tool:freehand': toolCommand('freehand', 'freehandTool'),
  'tool:pushpull': toolCommand('pushpull', 'pushPull', 'P'),
  'tool:move': toolCommand('move', 'moveTool', 'M'),
  'tool:rotate': toolCommand('rotate', 'rotateTool', 'Q'),
  'tool:scale': toolCommand('scale', 'scaleTool', 'S'),
  'tool:offset': toolCommand('offset', 'offsetTool', 'F'),
  'tool:followme': toolCommand('followme', 'followMe'),
  'tool:tape': toolCommand('tape', 'tapeMeasure', 'T'),
  'tool:dimension': toolCommand('dimension', 'dimension', 'D'),
  'tool:protractor': toolCommand('protractor', 'protractor'),
  'tool:text': toolCommand('text', 'label3d'),
  'tool:section': toolCommand('section', 'sectionPlane'),
  'tool:axes': toolCommand('axes', 'axesTool'),
  'tool:orbit': toolCommand('orbit', 'orbitTool', 'O'),
  'tool:pan': toolCommand('pan', 'panTool', 'H'),
  'tool:zoom': toolCommand('zoom', 'zoomTool', 'Z'),
  'tool:walk': toolCommand('walk', 'walkTool'),
  'tool:lookAround': toolCommand('lookAround', 'lookAround'),
  zoomExtents: { icon: 'zoomExtents', label: 'action.zoomExtents', key: 'Shift+Z', enabled: hasDoc, run: () => viewport.zoomExtents() },
  zoomSelection: { icon: 'zoomSelection', label: 'action.zoomSelection', enabled: sel, run: () => { const b = new THREE.Box3(); for (const id of state.selection) { const wb = builder.worldBox(id); if (wb) b.union(wb); } viewport.zoomExtents(b); } },
  solidUnion: { icon: 'solidUnion', label: 'action.solidUnion', enabled: () => Boolean(Modeling?.solid) && state.selection.filter((id) => kindOf(id) === 'model').length >= 2, run: () => Modeling.solid(toolApi, 'union', state.selection) },
  solidSubtract: { icon: 'solidSubtract', label: 'action.solidSubtract', enabled: () => Boolean(Modeling?.solid) && state.selection.filter((id) => kindOf(id) === 'model').length === 2, run: () => Modeling.solid(toolApi, 'subtract', state.selection) },
  solidIntersect: { icon: 'solidIntersect', label: 'action.solidIntersect', enabled: () => Boolean(Modeling?.solid) && state.selection.filter((id) => kindOf(id) === 'model').length === 2, run: () => Modeling.solid(toolApi, 'intersect', state.selection) },
  intersectFaces: { icon: 'intersect', label: 'action.intersectFaces', enabled: () => Boolean(Modeling?.intersect) && sel(), run: () => Modeling.intersect(toolApi, state.selection) },
  softenEdges: { icon: 'softenEdges', label: 'action.softenEdges', enabled: () => Boolean(Modeling?.soften) && sel(), run: () => Modeling.soften(toolApi, state.selection) },
  clearSections: { icon: 'sectionPlane', label: 'action.clearSections', enabled: () => Boolean(project()?.sections.length), run: () => change('op.delete', (p) => { p.sections = []; }, ['sections']) },
  toggleSections: { icon: 'sectionPlane', label: 'action.toggleSections', enabled: () => Boolean(project()?.sections.length), checked: () => Boolean(project()?.sections.some((s) => s.active)), run: () => change('op.section', (p) => { const any = p.sections.some((s) => s.active); for (const s of p.sections) s.active = !any; if (!any && p.sections.length) for (const s of p.sections.slice(0, -1)) s.active = false; }, ['sections']) },
  addLevel: { icon: 'levelAdd', label: 'action.addLevel', enabled: hasDoc, run: () => addLevel() },
  ...Object.fromEntries([['all', 'layers'], ['active', 'level'], ['below', 'stairsTool']].map(([mode, glyph]) => [`levelView:${mode}`, { icon: glyph, label: `levels.view.${mode}`, enabled: hasDoc, checked: () => (project()?.levelView ?? 'all') === mode, run: () => setLevelView(mode) }])),
  levelUp: { icon: 'arrowUp', label: 'action.levelUp', key: 'Ctrl+Shift+Up', enabled: () => hasDoc() && levelStep(1, true), run: () => levelStep(1) },
  levelDown: { icon: 'arrowDown', label: 'action.levelDown', key: 'Ctrl+Shift+Down', enabled: () => hasDoc() && levelStep(-1, true), run: () => levelStep(-1) },
  // camera / view
  ...Object.fromEntries(VIEWS.map((v) => [`view:${v}`, viewCommand(v, { iso: 'viewIso', top: 'viewTop', front: 'viewFront', back: 'viewBack', left: 'viewLeft', right: 'viewRight', bottom: 'viewBottom' }[v])])),
  viewsMenu: { icon: 'views', label: 'action.viewsMenu', enabled: hasDoc, run: (c) => showMenu(menuItems(SUBMENUS.views.items), c?.anchor ?? anchorFor('viewsMenu'), 'context', { header: { icon: 'views', title: t('submenu.views') } }) },
  perspective: { icon: 'perspective', label: 'action.perspective', enabled: hasDoc, checked: () => Boolean(viewport) && !viewport.isOrtho, run: () => { viewport.setProjection(!viewport.isOrtho ? true : false); renderToolbarState(); } },
  planView: { icon: 'plan2d', label: 'action.planView', key: 'F4', enabled: hasDoc, checked: () => state.planView, run: () => setPlanView(!state.planView) },
  ...Object.fromEntries(STYLE_MODES.map((m) => [`style:${m}`, styleCommand(m, { textured: 'styleTextured', shaded: 'styleShaded', white: 'styleWhite', xray: 'styleXray', wireframe: 'styleWireframe', hiddenline: 'styleHidden' }[m])])),
  styleMenu: { icon: 'chevronDown', label: 'action.styleMenu', enabled: hasDoc, run: (c) => showMenu(menuItems(SUBMENUS.faceStyle.items), c?.anchor ?? anchorFor('styleMenu'), 'context', { header: { icon: 'styleTextured', title: t('submenu.faceStyle') } }) },
  styleCycle: { icon: 'styleTextured', label: 'action.styleCycle', key: 'K', enabled: hasDoc, run: () => { const i = STYLE_MODES.indexOf(project().style.mode); setStyle({ mode: STYLE_MODES[(i + 1) % STYLE_MODES.length] }); } },
  edges: { icon: 'edgesToggle', label: 'action.edges', enabled: hasDoc, checked: () => project()?.style.edges !== false, run: () => setStyle({ edges: project().style.edges === false }) },
  shadows: { icon: 'shadowToggle', label: 'action.shadows', checked: () => state.settings.shadows !== false, run: () => { toggle('shadows'); } },
  lightsOn: { icon: 'lightsOn', label: 'action.lightsOn', enabled: hasDoc, checked: () => Boolean(project()?.style.lightsOn), run: () => setStyle({ lightsOn: !project().style.lightsOn }) },
  xray: { icon: 'styleXray', label: 'style.xray', enabled: hasDoc, checked: () => project()?.style.mode === 'xray', run: () => setStyle({ mode: project().style.mode === 'xray' ? 'textured' : 'xray' }) },
  grid: { icon: 'grid', label: 'action.grid', checked: () => state.settings.showGrid, run: () => toggle('showGrid') },
  scaleBar: { icon: 'scaleBar', label: 'action.scaleBar', checked: () => state.settings.showScaleBar !== false, run: () => { toggle('showScaleBar'); viewport?.requestRender(); } },
  rulers: { icon: 'rulers', label: 'action.rulers', key: 'Ctrl+Shift+R', checked: () => state.settings.showRulers !== false, run: () => { toggle('showRulers'); viewport?.requestRender(); } },
  axes: { icon: 'axesTool', label: 'action.axes', checked: () => state.settings.showAxes, run: () => toggle('showAxes') },
  snapGrid: { icon: 'snap', label: 'action.snapGrid', checked: () => state.settings.snapToGrid, run: () => toggle('snapToGrid') },
  fps: { icon: 'fps', label: 'action.fps', checked: () => state.settings.showFps, run: () => toggle('showFps') },
  quality: { icon: 'quality', label: 'action.quality', run: (c) => showMenu(menuItems(SUBMENUS.quality.items), c?.anchor ?? anchorFor('quality'), 'context', { header: { icon: 'quality', title: t('submenu.quality') } }) },
  ...Object.fromEntries(['fast', 'balanced', 'high'].map((q) => [`quality:${q}`, { icon: q === 'fast' ? 'fps' : q === 'high' ? 'renderPhoto' : 'quality', label: `quality.${q}`, checked: () => state.settings.renderQuality === q, run: () => updateSettings({ renderQuality: q }) }])),
  addScene: { icon: 'sceneAdd', label: 'action.addScene', enabled: hasDoc, run: () => addScene() },
  nextScene: { icon: 'pageNext', label: 'action.nextScene', key: 'PageDown', enabled: () => (project()?.scenes.length ?? 0) > 1, run: () => sceneStep(1) },
  prevScene: { icon: 'pagePrev', label: 'action.prevScene', key: 'PageUp', enabled: () => (project()?.scenes.length ?? 0) > 1, run: () => sceneStep(-1) },
  leftPanel: { icon: 'panelLeft', label: 'action.leftPanel', key: 'Ctrl+Shift+1', checked: () => state.settings.showLeftPanel, run: () => toggle('showLeftPanel') },
  rightPanel: { icon: 'panelRight', label: 'action.rightPanel', key: 'Ctrl+Shift+2', checked: () => state.settings.showRightPanel, run: () => toggle('showRightPanel') },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => state.settings.showStatusBar, run: () => toggle('showStatusBar') },
  bottomPanel: { icon: 'panelBottom', label: 'action.bottomPanel', key: 'Ctrl+J', checked: () => state.settings.showBottomPanel, run: () => toggle('showBottomPanel') },
  showProblems: { icon: 'warning', label: 'action.showProblems', enabled: hasDoc, run: () => { state.bottomTab = 'problems'; if (!state.settings.showBottomPanel) updateSettings({ showBottomPanel: true }); else renderBottom(); } },
  showMessages: { icon: 'info', label: 'action.showMessages', run: () => { state.bottomTab = 'messages'; if (!state.settings.showBottomPanel) updateSettings({ showBottomPanel: true }); else renderBottom(); } },
  clearMessages: { icon: 'clearHistory', label: 'action.clearMessages', enabled: () => state.log.length > 0, run: () => { state.log = []; renderBottom(); } },
  copyMessages: { icon: 'copy', label: 'action.copyMessages', enabled: () => state.log.length > 0, run: () => native.clipboardWrite(state.log.map(logLine).join('\n')).then(() => notify('success', t('notice.copiedText'))) },
  checkNow: { icon: 'validate', label: 'action.checkNow', enabled: hasDoc, run: () => { runProblems(); notify('info', t('notice.checked', { count: state.problems.length })); } },
  theme: { icon: 'palette', label: 'action.themeRandom', run: () => updateSettings({ theme: randomThemeId(state.settings.theme) }) },
  themeMenu: { icon: 'chevronDown', label: 'action.themeChoose', run: (c) => openThemePicker(c?.anchor) },
  language: { icon: 'globe', label: 'action.language', key: 'Ctrl+Shift+L', run: () => updateSettings({ language: getLanguage() === 'ko' ? 'en' : 'ko' }) },
  shuffleBackground: { icon: 'dice', label: 'action.shuffleBackground', key: 'Ctrl+Shift+B', run: () => shuffleBackground() },
  backgroundImage: { icon: 'imageBg', label: 'action.backgroundImage', run: () => chooseBackground() },
  clearBackground: { icon: 'imageClear', label: 'action.clearBackground', enabled: () => Boolean(state.settings.backgroundImage) || state.settings.backgroundKind !== 'none', run: () => removeBackground() },
  // help
  tutorial: { icon: 'tutorial', label: 'action.tutorial', key: 'F11', run: () => startTutorial() },
  userGuide: { icon: 'userGuide', label: 'action.userGuide', run: () => openDocWindow('guide') },
  tutorialDoc: { icon: 'tutorialDoc', label: 'action.tutorialDoc', run: () => openDocWindow('tutorial') },
  tutorialVideo: { icon: 'tutorialVideo', label: 'action.tutorialVideo', run: () => openDocWindow('video') },
  shortcuts: { icon: 'keyboard', label: 'action.shortcuts', run: () => popups.open('settings', { tab: 'shortcuts' }) },
  settings: { icon: 'gear', label: 'action.settings', key: 'Ctrl+,', run: () => popups.open('settings', { tab: 'general' }) },
  about: { icon: 'info', label: 'action.about', key: 'F1', run: () => popups.open('about') },
  welcome: { icon: 'bulb', label: 'action.welcome', run: () => openWelcome() },
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

function setStyle(patch) {
  const p = project();
  if (!p) return;
  Object.assign(p.style, patch);
  doc().revision += 1;
  applyProjectView();
  if ('lightsOn' in patch) { builder.updateLights(p); viewport.requestRender(); }
  renderToolbarState();
  renderRight();
}

function setPlanView(on) {
  if (!viewport || !project()) return;
  state.planView = on;
  // The plan shows the active level alone: hide or bring back the other levels.
  syncScene();
  const level = levelOf(project(), project().activeLevel);
  viewport.setPlanMode(on, { elevation: level.elevation, cutHeight: Math.min(1.2, level.height - 0.05) });
  builder.groups.cuts.visible = on;
  root.querySelector('#view-host')?.classList.toggle('plan-mode', on);
  for (const c of builder.groups.cuts.children) c.visible = c.userData.level === level.id;
  dimsKey = '';
  renderAnnotations();
  renderToolbarState();
  renderTabs();
  notify('info', t(on ? 'notice.planOn' : 'notice.planOff'));
}

function setEntityFlag(flag, value) {
  change(flag === 'hidden' ? 'op.hide' : 'op.lock', () => { for (const id of state.selection) { const e = entity(id)?.entity; if (e) { if (value) e[flag] = true; else delete e[flag]; } } });
  if (flag === 'hidden' && value) clearSelection();
}

function splitSelectedWall() {
  const w = entity(state.selection[0]).entity;
  const L = wallLength(w);
  change('op.split', (p) => {
    const [w1, w2] = splitWall(w, L / 2, () => newId('w'));
    p.walls = p.walls.filter((x) => x.id !== w.id).concat([w1, w2]);
    for (const o of p.openings) if (o.wall === w.id) { if (o.offset < L / 2) o.wall = w1.id; else { o.wall = w2.id; o.offset -= L / 2; } }
  }, ['walls', 'openings']);
}

function setLevelView(mode) {
  const p = project();
  if (!p) return;
  p.levelView = mode;
  doc().revision += 1;
  syncScene();
  renderTabs();
  renderToolbarState();
  notify('info', t(`levels.view.${mode}`));
}

/** The level above (dir 1) or below (-1); with `probe`, only whether there is one. */
function levelStep(dir, probe = false) {
  const p = project();
  if (!p) return false;
  const sorted = [...p.levels].sort((a, b) => a.elevation - b.elevation);
  const i = sorted.findIndex((l) => l.id === p.activeLevel);
  const next = sorted[i + dir];
  if (probe) return Boolean(next);
  if (next) activateLevel(next.id);
  return Boolean(next);
}

function addLevel() {
  const p = project();
  const top = p.levels.reduce((a, l) => (l.elevation > a.elevation ? l : a), p.levels[0]);
  const id = newId('lv');
  change('op.addLevel', (pr) => {
    pr.levels.push({ id, name: `${pr.levels.length + 1}F`, elevation: top.elevation + top.height + 0.25, height: top.height });
    // The outside walls of the level below go up with it (exterior walls are the thick ones), ready for new rooms.
    for (const w of pr.walls.filter((x) => x.level === top.id && (x.thickness ?? 0.15) >= 0.2)) pr.walls.push({ ...JSON.parse(JSON.stringify(w)), id: newId('w'), level: id });
    // Floors of the level below get their ceilings, so the storeys read as separate floors.
    for (const r of pr.rooms.filter((x) => x.level === top.id)) r.showCeiling = true;
    pr.activeLevel = id;
  }, null);
  state.rightTab = 'levels';
  renderRight();
}

function copySelection() {
  const p = project();
  const index = buildIndex(p);
  state.clipboard = state.selection.map((id) => index.get(id)).filter((h) => h && ['objects', 'models', 'walls', 'rooms', 'openings'].includes(h.kind)).map((h) => ({ kind: h.kind, entity: JSON.parse(JSON.stringify(h.entity)) }));
  notify('info', t('notice.copied', { count: state.clipboard.length }));
  renderToolbarState();
}

function pasteClipboard() {
  const items = state.clipboard ?? [];
  if (!items.length) return;
  const ids = [];
  change('op.paste', (p) => {
    const wallMap = new Map();
    for (const { kind, entity: e } of items) {
      if (kind === 'openings') continue;
      const copy = JSON.parse(JSON.stringify(e));
      copy.id = newId(kind.slice(0, 2));
      if (kind === 'walls') { wallMap.set(e.id, copy.id); copy.a = [copy.a[0] + 0.5, copy.a[1] + 0.5]; copy.b = [copy.b[0] + 0.5, copy.b[1] + 0.5]; copy.level = p.activeLevel; }
      if (kind === 'objects' || kind === 'models') { copy.position = [copy.position[0] + 0.5, copy.position[1], copy.position[2] + 0.5]; copy.level = p.activeLevel; }
      if (kind === 'rooms') { copy.points = copy.points.map(([x, z]) => [x + 0.5, z + 0.5]); copy.level = p.activeLevel; }
      p[kind].push(copy);
      ids.push(copy.id);
    }
    for (const { kind, entity: e } of items) if (kind === 'openings' && wallMap.has(e.wall)) { const c = { ...JSON.parse(JSON.stringify(e)), id: newId('op'), wall: wallMap.get(e.wall) }; p.openings.push(c); ids.push(c.id); }
  });
  select(ids);
}

async function replaceItemMenu(anchor) {
  const e = entity(state.selection[0])?.entity;
  const item = catalogItem(e?.item);
  if (!item) return;
  const list = searchItems({ category: item.category }).filter((x) => x.id !== item.id).slice(0, 30);
  const handlers = Object.fromEntries(list.map((x) => [`custom:${x.id}`, () => change('op.replace', () => { e.item = x.id; e.params = {}; e.materials = {}; }, ['objects', 'openings'])]));
  return showMenu(list.map((x) => ({ id: `custom:${x.id}`, label: itemName(x, lang()), icon: CATEGORIES.find((c) => c.id === x.category)?.icon ?? 'cube' })), anchor ?? anchorFor('replaceItem'), 'context', { handlers, header: { icon: 'library', title: t('action.replaceItem') } });
}

// ───────────────────────── scenes (tabs above the view)

function addScene() {
  const p = project();
  const id = newId('sn');
  change('op.addScene', (pr) => {
    pr.scenes.push({ id, name: t('scenes.defaultName', { n: pr.scenes.length + 1 }), camera: viewport.cameraState(), style: { ...pr.style }, tags: Object.fromEntries(pr.tags.map((tag) => [tag.id, tag.visible !== false])), plan: state.planView });
    pr.activeScene = id;
  }, ['scenes']);
  void p;
}

function goScene(id) {
  const p = project();
  const sc = p.scenes.find((s) => s.id === id);
  if (!sc) return;
  p.activeScene = id;
  if (sc.plan !== state.planView) setPlanView(Boolean(sc.plan));
  if (sc.style) Object.assign(p.style, sc.style);
  if (sc.tags) for (const tag of p.tags) if (tag.id in sc.tags) tag.visible = sc.tags[tag.id];
  applyProjectView();
  syncScene();
  viewport.setCameraState(sc.camera, { animate: true });
  renderTabs();
  renderRight();
}

function sceneStep(dir) {
  const p = project();
  const i = p.scenes.findIndex((s) => s.id === p.activeScene);
  goScene(p.scenes[(i + dir + p.scenes.length) % p.scenes.length].id);
}

// ───────────────────────── menus

const SUBMENUS = {
  exportTo: { icon: 'exportFile', items: ['exportImage', 'renderPhoto', 'exportPlan', '-', 'exportGlb', 'exportGltf', 'exportObj', 'exportStl', 'exportPly', 'exportUsdz', '-', 'exportSelection'] },
  views: { icon: 'views', items: VIEWS.map((v) => `view:${v}`) },
  faceStyle: { icon: 'styleTextured', items: STYLE_MODES.map((m) => `style:${m}`) },
  quality: { icon: 'quality', items: ['quality:fast', 'quality:balanced', 'quality:high'] },
  show: { icon: 'eye', items: ['rulers', 'scaleBar', 'grid', 'axes', 'edges', 'shadows', 'lightsOn', 'fps', '-', 'leftPanel', 'rightPanel', 'bottomPanel', 'statusBar'] },
  appearance: { icon: 'palette', items: ['theme', 'themeMenu', 'language', '-', 'shuffleBackground', 'backgroundImage', 'clearBackground'] },
  drawShapes: { icon: 'rectTool', items: ['tool:line', 'tool:rectangle', 'tool:circle', 'tool:arc', 'tool:polygon', 'tool:freehand'] },
  modify: { icon: 'pushPull', items: ['tool:pushpull', 'tool:move', 'tool:rotate', 'tool:scale', 'tool:offset', 'tool:followme'] },
  solids: { icon: 'solidUnion', items: ['solidUnion', 'solidSubtract', 'solidIntersect', '-', 'intersectFaces', 'softenEdges'] },
  construct: { icon: 'tapeMeasure', items: ['tool:tape', 'tool:dimension', 'tool:protractor', 'tool:text', 'tool:axes', '-', 'deleteGuides'] },
  section: { icon: 'sectionPlane', items: ['tool:section', 'toggleSections', 'clearSections'] },
  scenes: { icon: 'scene', items: ['addScene', 'prevScene', 'nextScene'] },
  levels: { icon: 'level', items: ['levelView:all', 'levelView:active', 'levelView:below', '-', 'levelUp', 'levelDown', 'addLevel'] },
  transform: { icon: 'rotateTool', items: ['rotate90', 'rotateMinus90', 'mirrorObject', 'dropToFloor'] },
  visibility: { icon: 'hideTool', items: ['hide', 'unhideAll', '-', 'lock', 'unlock'] },
};
const sub = (key) => ({ sub: key });
const MENUS = {
  file: ['new', 'newFromTemplate', 'open', 'startPage', 'recent', 'recentFolders', 'clearRecent', '-', 'save', 'saveAs', '-', 'importModel', sub('exportTo'), '-', 'closeProject', 'exit'],
  edit: ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'duplicate', 'delete', '-', 'selectAll', 'clearSelection', '-', sub('transform'), sub('visibility'), '-', 'makeGroup', 'explodeModel', 'deleteGuides'],
  view: [sub('views'), 'perspective', 'planView', sub('levels'), '-', sub('faceStyle'), sub('show'), sub('quality'), '-', sub('scenes'), '-', sub('appearance')],
  draw: ['tool:wall', 'tool:room', 'door', 'window', 'addLevel', '-', sub('drawShapes')],
  tools: ['tool:select', 'tool:eraser', 'tool:paint', '-', sub('modify'), sub('solids'), '-', sub('construct'), sub('section'), '-', 'checkNow', 'showProblems', 'showMessages', '-', 'renderPhoto', 'settings'],
  camera: ['tool:orbit', 'tool:pan', 'tool:zoom', 'zoomExtents', 'zoomSelection', '-', 'tool:walk', '-', sub('views'), 'perspective', 'planView', '-', 'addScene', 'prevScene', 'nextScene'],
  help: ['welcome', 'tutorial', 'tutorialDoc', 'tutorialVideo', 'userGuide', 'shortcuts', '-', 'settings', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', view: 'eye', draw: 'wallTool', tools: 'tools', camera: 'orbitTool', help: 'question' };

const TOOLBAR = [
  ['new', 'open', 'save', 'exportSplit', 'importModel'],
  ['undo', 'redo'],
  ['tool:select', 'tool:eraser', 'tool:paint'],
  ['tool:wall', 'tool:room', 'door', 'window'],
  ['tool:move', 'tool:rotate', 'tool:pushpull', 'tool:tape'],
  ['tool:orbit', 'tool:pan', 'zoomExtents', 'viewsSplit', 'planView', 'rulers', 'scaleBar'],
  ['styleSplit', 'shadows', 'lightsOn'],
  ['renderPhoto'],
  ['leftPanel', 'bottomPanel', 'rightPanel'],
];
const TOOLBAR_RIGHT = ['tutorial', 'themeSplit', 'language', 'settings', 'about'];
const LABELED = new Set(['tool:wall', 'tool:room', 'door', 'window', 'planView', 'renderPhoto']);

// ───────────────────────── shell

function renderShell() {
  root.innerHTML = `
    <div class="app-bg" aria-hidden="true"><canvas class="anim-bg"></canvas><div class="image-bg"></div></div>
    <nav id="menubar" role="menubar"></nav>
    <div id="toolbar" role="toolbar"></div>
    <main id="workspace">
      <aside id="left-panel" class="side-panel" aria-label="${escapeHtml(t('panel.library'))}"></aside>
      <div class="splitter vertical panel-split" data-split="left" role="separator" aria-orientation="vertical"></div>
      <section id="center">
        <div id="tabs"></div>
        <div id="center-body">
          <div id="palette-host"></div>
          <div id="view-host" class="view-host"></div>
          <div id="start-page" hidden></div>
          <div class="drop-overlay" aria-hidden="true"><div>${icon('drop')}<span></span></div></div>
        </div>
        <div class="splitter horizontal bottom-split" data-split="bottom" title="${escapeHtml(t('bottom.splitter'))}" role="separator" aria-orientation="horizontal"></div>
        <section id="bottom-panel" aria-label="${escapeHtml(t('bottom.title'))}"></section>
      </section>
      <div class="splitter vertical panel-split" data-split="right" role="separator" aria-orientation="vertical"></div>
      <aside id="right-panel" class="side-panel" aria-label="${escapeHtml(t('panel.outliner'))}"></aside>
    </main>
    <footer id="statusbar" role="status"></footer>
    ${desktop ? `<div class="resize-grip" data-resize-grip title="${escapeHtml(t('tip.resize'))}" role="separator">${icon('grip')}</div>` : `<div class="resize-grip static" aria-hidden="true">${icon('grip')}</div>`}
    <div id="tutorial-layer"></div>`;
}

function renderMenubar() {
  const menubar = root.querySelector('#menubar');
  const onStart = state.showStart || !state.doc;
  const home = `<button class="menubar-item menubar-home ${onStart ? 'current' : ''}" data-home title="${escapeHtml(t('tip.home'))}" aria-pressed="${onStart}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button><span class="menubar-sep" aria-hidden="true"></span>`;
  const brand = `<div class="app-brand" data-window-drag title="${escapeHtml(`MySketchBook v${VERSION}`)}"><img class="app-brand-icon" src="${APP_ICON}" alt="" data-window-drag /><span class="app-brand-name" data-window-drag>MySketchBook</span><span class="app-brand-version" data-window-drag>v${escapeHtml(VERSION)}</span></div>`;
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
  for (const type of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(type, () => mark('mysketchbook.main.input'), { capture: true, passive: true });
  window.addEventListener('focus', () => mark('mysketchbook.main.focus'));
}

let toolbarLanguage = null;
function renderToolbar() {
  const toolbar = root.querySelector('#toolbar');
  toolbarLanguage = getLanguage();
  const plain = (id, extra = '') => {
    const c = commands[id];
    const glyph = id === 'language' ? switchFlag(getLanguage()) : icon(c.icon);
    const labeled = LABELED.has(id);
    return `<button class="tool-button ${labeled ? 'tool-labeled' : ''} ${extra}" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(c.label))}">${glyph}${labeled ? `<span>${escapeHtml(t(c.label))}</span>` : ''}</button>`;
  };
  const split = (main, arrow, label) => `<span class="split-button">${plain(main)}<button class="tool-button split-arrow" data-command="${arrow}" title="${escapeHtml(commandTip(arrow))}" aria-label="${escapeHtml(t(label))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
  const button = (id) => {
    if (id === 'exportSplit') return split('exportImage', 'exportMenu', 'action.exportMenu');
    if (id === 'themeSplit') return split('theme', 'themeMenu', 'action.themeChoose');
    if (id === 'viewsSplit') return split('view:iso', 'viewsMenu', 'action.viewsMenu');
    if (id === 'styleSplit') return split('styleCycle', 'styleMenu', 'action.styleMenu');
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

function renderToolbarState() {
  for (const el of root.querySelectorAll('#toolbar [data-command], #palette-host [data-command]')) {
    const id = el.dataset.command;
    el.disabled = !commandEnabled(id);
    const checked = commands[id]?.checked?.();
    el.classList.toggle('active', Boolean(checked));
    if (checked !== undefined) el.setAttribute('aria-pressed', String(Boolean(checked)));
  }
  const styleBtn = root.querySelector('#toolbar [data-command="styleCycle"]');
  if (styleBtn && project()) styleBtn.innerHTML = icon(commands[`style:${project().style.mode}`]?.icon ?? 'styleTextured');
}

function updateMinimumWidth() {
  const left = root.querySelector('.toolbar-left');
  const right = root.querySelector('.toolbar-right');
  if (!left || !right) return;
  requestAnimationFrame(() => {
    const toolbar = root.querySelector('#toolbar');
    const style = getComputedStyle(toolbar);
    const menus = [...root.querySelectorAll('.app-brand, .menubar-item, .window-controls')].reduce((sum, el) => sum + el.offsetWidth + 2, 48);
    const width = Math.ceil(Math.max(menus, left.scrollWidth + right.scrollWidth + 24 + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2));
    if (Math.abs(width - state.minWidth) < 1) return;
    state.minWidth = width;
    document.documentElement.style.setProperty('--min-width', `${width}px`);
    native.setMinimumSize(width, 640).catch(() => {});
  });
}

/** Scene tabs (SketchUp's scene tabs) with + to add the current view. */
function renderTabs() {
  renderTitleProject();
  const tabs = root.querySelector('#tabs');
  const p = state.showStart ? null : project();
  if (!p) { tabs.innerHTML = ''; return; }
  const level = levelOf(p, p.activeLevel);
  tabs.innerHTML = `<div class="tab-strip">${p.scenes.map((sc) => `<button class="tab ${p.activeScene === sc.id ? 'active' : ''}" data-scene-tab="${escapeHtml(sc.id)}" title="${escapeHtml(t('scenes.go'))}">${icon('scene')}<span>${escapeHtml(sc.name)}</span></button>`).join('')}
      <button class="tab-add" data-command="addScene" title="${escapeHtml(commandTip('addScene'))}">${icon('sceneAdd')}<span>${escapeHtml(p.scenes.length ? '' : t('action.addScene'))}</span></button></div>
    <span class="grow"></span>
    <div class="tabs-right">
      <button class="level-chip" data-level-menu title="${escapeHtml(t('levels.choose'))}">${icon('level')}<span>${escapeHtml(level.name)}</span><small>${escapeHtml(t(`levels.view.${p.levelView ?? 'all'}`))}</small>${icon('chevronDown', 'icon tiny')}</button>
      <span class="seg-toggle" role="group"><button class="${state.planView ? '' : 'active'}" data-plan="3d" title="${escapeHtml(t('view.3d'))}">${icon('view3d')}<span>3D</span></button><button class="${state.planView ? 'active' : ''}" data-plan="2d" title="${escapeHtml(commandTip('planView'))}">${icon('plan2d')}<span>2D</span></button></span>
    </div>`;
}

function renderPalette() {
  const host = root.querySelector('#palette-host');
  if (!host) return;
  host.hidden = state.showStart || !state.doc;
  host.innerHTML = state.showStart || !state.doc ? '' : paletteHtml(panelApi, true);
  renderToolbarState();
}

// ───────────────────────── left panel (library · materials)

const LEFT_TABS = [['library', 'library'], ['materials', 'materialsPanel']];

function renderLeft() {
  const panel = root.querySelector('#left-panel');
  if (!panel) return;
  if (!state.settings.showLeftPanel) {
    panel.innerHTML = `<div class="panel-rail"><button class="rail-button expand" data-command="leftPanel" title="${escapeHtml(t('panel.expandLeft'))}">${icon('chevronRight')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button>
      <div class="rail-title">${icon('library')}<span>${escapeHtml(t('panel.libraryShort'))}</span></div></div>`;
    return;
  }
  const scroll = panel.querySelector('.panel-body')?.scrollTop ?? 0;
  const body = state.leftTab === 'materials' ? materialsHtml(panelApi) : libraryHtml(panelApi);
  panel.innerHTML = `<div class="panel-header">${icon(state.leftTab === 'materials' ? 'materialsPanel' : 'library')}<span>${escapeHtml(t(`panel.${state.leftTab}`))}</span>
      <button class="icon-button" data-command="leftPanel" title="${escapeHtml(t('panel.collapseLeft'))}">${icon('chevronLeft')}</button></div>
    <div class="editor-tabs" role="tablist">${LEFT_TABS.map(([id, glyph]) => `<button class="editor-tab ${state.leftTab === id ? 'active' : ''}" data-left-tab="${id}" role="tab">${icon(glyph)}<span>${escapeHtml(t(`panel.${id}`))}</span></button>`).join('')}</div>
    <div class="panel-body ${state.leftTab}">${body}</div>`;
  panel.querySelector('.panel-body').scrollTop = scroll;
  observeThumbnails(panel);
}

function showLibrary(category = null) {
  state.leftTab = 'library';
  if (category) state.libraryCategory = category;
  if (!state.settings.showLeftPanel) updateSettings({ showLeftPanel: true }); else renderLeft();
}

let thumbObserver = null;
function observeThumbnails(panel) {
  thumbObserver?.disconnect();
  cancelThumbnails();
  thumbObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      thumbObserver.unobserve(entry.target);
      const el = entry.target;
      if (el.dataset.thumb) {
        const item = catalogItem(el.dataset.thumb);
        if (!item || item.kind !== 'parametric') continue;
        const url = itemThumbnail(item, () => item.build(itemParams(item, {}), { material: getMaterial, quality: 'high', wallThickness: 0.2, THREE }), (u) => { if (u) el.outerHTML = `<img src="${u}" alt="" />`; });
        if (url) el.outerHTML = `<img src="${url}" alt="" />`;
      } else if (el.dataset.matThumb) {
        const url = materialThumbnail(el.dataset.matThumb, (u) => { if (u) el.outerHTML = `<img src="${u}" alt="" />`; });
        if (url) el.outerHTML = `<img src="${url}" alt="" />`;
      }
    }
  }, { root: panel.querySelector('.panel-body'), rootMargin: '120px' });
  for (const el of panel.querySelectorAll('[data-thumb], [data-mat-thumb]')) thumbObserver.observe(el);
}

function thumbnailOf(item) {
  if (item.thumb) return item.thumb;
  if (item.kind === 'parametric') return cachedThumbnail(item) || null;
  return null;
}

// ───────────────────────── right panel (outliner + editors)

const RIGHT_TABS = [['entity', 'entityInfo'], ['styles', 'styleTextured'], ['shadows', 'sun'], ['tags', 'tagsPanel'], ['scenes', 'scene'], ['levels', 'level']];

function renderRight() {
  const panel = root.querySelector('#right-panel');
  if (!panel) return;
  if (!state.settings.showRightPanel) {
    panel.innerHTML = `<div class="panel-rail"><button class="rail-button expand" data-command="rightPanel" title="${escapeHtml(t('panel.expandRight'))}">${icon('chevronLeft')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button>
      <div class="rail-title">${icon('outliner')}<span>${escapeHtml(t('panel.outlinerShort'))}</span></div></div>`;
    return;
  }
  const focused = document.activeElement;
  if (focused && panel.contains(focused) && focused.matches('input[type="text"], textarea, input[type="search"]')) {
    clearTimeout(renderRight.timer);
    renderRight.timer = setTimeout(() => { if (!panel.contains(document.activeElement)) renderRight(); }, 400);
    return;
  }
  if (!panel.querySelector('#outliner')) {
    panel.innerHTML = `<div class="panel-header">${icon('outliner')}<span>${escapeHtml(t('panel.outliner'))}</span>
        <label class="search-box mini">${icon('search')}<input id="outliner-search" type="search" value="${escapeHtml(state.outlinerQuery)}" placeholder="${escapeHtml(t('outliner.search'))}" /></label>
        <button class="icon-button" data-command="rightPanel" title="${escapeHtml(t('panel.collapseRight'))}">${icon('chevronRight')}</button></div>
      <div id="outliner" class="explorer"></div>
      <div class="splitter horizontal" data-split="explorer" role="separator" aria-orientation="horizontal"></div>
      <div id="editor-tabs" class="editor-tabs" role="tablist"></div>
      <div id="editors" class="editors"></div>`;
    bindExplorerSplitter(panel.querySelector('[data-split="explorer"]'));
  }
  panel.style.setProperty('--explorer-height', `${state.settings.explorerHeight}%`);
  const ol = panel.querySelector('#outliner');
  const olScroll = ol.scrollTop;
  ol.innerHTML = state.showStart ? '' : outlinerHtml(panelApi);
  ol.scrollTop = olScroll;
  panel.querySelector('#editor-tabs').innerHTML = RIGHT_TABS.map(([id, glyph]) => `<button class="editor-tab ${state.rightTab === id ? 'active' : ''}" data-editor-tab="${id}" role="tab" title="${escapeHtml(t(`editors.${id}`))}">${icon(glyph)}<span>${escapeHtml(t(`editors.${id}`))}</span></button>`).join('');
  const host = panel.querySelector('#editors');
  const scroll = host.scrollTop;
  let html = '';
  if (!project() || state.showStart) html = `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('editors.noProject'))}</span></p>`;
  else if (state.rightTab === 'styles') html = stylesHtml(panelApi);
  else if (state.rightTab === 'shadows') html = shadowsHtml(panelApi);
  else if (state.rightTab === 'tags') html = tagsHtml(panelApi);
  else if (state.rightTab === 'scenes') html = scenesHtml(panelApi);
  else if (state.rightTab === 'levels') html = levelsHtml(panelApi);
  else html = entityInfoHtml(panelApi);
  host.innerHTML = `<div class="editor-body">${html}</div>`;
  host.scrollTop = scroll;
  for (const el of host.querySelectorAll('[data-mat-thumb]')) { const url = materialThumbnail(el.dataset.matThumb, (u) => { if (u) el.outerHTML = `<img src="${u}" alt="" />`; }); if (url) el.outerHTML = `<img src="${url}" alt="" />`; }
}

function bindExplorerSplitter(splitter) {
  splitter.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const panel = root.querySelector('#right-panel');
    const rect = panel.getBoundingClientRect();
    pointerDrag(event, {
      cursor: 'row-resize',
      move: (dx, dy, e) => { const pct = Math.max(15, Math.min(80, ((e.clientY - rect.top) / rect.height) * 100)); panel.style.setProperty('--explorer-height', `${pct}%`); state.settings.explorerHeight = Math.round(pct); },
      end: (e, moved) => { if (moved) updateSettings({ explorerHeight: state.settings.explorerHeight }, { quiet: true }); },
    });
  });
}

/** Edits from the Entity Info panel (data-prop="field"). */
function setProp(field, raw, input) {
  const p = project();
  if (!p) return;
  const u = units();
  const len = (text) => { const v = parseLength(text, u); return Array.isArray(v) ? v[0] : v; };
  if (field.startsWith('project.')) { const k = field.slice(8); change('op.edit', () => { p[k] = raw; }, []); if (k === 'units') { dimsKey = ''; renderAll(); } return; }
  if (field.startsWith('settings.')) { const k = field.slice(9); updateSettings({ [k]: input.type === 'checkbox' ? input.checked : raw }); if (k === 'shadows') applyProjectView(); return; }
  if (field.startsWith('style.')) {
    const k = field.slice(6);
    const value = input.type === 'checkbox' ? input.checked : k === 'exposure' ? Number(raw) : raw;
    setStyle({ [k]: value });
    return;
  }
  if (field.startsWith('sun.')) {
    const k = field.slice(4);
    const sun = { ...p.sun };
    if (k === 'minutes') { const m = Number(raw); sun.time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
    else if (k === 'day') { const d = new Date(2026, 0, Number(raw)); sun.date = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
    else if (k === 'place') { const place = PLACES.find((x) => x[0] === raw); if (!place) return; [, , , sun.latitude, sun.longitude, sun.utcOffset] = place; }
    else sun[k] = Number(raw);
    p.sun = sun;
    doc().revision += 1;
    viewport.setSun(sun, { enabled: state.settings.shadows !== false });
    if (k === 'minutes' || k === 'day') { const out = input.parentElement.querySelector('output'); if (out) out.textContent = k === 'minutes' ? sun.time : sun.date.replace('-', '/'); return; }
    renderRight();
    return;
  }
  const id = state.selection[0];
  const hit = entity(id);
  if (!hit) return;
  const e = hit.entity;
  const touch = [hit.kind];
  if (field === 'name' || field === 'text') return change('op.edit', () => { e[field] = raw; }, touch);
  if (['hidden', 'locked', 'showCeiling', 'flip', 'component', 'active'].includes(field)) { change('op.edit', () => { if (input.checked) e[field] = true; else delete e[field]; }, touch); if (field === 'active') updateSections(); return undefined; }
  if (field === 'tag' || field === 'side') return change('op.edit', () => { e[field] = raw; }, touch);
  if (field === 'wall.length') {
    const v = len(raw); if (!(v > 0.05)) return notify('error', t('notice.vcbInvalid', { text: raw }));
    return change('op.edit', () => { const d = wallDir(e); const old = [...e.b]; e.b = [e.a[0] + d[0] * v, e.a[1] + d[1] * v]; for (const w of p.walls) { if (w === e) continue; if (Math.hypot(w.a[0] - old[0], w.a[1] - old[1]) < 0.01) w.a = [...e.b]; if (Math.hypot(w.b[0] - old[0], w.b[1] - old[1]) < 0.01) w.b = [...e.b]; } }, ['walls']);
  }
  if (field === 'wall.thickness') { const v = len(raw); if (v > 0.01) change('op.edit', () => { e.thickness = v; }, ['walls']); return undefined; }
  if (field === 'wall.height') { const v = len(raw); if (v > 0.1) change('op.edit', () => { e.height = v; }, ['walls']); return undefined; }
  if (field.startsWith('op.')) { const k = field.slice(3); const v = len(raw); if (v != null && v >= 0) change('op.edit', () => { e[k] = v; }, ['openings']); return undefined; }
  if (field.startsWith('pos.')) { const i = Number(field.slice(4)); const v = len(raw); if (v != null) change('op.move', () => { e.position = e.position.map((x, j) => (j === i ? v : x)); }, touch); return undefined; }
  if (field === 'rot.1') { const v = Number(raw); if (Number.isFinite(v)) change('op.rotate', () => { e.rotation = [e.rotation[0], (v * Math.PI) / 180, e.rotation[2]]; }, touch); return undefined; }
  if (field === 'scale') { const v = Number(raw); if (v > 0) change('op.scale', () => { e.scale = [Math.sign(e.scale[0]) * v, v, v]; }, touch); return undefined; }
  if (field.startsWith('param.')) {
    const key = field.slice(6);
    const item = catalogItem(e.item);
    const spec = item?.params?.find((x) => x.key === key);
    let v = raw;
    if (spec?.type === 'length') { v = len(raw); if (v == null) return undefined; v = Math.min(spec.max ?? 1e9, Math.max(spec.min ?? 0, v)); }
    else if (spec?.type === 'int' || spec?.type === 'number') { v = Number(raw); if (!Number.isFinite(v)) return undefined; v = Math.min(spec.max ?? 1e9, Math.max(spec.min ?? -1e9, spec.type === 'int' ? Math.round(v) : v)); }
    else if (spec?.type === 'bool') v = input.checked;
    return change('op.param', () => { e.params = { ...(e.params ?? {}), [key]: v }; }, touch);
  }
  return undefined;
}

/** Material chooser for a property (wall side, floor, item parameter, object part). */
async function pickMaterialFor(target, anchor) {
  const filter = target.startsWith('room.floor') ? ['floor', 'tile', 'stone', 'carpet', 'wood'] : target.startsWith('wall.') ? ['wall', 'paint', 'tile', 'stone', 'wood'] : null;
  const list = MATERIAL_PRESETS.filter((m) => m.id !== 'back-face' && (!filter || filter.includes(m.category)));
  const handlers = {};
  const items = list.map((m) => { handlers[`custom:${m.id}`] = () => applyMaterialTarget(target, m.id); return { id: `custom:${m.id}`, label: lang() === 'ko' ? m.ko : m.en, icon: 'materialsPanel', swatch: m.color }; });
  return showMenu(items, anchor, 'context', { handlers, header: { icon: 'materialsPanel', title: t('materials.choose') } });
}

function applyMaterialTarget(target, preset) {
  const e = entity(state.selection[0])?.entity;
  if (!e) return;
  const kind = entity(state.selection[0]).kind;
  change('op.paint', () => {
    if (target === 'wall.left' || target === 'wall.right') e.material = { ...(e.material ?? {}), [target.slice(5)]: preset };
    else if (target === 'room.floor') e.floor = preset;
    else if (target === 'room.ceiling') e.ceiling = preset;
    else if (target.startsWith('param.')) e.params = { ...(e.params ?? {}), [target.slice(6)]: preset };
    else if (target.startsWith('objmat.')) e.materials = { ...(e.materials ?? {}), [target.slice(7)]: preset };
  }, [kind]);
}

// ───────────────────────── bottom panel (problems, messages, information)

let problemsTimer = 0;
/** Checks the model shortly after changes (the panel and the status bar show the result). */
function scheduleProblems(delay = 400) {
  clearTimeout(problemsTimer);
  problemsTimer = setTimeout(runProblems, delay);
}

function runProblems() {
  const p = project();
  state.problems = p ? checkProject(p, catalogItem) : [];
  if (state.problemSelected && !state.problems.some((x) => x.id === state.problemSelected)) state.problemSelected = null;
  renderBottom();
  renderStatus();
}

const logLine = (e) => `[${e.at.toLocaleTimeString()}] ${e.kind.toUpperCase()} ${e.text}${e.detail ? `\n${e.detail}` : ''}`;
const SEV_ICON = { error: 'error', warning: 'warning', info: 'info', success: 'check' };

/** What a problem is about: the entity's kind and name. */
function problemTarget(pr) {
  if (!pr.entity) return { glyph: 'level', name: pr.params.level ?? '' };
  const hit = entity(pr.entity);
  if (!hit) return { glyph: 'cube', name: pr.entity };
  const e = hit.entity;
  const item = catalogItem(e.item);
  const glyph = { walls: 'wallTool', rooms: 'roomTool', openings: item?.category === 'windows' ? 'windowTool' : 'doorTool', objects: CATEGORIES.find((c) => c.id === item?.category)?.icon ?? 'cube', models: 'cube' }[hit.kind] ?? 'cube';
  return { glyph, name: e.name || (item ? itemName(item, lang()) : '') || t(`kind.${kindOf(pr.entity)}`), kind: t(`kind.${kindOf(pr.entity)}`) };
}

const problemText = (pr) => t(`check.${pr.code}`, { ...pr.params, width: pr.params.width != null ? formatLength(pr.params.width, units()) : '', length: pr.params.length != null ? formatLength(pr.params.length, units()) : '', height: pr.params.height != null ? formatLength(pr.params.height, units()) : '', other: pr.params.other ? problemTarget({ entity: pr.params.other, params: {} }).name : '' });

function renderBottom() {
  const host = root.querySelector('#bottom-panel');
  if (!host) return;
  if (!state.settings.showBottomPanel || state.showStart || !state.doc) { host.innerHTML = ''; return; }
  const counts = countBySeverity(state.problems);
  const tabs = [['problems', 'warning', t('bottom.problems'), state.problems.length], ['messages', 'info', t('bottom.messages'), state.log.length], ['info', 'entityInfo', t('bottom.info'), null]];
  const tabHtml = `<span class="segmented" role="tablist">${tabs.map(([id, glyph, label, n]) => `<button class="segment ${state.bottomTab === id ? 'active' : ''}" data-bottom-tab="${id}" role="tab" aria-selected="${state.bottomTab === id}" title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span>${n != null ? `<i class="bottom-count">${n}</i>` : ''}</button>`).join('')}</span>`;
  let tools = '';
  let body = '';
  if (state.bottomTab === 'problems') {
    const filters = [['all', t('bottom.all'), state.problems.length], ['error', t('bottom.errors'), counts.error], ['warning', t('bottom.warnings'), counts.warning], ['info', t('bottom.infos'), counts.info]];
    tools = `<span class="segmented">${filters.map(([id, label, n]) => `<button class="segment ${state.problemFilter === id ? 'active' : ''}" data-problem-filter="${id}">${id === 'all' ? '' : icon(SEV_ICON[id])}<span>${escapeHtml(label)} ${n}</span></button>`).join('')}</span>
      <span class="grow"></span><button class="small-button" data-command="checkNow" title="${escapeHtml(commandTip('checkNow'))}">${icon('validate')}<span>${escapeHtml(t('action.checkNow'))}</span></button>`;
    const list = state.problems.filter((pr) => state.problemFilter === 'all' || pr.severity === state.problemFilter);
    body = list.length ? `<div class="problem-row head"><span class="cell"></span><span class="cell">${escapeHtml(t('bottom.message'))}</span><span class="cell">${escapeHtml(t('bottom.target'))}</span><span class="cell">${escapeHtml(t('bottom.kind'))}</span></div>` + list.map((pr) => {
      const tg = problemTarget(pr);
      return `<div class="problem-row bottom-row ${pr.severity} ${state.problemSelected === pr.id ? 'selected' : ''}" data-problem="${escapeHtml(pr.id)}" title="${escapeHtml(problemText(pr))}"><span class="cell sev">${icon(SEV_ICON[pr.severity])}</span><span class="cell">${escapeHtml(problemText(pr))}</span><span class="cell el">${icon(tg.glyph)}<b>${escapeHtml(tg.name)}</b></span><span class="cell muted">${escapeHtml(tg.kind ?? '')}</span></div>`;
    }).join('') : `<p class="problems-empty">${icon('check')}<span>${escapeHtml(t(state.problems.length ? 'bottom.noneFiltered' : 'bottom.none'))}</span></p>`;
  } else if (state.bottomTab === 'messages') {
    tools = `<span class="grow"></span><button class="small-button" data-command="copyMessages" ${state.log.length ? '' : 'disabled'}>${icon('copy')}<span>${escapeHtml(t('action.copyMessages'))}</span></button><button class="small-button danger" data-command="clearMessages" ${state.log.length ? '' : 'disabled'}>${icon('clearHistory')}<span>${escapeHtml(t('action.clearMessages'))}</span></button>`;
    body = state.log.length ? state.log.map((e, i) => `<div class="problem-row bottom-row log-row ${e.kind === 'error' ? 'error' : e.kind === 'info' ? '' : e.kind}" data-log="${i}" title="${escapeHtml(e.detail || e.text)}"><span class="cell sev">${icon(SEV_ICON[e.kind] ?? 'info')}</span><span class="cell">${escapeHtml(e.text)}</span><span class="cell muted">${escapeHtml(e.detail.split('\n')[0] ?? '')}</span><span class="cell muted">${escapeHtml(e.at.toLocaleTimeString())}</span></div>`).join('') : `<p class="problems-empty">${icon('info')}<span>${escapeHtml(t('bottom.noMessages'))}</span></p>`;
  } else {
    const p = project();
    const u = units();
    const level = levelOf(p, p.activeLevel);
    const area = p.rooms.reduce((sum, r) => sum + polygonArea(r.points), 0);
    const stats = state.stats;
    const rows = [
      ['level', t('bottom.infoLevel'), `${level.name} · ${formatLength(level.elevation, u)} · ${t('levels.height')} ${formatLength(level.height, u)}`],
      ['roomTool', t('bottom.infoArea'), `${formatArea(area, u)} (${(area / 3.3058).toFixed(1)} ${t('unit.pyeong')}) · ${p.rooms.map((r) => `${r.name} ${formatArea(polygonArea(r.points), u)}`).join(' · ')}`],
      ['furniture', t('bottom.infoContents'), t('entity.countsValue', { walls: p.walls.length, rooms: p.rooms.length, objects: p.objects.length, openings: p.openings.length }) + ` · ${t('outliner.models')} ${p.models.length} · ${t('editors.scenes')} ${p.scenes.length}`],
      ['fps', t('bottom.infoRender'), `${stats.calls} ${t('status.calls')} · ${stats.triangles.toLocaleString()} ${t('status.tris')} · ${stats.ms.toFixed(1)} ms${stats.fps ? ` · ${stats.fps} fps` : ''}`],
      ['library', t('bottom.infoAssets'), `${Object.keys(p.assets ?? {}).length} · ${(Object.values(p.assets ?? {}).reduce((n, a) => n + (a.triangles ?? 0), 0)).toLocaleString()} ${t('status.tris')}`],
    ];
    body = rows.map(([glyph, label, value]) => `<div class="problem-row bottom-row info-row"><span class="cell sev">${icon(glyph)}</span><span class="cell"><b>${escapeHtml(label)}</b></span><span class="cell info-value" title="${escapeHtml(value)}">${escapeHtml(value)}</span></div>`).join('');
  }
  const scroll = host.querySelector('.problems-list')?.scrollTop ?? 0;
  host.innerHTML = `<div class="problems-header">${tabHtml}${tools}<button class="icon-button" data-command="bottomPanel" title="${escapeHtml(t('bottom.hide'))}">${icon('close')}</button></div><div class="problems-list bottom-${state.bottomTab}" tabindex="0">${body}</div>`;
  host.querySelector('.problems-list').scrollTop = scroll;
}

/** A problem row: select its entity and bring it into view. */
function revealProblem(id) {
  const pr = state.problems.find((x) => x.id === id);
  if (!pr) return;
  state.problemSelected = id;
  if (pr.entity && entity(pr.entity)) {
    select([pr.entity]);
    const b = builder.worldBox(pr.entity);
    if (b && !b.isEmpty()) viewport.zoomExtents(b.expandByScalar(0.8));
  }
  renderBottom();
}

// ───────────────────────── status bar

function renderStatus() {
  const bar = root.querySelector('#statusbar');
  if (!bar) return;
  const s = state.settings;
  const notice = state.notice;
  const tool = state.toolObject;
  const hint = notice?.text ?? (hasDoc() && tool ? t(tool.hint?.() ?? `hint.${state.tool}`, null, t('status.ready')) : t('status.ready'));
  const items = [`<span class="status-notice ${notice?.kind ?? 'hint'}" title="${escapeHtml(hint)}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(hint)}</span></span>`];
  const p = state.showStart ? null : project();
  if (p) {
    if (state.selection.length) items.push(`<span class="status-item" title="${escapeHtml(t('status.selectedTip'))}">${icon('selectAll')}<span>${escapeHtml(t('status.selected', { count: state.selection.length }))}</span></span>`);
    items.push(`<span class="status-item pointer-pos" title="${escapeHtml(t('status.pointerTip'))}">${icon('position')}<span id="status-pointer">—</span></span>`);
    if (s.showFps) items.push(`<span class="status-item stats" title="${escapeHtml(t('status.statsTip'))}">${icon('fps')}<span id="status-stats"></span></span>`);
    const counts = countBySeverity(state.problems);
    items.push(`<button class="status-item ${counts.error ? 'error-count' : ''}" data-command="showProblems" title="${escapeHtml(t('status.problemsTip'))}">${icon(counts.error ? 'error' : counts.warning ? 'warning' : 'check')}<span>${escapeHtml(t('status.problems', counts))}</span></button>`);
    items.push(`<span class="status-item units" title="${escapeHtml(t('settings.units'))}">${icon('units')}<span>${escapeHtml(t(`unit.${p.units}`))}</span></span>`);
    items.push(`<label class="vcb" title="${escapeHtml(t('status.vcbTip'))}">${icon('measurements')}<span id="vcb-label">${escapeHtml(t(state.vcb.label))}</span><input id="vcb" type="text" autocomplete="off" spellcheck="false" value="${escapeHtml(state.vcb.value)}" /></label>`);
  }
  items.push(`<span class="status-item" title="${escapeHtml(t('status.theme', { name: themeName(s.theme, getLanguage()) }))}">${icon('palette')}<span>${escapeHtml(themeName(s.theme, getLanguage()))}</span></span>`);
  items.push(`<span class="status-item" title="${escapeHtml(t('status.language'))}">${icon('globe')}<span>${escapeHtml(t('status.language'))}</span></span>`);
  if (s.statusClock) items.push(`<span class="status-item clock" title="${escapeHtml(t('status.clock'))}">${icon('clock')}<span id="status-clock">${escapeHtml(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span></span>`);
  bar.innerHTML = items.join('');
  renderStats();
}

function renderStats() {
  const el = root.querySelector('#status-stats');
  if (!el) return;
  const st = state.stats;
  el.textContent = `${st.fps ? `${st.fps} fps · ` : ''}${st.calls} ${t('status.calls')} · ${st.triangles >= 1e6 ? `${(st.triangles / 1e6).toFixed(1)}M` : st.triangles >= 1e3 ? `${(st.triangles / 1e3).toFixed(0)}K` : st.triangles} ${t('status.tris')} · ${st.ms.toFixed(1)} ms`;
}

function renderAll() {
  root.classList.toggle('no-status', !state.settings.showStatusBar);
  root.classList.toggle('no-left', !state.settings.showLeftPanel);
  root.classList.toggle('no-right', !state.settings.showRightPanel);
  const onStart = state.showStart || !state.doc;
  // The start page needs no side panels, tool palette or bottom panel: the cards use the whole window.
  root.classList.toggle('on-start', onStart);
  root.classList.toggle('no-bottom', !state.settings.showBottomPanel);
  root.style.setProperty('--bottom-height', `${state.settings.bottomHeight}px`);
  root.style.setProperty('--left-width', `${state.settings.leftWidth}px`);
  root.style.setProperty('--right-width', `${state.settings.rightWidth}px`);
  root.style.setProperty('--zoom', String(state.settings.zoom / 100));
  renderMenubar();
  if (toolbarLanguage !== getLanguage()) renderToolbar(); else renderToolbarState();
  renderTabs();
  renderLeft();
  renderPalette();
  renderRight();
  renderBottom();
  renderStatus();
  const startHost = root.querySelector('#start-page');
  const showStart = state.showStart || !state.doc;
  startHost.hidden = !showStart;
  root.querySelector('#view-host').hidden = showStart;
  if (showStart) renderStartPage(); else { startCards?.destroy(); startCards = null; startHost.innerHTML = ''; }
  updateBackgroundState();
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
  state.showStart = show && true;
  if (!state.doc) state.showStart = true;
  if (state.tool !== 'select' && viewport) setTool('select');
  renderAll();
  if (!state.showStart) viewport?.resize();
}

async function onStartAction(target) {
  const value = target.dataset.value;
  switch (target.dataset.start) {
    case 'template': return newProjectAsk(value);
    case 'open': return openWithDialog();
    case 'import': if (!state.doc) newProject('empty'); return importModelDialog();
    case 'open-recent': return openRecent(value);
    case 'remove-recent': state.recent = removeRecent(state.recent, value); storeRecent(globalThis.localStorage, state.recent); return renderStartPage();
    case 'clear-recent': state.recent = []; storeRecent(globalThis.localStorage, []); notify('success', t('notice.recentCleared')); return renderStartPage();
    case 'open-folder': return openWithDialog(value);
    case 'remove-folder': state.recentDirs = removeRecent(state.recentDirs, value); storeRecentDirs(globalThis.localStorage, state.recentDirs); return renderStartPage();
    case 'clear-folders': state.recentDirs = []; storeRecentDirs(globalThis.localStorage, []); return renderStartPage();
    case 'sample': return openSampleAsk(value);
    case 'arrange': return startCards?.arrange();
    case 'pick-theme': return updateSettings({ theme: value });
    case 'theme-settings': return popups.open('settings', { tab: 'appearance' });
    case 'start-settings': return popups.open('settings', { tab: 'start' });
    case 'settings': return run('settings');
    case 'language': return run('language');
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

function templateMenu(anchor) {
  const handlers = Object.fromEntries(TEMPLATES.map(([id]) => [`custom:${id}`, () => newProjectAsk(id)]));
  return showMenu(TEMPLATES.map(([id, glyph]) => ({ id: `custom:${id}`, label: t(`template.${id}`), icon: glyph })), anchor ?? anchorBelow(root.querySelector('[data-menu="file"]')), 'context', { handlers, header: { icon: 'template', title: t('action.newFromTemplate') } });
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
  // The 3D view covers the window: the animated background runs only on the start page (no GPU work behind the model).
  layer.classList.toggle('animated', false);
  appBackground.stop();
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
function shuffleBackground() { const next = (startBackground ?? appBackground)?.shuffle() ?? 'aurora'; updateSettings({ animation: next, backgroundKind: 'animated' }); notify('info', t('notice.animation', { name: t(`animation.${next}`) })); }
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
  if (s.language !== getLanguage()) {
    setLanguage(s.language);
    native.setBackendLanguage(s.language);
    if (previous.language) notify('info', t('notice.language'));
    const panel = root.querySelector('#right-panel');
    if (panel) panel.innerHTML = '';
  }
  if (s.backgroundImage !== previous.backgroundImage) loadBackground();
  if (s.theme !== previous.theme && previous.theme) notify('info', t('notice.theme', { name: themeName(s.theme, getLanguage()) }));
  if (viewport) {
    viewport.applySettings();
    if (['shadows', 'theme', 'renderQuality'].some((k) => s[k] !== previous[k])) applyProjectView();
    if (s.renderQuality !== previous.renderQuality && previous.renderQuality) { builder.clearTemplates(); syncScene(); }
  }
  renderAll();
  updateMinimumWidth();
}

async function openThemePicker(anchor) {
  const element = root.querySelector('.split-button [data-command="themeMenu"]')?.closest('.split-button') ?? root.querySelector('[data-command="themeMenu"]');
  const result = await popups.open('theme', { current: state.settings.theme }, { anchor: anchor ?? anchorBelow(element) });
  if (result?.theme) updateSettings({ theme: result.theme });
}

// ───────────────────────── progress popup (long work: open, save, import, render, environment)

/**
 * Runs task(op, report) and shows the progress popup when it takes longer than `delay` ms.
 * report({ fraction, text }) updates it; a cancel in the popup sets `signal.cancelled`.
 */
async function withProgress(titleKey, name, task, { delay = 250, cancellable = false } = {}) {
  const op = `op-${newId()}`;
  let shown = false;
  let last = null;
  const signal = { cancelled: false };
  const timer = setTimeout(() => { shown = true; popups.open('progress', { title: t(titleKey), name, op, last, cancellable }).then((r) => { if (r?.cancel) signal.cancelled = true; }); }, delay);
  const unlisten = await native.listen('io-progress', (progress) => { if (progress.op !== op) return; last = progress; if (shown) popups.post('progress', { type: 'progress', ...progress }); });
  popups.on(`cancel:${op}`, () => { signal.cancelled = true; });
  try {
    return await task(op, (progress) => {
      last = { op, done: Math.round((progress.fraction ?? 0) * 1000), total: 1000, text: progress.text ?? '' };
      if (shown) popups.post('progress', { type: 'progress', ...last });
    }, signal);
  } finally {
    clearTimeout(timer);
    unlisten();
    if (shown) { popups.post('progress', { type: 'done' }); setTimeout(() => popups.close('progress'), 300); }
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

/** Reads a file (desktop path) as bytes. */
async function readBytes(path, op) {
  const b64 = await native.readBase64File(path, op);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function openPath(path, { quiet = false } = {}) {
  const name = baseName(path);
  if (isModelName(name)) { if (!state.doc) newProject('empty'); return importModelFiles([{ name, path }]); }
  if (!(await confirmReplace())) return null;
  try {
    const bytes = await withProgress('progress.open', name, (op) => readBytes(path, op));
    const { project: p, assets } = await withProgress('progress.open', name, async () => unpackProject(bytes), { delay: 150 });
    const d = new Doc(p, { path, assets });
    setDoc(d);
    rememberRecent({ path, title: p.name });
    if (!quiet) notify('success', t('notice.opened', { name }));
    return d;
  } catch (error) { showError('error.open', error, path); return null; }
}

async function openContent(name, bytes, handle = null) {
  if (isModelName(name)) { if (!state.doc) newProject('empty'); return importModelFiles([{ name, bytes }]); }
  if (!(await confirmReplace())) return null;
  try {
    const { project: p, assets } = unpackProject(bytes);
    const d = new Doc(p, { name, handle, assets });
    setDoc(d);
    rememberRecent({ path: name, title: p.name, web: true });
    notify('success', t('notice.opened', { name }));
    return d;
  } catch (error) { showError('error.open', error, name); return null; }
}

async function openWithDialog(directory = null) {
  try {
    if (desktop) {
      const paths = await native.chooseDiagramsToOpen(directory ?? state.settings.lastDirectory);
      if (!paths.length) return;
      if (paths.every((p) => isModelName(baseName(p)))) { if (!state.doc) newProject('empty'); await importModelFiles(paths.map((p) => ({ name: baseName(p), path: p }))); return; }
      await openPath(paths[0]);
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

const safeName = () => fileSafe(doc()?.path ? stripExtension(baseName(doc().path)) : project()?.name || 'project');

/** A small picture of the view for the file (shown by Windows Explorer's preview and the recent list). */
function projectThumbnail() {
  try {
    const canvas = viewport.capture(320, 200);
    const data = canvas.toDataURL('image/png').split(',')[1];
    const bin = atob(data);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}

async function saveDoc({ saveAs = false } = {}) {
  const d = doc();
  if (!d) return false;
  d.project.camera = viewport.cameraState();
  const suggested = `${safeName()}.msk`;
  try {
    const bytes = await withProgress('progress.save', suggested, async () => packProject(d.project, d.assets, projectThumbnail()), { delay: 300 });
    if (desktop) {
      let path = d.path;
      if (!path || saveAs) {
        const dir = d.path ? directoryOf(d.path) : state.settings.lastDirectory;
        path = await native.chooseSavePath(dir ? `${dir}/${suggested}` : suggested, ['msk']);
        if (!path) return false;
        path = withExtension(path, 'msk');
      }
      await withProgress('progress.save', baseName(path), (op) => native.writeBase64File(path, bytesToBase64(bytes), op));
      d.path = path; d.name = null;
      rememberRecent({ path, title: d.project.name });
    } else {
      const saved = await native.saveFileWeb(new Blob([bytes], { type: 'application/zip' }), { name: suggested, handle: d.handle, saveAs: saveAs || !d.handle, mime: 'application/zip' });
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
  state.doc = null;
  state.selection = [];
  builder?.clearTemplates();
  overlay?.reset();
  state.showStart = true;
  persistSession();
  renderAll();
  return true;
}

// ───────────────────────── import of 3D models (user objects)

function registerProjectAssets(d) {
  for (const [id, info] of Object.entries(d.project.assets ?? {})) {
    registerUserItem({ id: `user:${id}`, ko: info.name, en: info.name, size: info.size, asset: id, load: () => loadUserAsset(d, id), kind: 'user' });
  }
}

const userModelCache = new Map();
async function loadUserAsset(d, id) {
  if (userModelCache.has(id)) return userModelCache.get(id).clone(true);
  const bytes = d.assets.get(id);
  if (!bytes) throw new Error(`asset ${id} missing`);
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  userModelCache.set(id, gltf.scene);
  return gltf.scene.clone(true);
}

async function importModelDialog() {
  try {
    if (desktop) {
      const paths = await native.chooseModelFiles(state.settings.lastDirectory);
      if (paths.length) await importModelFiles(paths.map((p) => ({ name: baseName(p), path: p })));
    } else {
      const files = await native.pickWithInput('.glb,.gltf,.obj,.mtl,.fbx,.stl,.dae,.3ds,.ply,.3mf,.usdz,.usda,.wrl,.vrml,.skp,.png,.jpg,.jpeg,.bin', true);
      if (files.length) await importModelFiles(await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
    }
  } catch (error) { showError('error.import', error); }
}

/**
 * Imports model files (with companions such as .mtl, textures, .bin): asks the units / up axis, converts to
 * GLB (stored in the project), registers the object in My objects and starts placing it.
 */
async function importModelFiles(files) {
  const loader = Object.values(ioImport)[0];
  if (!loader) { notify('error', t('notice.ioMissing')); return; }
  const mainFiles = files.filter((f) => /\.(glb|gltf|obj|fbx|stl|dae|3ds|ply|3mf|usdz|usda|usd|wrl|vrml|skp)$/i.test(f.name));
  if (!mainFiles.length) { notify('error', t('notice.noModelFile')); return; }
  const options = await popups.open('importmodel', { names: mainFiles.map((f) => f.name), units: 'auto', upAxis: 'auto', optimize: true });
  if (!options?.ok) return;
  const io = await loader();
  const ex = await Object.values(ioExport)[0]?.();
  let lastId = null;
  for (const file of mainFiles) {
    try {
      const result = await withProgress('progress.import', file.name, async (op, report, signal) => {
        const bytes = file.bytes ?? await readBytes(file.path, op);
        const related = new Map();
        for (const other of files) if (other !== file) related.set(other.name, other.bytes ?? await readBytes(other.path, op));
        const imported = await io.importModel({ name: file.name, bytes, related }, { units: options.units, upAxis: options.upAxis, center: true, optimize: options.optimize, onProgress: (fraction, text) => report({ fraction: fraction * 0.8, text }) });
        if (signal.cancelled) return null;
        report({ fraction: 0.85, text: t('progress.packing') });
        const glb = ex ? await ex.exportModel(imported.object, 'glb') : null;
        return { ...imported, glb: glb?.bytes ?? null };
      }, { delay: 0, cancellable: true });
      if (!result) continue;
      if (result.warnings?.length) notify('info', result.warnings.join(' · '));
      const d = doc();
      const id = newId('as');
      const size = result.stats?.sizeMeters ?? [1, 1, 1];
      const name = stripExtension(file.name);
      if (result.glb) d.assets.set(id, result.glb);
      d.project.assets[id] = { name, ext: 'glb', size, triangles: result.stats?.triangles ?? 0, source: file.name };
      userModelCache.set(id, result.object);
      registerUserItem({ id: `user:${id}`, ko: name, en: name, size, asset: id, load: () => loadUserAsset(d, id), kind: 'user', thumb: null });
      d.revision += 1;
      lastId = `user:${id}`;
      notify('success', t('notice.imported', { name: file.name, tris: (result.stats?.triangles ?? 0).toLocaleString() }));
    } catch (error) {
      if (error?.code === 'skp-unsupported') showError('error.import', error, file.name);
      else showError('error.import', error, file.name);
    }
  }
  if (lastId) { showLibrary('mine'); startPlacing(lastId, { sticky: false }); }
}

// ───────────────────────── export

async function saveExport(name, type, bytes, mime = 'application/octet-stream') {
  if (desktop) {
    const dir = state.settings.lastDirectory;
    let path = await native.chooseSavePath(dir ? `${dir}/${name}` : name, [type]);
    if (!path) return false;
    if (!(native.SAVE_TYPES[type]?.extensions ?? [type]).includes(extensionOf(path))) path = withExtension(path, type);
    await withProgress('progress.export', baseName(path), (op) => (typeof bytes === 'string' ? native.writeTextFile(path, bytes, op) : native.writeBase64File(path, bytesToBase64(bytes), op)));
    rememberDirectory(directoryOf(path));
    notify('success', t('notice.exported', { name: baseName(path) }));
    return true;
  }
  const saved = await native.saveFileWeb(new Blob([bytes], { type: mime }), { name, saveAs: true, mime });
  if (saved) notify('success', t('notice.exported', { name: saved.name }));
  return Boolean(saved);
}

async function exportModel(format, { selection = false } = {}) {
  const loader = Object.values(ioExport)[0];
  if (!loader) { notify('error', t('notice.ioMissing')); return; }
  try {
    const io = await loader();
    const result = await withProgress('progress.export', `${safeName()}.${format}`, async () => {
      const group = new THREE.Group();
      const sources = selection ? state.selection.map((id) => builder.objectOf(id)).filter(Boolean) : [builder.root];
      for (const src of sources) {
        src.updateWorldMatrix(true, true);
        const copy = src.clone(true);
        copy.traverse((o) => { if (o.isLineSegments || o.userData.helper) o.visible = false; if (o.isMesh && o.userData.baseMaterial) o.material = o.userData.baseMaterial; });
        copy.matrix.copy(src.matrixWorld);
        copy.matrix.decompose(copy.position, copy.quaternion, copy.scale);
        group.add(copy);
      }
      // Strip invisible / helper parts so the file holds only the model.
      // Collect first, then remove (removing while traversing skips and breaks the walk).
      const drop = [];
      group.traverse((o) => { if (!o.visible || o.isLine || o.isLineSegments || o.isPoints || o.userData.helper || o.userData.placeholder) drop.push(o); });
      for (const o of drop) o.parent?.remove(o);
      // Exporters want standard materials with real colours (styled clones, shader or line materials are replaced).
      group.traverse((o) => {
        if (!o.isMesh) return;
        // Texture slots whose picture has not arrived yet (lazy library textures) would break the exporters: left out.
        const MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularIntensityMap', 'specularColorMap', 'iridescenceMap', 'iridescenceThicknessMap', 'anisotropyMap', 'lightMap', 'displacementMap'];
        const ready = (tex) => tex?.isTexture && tex.image && (tex.image.width || tex.image.data || tex.image.length);
        const fix = (m) => {
          let out = m && m.color?.isColor && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.isMeshBasicMaterial) ? m : new THREE.MeshStandardMaterial({ color: m?.color?.isColor ? m.color : 0xcccccc, map: m?.map ?? null });
          if (MAPS.some((k) => out[k] && !ready(out[k]))) { out = out.clone(); for (const k of MAPS) if (out[k] && !ready(out[k])) out[k] = null; }
          return out;
        };
        o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
      });
      return io.exportModel(group, format, { binary: true, mtl: format === 'obj' });
    }, { delay: 200 });
    await saveExport(`${safeName()}.${result.ext ?? format}`, format, result.bytes, result.mime);
  } catch (error) { showError('error.export', error, format); }
}

async function canvasToBytes(canvas, type = 'image/png', quality = 0.92) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  return new Uint8Array(await blob.arrayBuffer());
}

/** The current view as a picture at a chosen size (popup 'snapshot': size, format, transparent). */
async function exportImage() {
  const result = await popups.open('snapshot', { width: state.settings.renderWidth, height: state.settings.renderHeight, format: 'png', transparent: false });
  if (!result?.ok) return;
  updateSettings({ renderWidth: result.width, renderHeight: result.height }, { quiet: true });
  try {
    const bytes = await withProgress('progress.image', `${result.width} × ${result.height}`, async (op, report) => {
      report({ fraction: 0.2, text: t('progress.rendering') });
      await new Promise((r) => setTimeout(r, 30));
      const canvas = viewport.capture(result.width, result.height, { transparent: result.transparent });
      report({ fraction: 0.8, text: t('progress.encoding') });
      return canvasToBytes(canvas, result.format === 'jpg' ? 'image/jpeg' : result.format === 'webp' ? 'image/webp' : 'image/png');
    }, { delay: 150 });
    await saveExport(`${safeName()}.${result.format}`, result.format, bytes, `image/${result.format === 'jpg' ? 'jpeg' : result.format}`);
  } catch (error) { showError('error.export', error); }
}

async function exportPlanImage() {
  const was = state.planView;
  if (!was) setPlanView(true);
  const mode = project().style.mode;
  setStyle({ mode: 'hiddenline' });
  viewport.zoomExtents();
  await new Promise((r) => setTimeout(r, 400));
  try {
    const canvas = viewport.capture(3000, 2000);
    const bytes = await canvasToBytes(canvas);
    await saveExport(`${safeName()} - plan.png`, 'png', bytes, 'image/png');
  } catch (error) { showError('error.export', error); }
  setStyle({ mode });
  if (!was) setPlanView(false);
}

/**
 * Photo-real rendering: path tracing (three-gpu-pathtracer) at the chosen size and sample count,
 * in its own progress popup with a live sample counter and Cancel; the result can be saved.
 */
async function renderPhoto() {
  const options = await popups.open('render', { width: state.settings.renderWidth, height: state.settings.renderHeight, samples: state.settings.renderSamples });
  if (!options?.ok) return;
  updateSettings({ renderWidth: options.width, renderHeight: options.height, renderSamples: options.samples }, { quiet: true });
  try {
    const { renderPathTraced } = await import('./engine/photo.js');
    const canvas = await withProgress('progress.render', `${options.width} × ${options.height} · ${options.samples} spp`, (op, report, signal) => renderPathTraced(viewport, { width: options.width, height: options.height, samples: options.samples, signal, onProgress: (done, total, eta) => report({ fraction: done / total, text: t('progress.samples', { done, total, eta: Math.ceil(eta) }) }) }), { delay: 0, cancellable: true });
    if (!canvas) return;
    const bytes = await canvasToBytes(canvas);
    const choice = await popups.open('renderresult', { image: canvas.toDataURL('image/jpeg', 0.85), width: options.width, height: options.height });
    if (choice?.save) await saveExport(`${safeName()} - render.png`, 'png', bytes, 'image/png');
  } catch (error) { showError('error.render', error); }
}

// ───────────────────────── confirmation & exit

async function ask(params) { const result = await popups.open('confirm', params); return result?.choice ?? 'cancel'; }
async function requestExit() { if (desktop) return appWindow.close(); return undefined; }
async function confirmExit() {
  if (!doc()?.dirty) return true;
  const choice = await ask({ kind: 'exit', icon: 'save', title: t('confirm.exitTitle'), message: t('confirm.exitMessage'), items: [docName()], buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }] });
  if (choice === 'save') return saveDoc();
  return choice === 'discard';
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
    const dynamic = state.dynamicMenus.get(key);
    if (dynamic) Object.assign(handlers, dynamic.handlers);
    const children = dynamic ? dynamic.items : SUBMENUS[key] ? menuItems(SUBMENUS[key].items) : null;
    return children ? { ...item, children: withChildren(children, handlers, depth + 1) } : item;
  });
}

async function showMenu(items, anchor, name = 'context', context = {}) {
  state.openMenu = name;
  renderMenubar();
  const header = context.header ?? (MENUS[name] ? { icon: MENU_ICONS[name], title: t(`menu.${name}`) } : { icon: 'cube', title: 'MySketchBook' });
  context = { ...context, handlers: { ...context.handlers } };
  items = withChildren(items, context.handlers);
  const result = await popups.open('menu', { items, name, header }, { anchor });
  if (state.openMenu === name) { state.openMenu = null; state.lastMenuClose = { name, at: Date.now() }; renderMenubar(); }
  const id = result?.id;
  if (!id) return undefined;
  if (id.startsWith('submenu:')) {
    const key = id.slice('submenu:'.length);
    const at = result.at ?? anchor;
    const where = { x: at.x, y: at.y, flipY: at.flipY ?? at.y };
    return showMenu(menuItems(SUBMENUS[key].items), where, name, { ...context, header: { icon: SUBMENUS[key].icon, title: t(`submenu.${key}`) } });
  }
  if (id.startsWith('custom:')) return context.handlers?.[id]?.();
  return run(id, context);
}

function openMenubarMenu(name) { const el = root.querySelector(`[data-menu="${name}"]`); if (el) showMenu(menuItems(MENUS[name]), anchorBelow(el), name); }

function contextMenu(event, kind, payload = {}) {
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  if (kind === 'entity') {
    const id = payload.hit?.entity?.id;
    const k = kindOf(id);
    const e = entity(id)?.entity;
    const title = k === 'object' ? (e?.name || itemName(catalogItem(e?.item), lang())) : t(`kind.${k}`);
    const extra = k === 'object' ? ['rotate90', 'rotateMinus90', 'mirrorObject', 'dropToFloor', 'replaceItem', 'resetMaterials'] : k === 'wall' ? ['splitWall', 'flipWall'] : k === 'model' ? ['editModel', 'explodeModel', sub('solids')] : k === 'opening' ? ['replaceItem'] : [];
    return showMenu(menuItems(['cut', 'copy', 'duplicate', 'delete', '-', ...extra, ...(extra.length ? ['-'] : []), 'tool:move', 'tool:rotate', 'tool:scale', '-', 'hide', 'lock', 'unlock', '-', 'zoomSelection']), anchor, 'context', { header: { icon: 'cube', title } });
  }
  if (kind === 'canvas') return showMenu(menuItems(['paste', 'selectAll', '-', 'zoomExtents', sub('views'), 'perspective', 'planView', '-', sub('faceStyle'), sub('show'), '-', 'addScene', 'exportImage', 'renderPhoto']), anchor, 'context', { header: { icon: 'view3d', title: project()?.name || 'MySketchBook' } });
  if (kind === 'problem') {
    const pr = state.problems.find((x) => x.id === payload.id);
    const handlers = {
      'custom:reveal': () => revealProblem(payload.id),
      'custom:copy': () => native.clipboardWrite(problemText(pr)).then(() => notify('success', t('notice.copiedText'))),
      'custom:delete': () => { select([pr.entity]); run('delete'); },
    };
    const hasEntity = Boolean(pr?.entity && entity(pr.entity));
    return showMenu([
      { id: 'custom:reveal', label: t('bottom.reveal'), icon: 'zoomSelection', disabled: !hasEntity },
      { id: 'custom:copy', label: t('bottom.copy'), icon: 'copy', disabled: !pr },
      { separator: true },
      { id: 'custom:delete', label: t('bottom.deleteTarget'), icon: 'trash', disabled: !hasEntity || isLocked(pr.entity) },
      { separator: true }, ...menuItems(['checkNow', 'bottomPanel']),
    ], anchor, 'context', { handlers, header: { icon: 'warning', title: t('bottom.problems') } });
  }
  if (kind === 'log') {
    const e = state.log[payload.index];
    const handlers = { 'custom:copy': () => native.clipboardWrite(logLine(e)).then(() => notify('success', t('notice.copiedText'))) };
    return showMenu([{ id: 'custom:copy', label: t('bottom.copy'), icon: 'copy', disabled: !e }, { separator: true }, ...menuItems(['copyMessages', 'clearMessages', '-', 'bottomPanel'])], anchor, 'context', { handlers, header: { icon: 'info', title: t('bottom.messages') } });
  }
  if (kind === 'bottom') return showMenu(menuItems(['showProblems', 'showMessages', 'checkNow', '-', 'copyMessages', 'clearMessages', '-', 'bottomPanel']), anchor, 'context', { header: { icon: 'panelBottom', title: t('bottom.title') } });
  if (kind === 'libraryCard') {
    const item = catalogItem(payload.id);
    const handlers = { 'custom:place': () => startPlacing(payload.id), 'custom:replace': () => change('op.replace', (p) => { for (const o of p.objects) if (isSelected(o.id)) { o.item = payload.id; o.params = {}; o.materials = {}; } }, ['objects']) };
    const canReplace = state.selection.some((id) => kindOf(id) === 'object') && item?.placement !== 'opening';
    return showMenu([
      { id: 'custom:place', label: t('library.place'), icon: 'place', disabled: !hasDoc() },
      { id: 'custom:replace', label: t('library.replaceSelected'), icon: 'library', disabled: !canReplace },
      { separator: true }, ...menuItems(['importModel', 'leftPanel']),
    ], anchor, 'context', { handlers, header: { icon: CATEGORIES.find((c) => c.id === item?.category)?.icon ?? 'cube', title: itemName(item, lang()) } });
  }
  if (kind === 'material') {
    const handlers = { 'custom:brush': () => { state.brush = payload.id; setTool('paint'); renderLeft(); }, 'custom:apply': () => { for (const id of state.selection) { const e = entity(id)?.entity; const k = kindOf(id); if (!e) continue; change('op.paint', () => { if (k === 'wall') e.material = { left: payload.id, right: payload.id, top: e.material?.top }; else if (k === 'room') e.floor = payload.id; }, ['walls', 'rooms']); } } };
    const canApply = state.selection.some((id) => ['wall', 'room'].includes(kindOf(id)));
    return showMenu([{ id: 'custom:brush', label: t('materials.useBrush'), icon: 'paintBucket', disabled: !hasDoc() }, { id: 'custom:apply', label: t('materials.applySelected'), icon: 'materialsPanel', disabled: !canApply }], anchor, 'context', { handlers, header: { icon: 'materialsPanel', title: presetName(payload.id) } });
  }
  if (kind === 'panel') return showMenu(menuItems(['leftPanel', 'rightPanel', 'bottomPanel', 'statusBar', '-', 'settings']), anchor, 'context', { header: { icon: 'panelLeft', title: t('menu.view') } });
  if (kind === 'start') return showMenu(menuItems(['new', 'open', 'recent', '-', 'shuffleBackground', 'backgroundImage', '-', 'tutorial', 'about']), anchor, 'context', { header: { icon: 'home', title: t('action.startPage') } });
  if (kind === 'status') return showMenu(menuItems(['statusBar', 'fps', '-', 'theme', 'language']), anchor, 'context', { header: { icon: 'statusBar', title: t('action.statusBar') } });
  return showMenu(menuItems(['new', 'open', 'save', '-', 'undo', 'redo', '-', 'leftPanel', 'rightPanel', 'statusBar', '-', 'settings', 'about']), anchor, 'context', { header: { icon: 'cube', title: 'MySketchBook' } });
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

async function levelMenu(anchor) {
  const p = project();
  const handlers = {};
  const items = [...p.levels].reverse().map((l) => { handlers[`custom:${l.id}`] = () => activateLevel(l.id); return { id: `custom:${l.id}`, label: `${l.name} (${formatLength(l.elevation, units())})`, icon: 'level', checked: p.activeLevel === l.id }; });
  items.push({ separator: true }, ...menuItems(['levelView:all', 'levelView:active', 'levelView:below', '-', 'addLevel']));
  return showMenu(items, anchor, 'context', { handlers, header: { icon: 'level', title: t('levels.choose') } });
}

function activateLevel(id) {
  const p = project();
  p.activeLevel = id;
  doc().revision += 1;
  syncScene();
  if (state.planView) setPlanView(true);
  renderTabs();
  renderRight();
}

// ───────────────────────── documents (help windows)

async function openDocWindow(kind) {
  const info = DOC_KINDS[kind];
  if (!info) return undefined;
  popups.hideMenu();
  const url = `${location.pathname}?viewer=${kind}&lang=${getLanguage() === 'en' ? 'en' : 'ko'}`;
  if (popups.inline) return openDocFrame(kind, url);
  if (!desktop) { globalThis.open(url, `mysketchbook-${docLabel(kind)}`)?.focus?.(); return undefined; }
  const dark = resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme).dark;
  try { await native.invoke('open_doc_window', { kind, title: docWindowTitle(t(info.title)), width: info.width, height: info.height, dark }); } catch (error) { showError('error.docWindow', error); }
  return undefined;
}
function openDocFrame(kind, url) {
  const key = docLabel(kind);
  let frame = popups.frames.get(key);
  if (!frame) { frame = document.createElement('div'); frame.className = `web-popup web-popup-doc web-popup-${key}`; frame.dataset.kind = key; frame.innerHTML = `<iframe title="${escapeHtml(key)}" src="${escapeHtml(url)}"></iframe>`; document.body.append(frame); popups.frames.set(key, frame); }
  return frame;
}
function closeDocFrames() { for (const kind of Object.keys(DOC_KINDS)) if (popups.frames.has(docLabel(kind))) popups.close(docLabel(kind)); }

// ───────────────────────── external drag & drop

async function handleDroppedPaths(paths) {
  const models = paths.filter((p) => isModelName(baseName(p)) || /\.(mtl|png|jpe?g|bin)$/i.test(p));
  const projects = paths.filter((p) => isProjectName(baseName(p)));
  if (projects.length) await openPath(projects[0]);
  if (models.some((p) => isModelName(baseName(p)))) { if (!state.doc) newProject('empty'); await importModelFiles(models.map((p) => ({ name: baseName(p), path: p }))); }
  else if (!projects.length) notify('error', t('notice.unsupportedDrop', { name: baseName(paths[0] ?? '') }));
}

async function handleDroppedFiles(files) {
  const project0 = files.find((f) => isProjectName(f.name));
  if (project0) await openContent(project0.name, new Uint8Array(await project0.arrayBuffer()));
  if (files.some((f) => isModelName(f.name))) { if (!state.doc) newProject('empty'); await importModelFiles(await Promise.all(files.filter((f) => !isProjectName(f.name)).map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })))); }
}

function setDropActive(active) {
  state.dropActive = active;
  const overlayEl = root.querySelector('.drop-overlay');
  overlayEl.classList.toggle('visible', active);
  overlayEl.querySelector('span').textContent = t('drop.hint');
}

// ───────────────────────── events

function bindEvents() {
  root.addEventListener('click', (event) => {
    const target = event.target;
    const menu = target.closest('[data-menu]');
    if (menu) { const name = menu.dataset.menu; if (state.lastMenuClose.name === name && Date.now() - state.lastMenuClose.at < 300) return undefined; return openMenubarMenu(name); }
    if (target.closest('[data-home]')) return showStartPage(!state.showStart || !state.doc);
    const start = target.closest('[data-start]');
    if (start && !start.disabled) return onStartAction(start);
    const command = target.closest('[data-command]');
    if (command && !command.disabled) {
      const id = command.dataset.command;
      const anchored = ['themeMenu', 'exportMenu', 'viewsMenu', 'styleMenu', 'recentFolders', 'quality', 'replaceItem', 'newFromTemplate'].includes(id);
      return run(id, { anchor: anchored ? anchorBelow(command.closest('.split-button') ?? command) : undefined });
    }
    const windowControl = target.closest('[data-window]');
    if (windowControl) return windowButton(windowControl.dataset.window);
    const leftTab = target.closest('[data-left-tab]');
    if (leftTab) { state.leftTab = leftTab.dataset.leftTab; return renderLeft(); }
    const libCat = target.closest('[data-lib-category]');
    if (libCat) { state.libraryCategory = libCat.dataset.libCategory; return renderLeft(); }
    if (target.closest('[data-lib-size]')) { const order = ['small', 'medium', 'large']; updateSettings({ librarySize: order[(order.indexOf(state.settings.librarySize) + 1) % 3] }, { quiet: true }); return renderLeft(); }
    const card = target.closest('[data-item]');
    if (card) { if (!hasDoc()) { notify('info', t('notice.openFirst')); return undefined; } return startPlacing(card.dataset.item); }
    const matCat = target.closest('[data-mat-category]');
    if (matCat) { state.materialCategory = matCat.dataset.matCategory; return renderLeft(); }
    const mat = target.closest('[data-material]');
    if (mat) { state.brush = mat.dataset.material; renderLeft(); if (hasDoc() && state.tool !== 'paint') setTool('paint'); return undefined; }
    if (target.closest('[data-material-new]')) return newCustomMaterial();
    const pickMat = target.closest('[data-pick-material]');
    if (pickMat) return pickMaterialFor(pickMat.dataset.pickMaterial, anchorBelow(pickMat));
    const editorTab = target.closest('[data-editor-tab]');
    if (editorTab) { state.rightTab = editorTab.dataset.editorTab; return renderRight(); }
    const olToggle = target.closest('[data-ol-toggle]');
    if (olToggle) { const k = olToggle.dataset.olToggle; if (state.outlinerCollapsed.has(k)) state.outlinerCollapsed.delete(k); else state.outlinerCollapsed.add(k); return renderRight(); }
    const olHide = target.closest('[data-ol-hide]');
    if (olHide) { const e = entity(olHide.dataset.olHide)?.entity; if (e) change(e.hidden ? 'op.unhide' : 'op.hide', () => { if (e.hidden) delete e.hidden; else e.hidden = true; }); return undefined; }
    const olSel = target.closest('[data-ol-select]');
    if (olSel) { select([olSel.dataset.olSelect], { add: event.ctrlKey || event.metaKey, toggle: event.shiftKey }); if (event.detail === 2) run('zoomSelection'); return undefined; }
    const lvl = target.closest('[data-level-activate]');
    if (lvl) return activateLevel(lvl.dataset.levelActivate);
    const lvlVis = target.closest('[data-level-visible]');
    if (lvlVis) { const l = project().levels.find((x) => x.id === lvlVis.dataset.levelVisible); change('op.edit', () => { l.visible = l.visible === false; }, ['levels']); return undefined; }
    const lvlDel = target.closest('[data-level-delete]');
    if (lvlDel) { const id = lvlDel.dataset.levelDelete; change('op.delete', (p) => { removeEntities(p, [...p.walls, ...p.rooms, ...p.objects, ...p.models].filter((e) => e.level === id).map((e) => e.id)); p.levels = p.levels.filter((l) => l.id !== id); if (p.activeLevel === id) p.activeLevel = p.levels[0].id; }); return undefined; }
    if (target.closest('[data-level-menu]')) return levelMenu(anchorBelow(target.closest('[data-level-menu]')));
    const bottomTab = target.closest('[data-bottom-tab]');
    if (bottomTab) { state.bottomTab = bottomTab.dataset.bottomTab; return renderBottom(); }
    const problemFilter = target.closest('[data-problem-filter]');
    if (problemFilter) { state.problemFilter = problemFilter.dataset.problemFilter; return renderBottom(); }
    const problemRow = target.closest('[data-problem]');
    if (problemRow) return revealProblem(problemRow.dataset.problem);
    const plan = target.closest('[data-plan]');
    if (plan) return setPlanView(plan.dataset.plan === '2d');
    const sceneTab = target.closest('[data-scene-tab]');
    if (sceneTab) return goScene(sceneTab.dataset.sceneTab);
    const sceneGo = target.closest('[data-scene-go]');
    if (sceneGo) return goScene(sceneGo.dataset.sceneGo);
    const sceneUpd = target.closest('[data-scene-update]');
    if (sceneUpd) { const sc = project().scenes.find((s) => s.id === sceneUpd.dataset.sceneUpdate); change('op.edit', () => { sc.camera = viewport.cameraState(); sc.style = { ...project().style }; sc.plan = state.planView; }, ['scenes']); return notify('success', t('scenes.updated', { name: sc.name })); }
    const sceneDel = target.closest('[data-scene-delete]');
    if (sceneDel) { change('op.delete', (p) => { p.scenes = p.scenes.filter((s) => s.id !== sceneDel.dataset.sceneDelete); }, ['scenes']); return undefined; }
    if (target.closest('[data-tag-add]')) { change('op.addTag', (p) => { p.tags.push({ id: newId('tg'), name: t('tags.defaultName', { n: p.tags.length }), visible: true, color: `hsl(${(p.tags.length * 67) % 360} 55% 55%)` }); }, ['tags']); return undefined; }
    const tagVis = target.closest('[data-tag-visible]');
    if (tagVis) { const tag = project().tags.find((x) => x.id === tagVis.dataset.tagVisible); change('op.edit', () => { tag.visible = tag.visible === false; }, ['tags']); return undefined; }
    const tagDel = target.closest('[data-tag-delete]');
    if (tagDel) { const id = tagDel.dataset.tagDelete; change('op.delete', (p) => { p.tags = p.tags.filter((x) => x.id !== id); for (const k of ['objects', 'models', 'walls']) for (const e of p[k]) if (e.tag === id) e.tag = 'untagged'; }); return undefined; }
    const paramStep = target.closest('[data-param-step]');
    if (paramStep) { const e = entity(state.selection[0])?.entity; const key = paramStep.dataset.paramStep; const item = catalogItem(e?.item); const cur = Number(itemParams(item, e.params)[key]); return setProp(`param.${key}`, String(cur + Number(paramStep.dataset.delta)), paramStep); }
    return undefined;
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target.dataset.prop) return setProp(target.dataset.prop, target.value, target);
    if (target.dataset.tagName) { const tag = project().tags.find((x) => x.id === target.dataset.tagName); return change('op.edit', () => { tag.name = target.value; }, ['tags']); }
    if (target.dataset.sceneName) { const sc = project().scenes.find((x) => x.id === target.dataset.sceneName); return change('op.edit', () => { sc.name = target.value; }, ['scenes']); }
    if (target.dataset.levelName) { const l = project().levels.find((x) => x.id === target.dataset.levelName); return change('op.edit', () => { l.name = target.value; }, ['levels']); }
    if (target.dataset.levelElevation || target.dataset.levelHeight) {
      const id = target.dataset.levelElevation ?? target.dataset.levelHeight;
      const l = project().levels.find((x) => x.id === id);
      const v = parseLength(target.value, units());
      if (v == null) return undefined;
      return change('op.edit', () => { if (target.dataset.levelElevation) l.elevation = v; else l.height = Math.max(0.5, v); }, ['levels']);
    }
    if ('startToggle' in target.dataset) return updateSettings({ showStartPage: target.checked }, { quiet: true });
    if ('startSpeed' in target.dataset) return updateSettings({ animationSpeed: Number(target.value) }, { quiet: true });
    if ('startOpacity' in target.dataset) return updateSettings({ startCardOpacity: Number(target.value) }, { quiet: true });
    if ('startRandom' in target.dataset) return updateSettings({ animationRandom: target.checked }, { quiet: true });
    if ('startInterval' in target.dataset) { startBackgroundChangedAt = Date.now(); return updateSettings({ animationInterval: Number(target.value) }, { quiet: true }); }
    return undefined;
  });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (target.id === 'library-search' || target.id === 'material-search') {
      clearTimeout(bindEvents.searchTimer);
      bindEvents.searchTimer = setTimeout(() => {
        if (target.id === 'library-search') state.libraryQuery = target.value; else state.materialQuery = target.value;
        const pos = target.selectionStart;
        renderLeft();
        const input = root.querySelector(`#${target.id}`);
        input?.focus(); input?.setSelectionRange(pos, pos);
      }, 150);
    }
    if (target.id === 'outliner-search') { state.outlinerQuery = target.value; const ol = root.querySelector('#outliner'); if (ol) ol.innerHTML = outlinerHtml(panelApi); }
    // Live sliders (sun time and date, exposure) preview while dragging.
    if (target.dataset.prop === 'sun.minutes' || target.dataset.prop === 'sun.day' || target.dataset.prop === 'style.exposure') {
      if (target.dataset.prop === 'style.exposure') { viewport.renderer.toneMappingExposure = Number(target.value); viewport.requestRender(); const out = target.parentElement.querySelector('output'); if (out) out.textContent = Number(target.value).toFixed(2); }
      else setProp(target.dataset.prop, target.value, target);
    }
    if ('startSpeed' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}%`; state.settings.animationSpeed = Number(target.value); }
    if ('startOpacity' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}%`; root.querySelector('.start-inner')?.style.setProperty('--start-card-alpha', `${target.value}%`); }
  });

  root.addEventListener('keydown', (event) => {
    if (event.target.id === 'vcb' && event.key === 'Enter') { event.preventDefault(); vcbEnter(event.target.value); event.target.value = ''; viewport?.canvas.focus(); }
    else if (event.target.id === 'vcb' && event.key === 'Escape') { event.target.value = ''; viewport?.canvas.focus(); }
    else if (event.target.matches?.('#editors input[type="text"]') && event.key === 'Enter') { event.preventDefault(); event.target.dispatchEvent(new Event('change', { bubbles: true })); event.target.blur(); }
  });

  root.addEventListener('contextmenu', (event) => {
    const editable = event.target.closest('input:not([type="range"]):not([type="checkbox"]), textarea');
    if (editable) { event.preventDefault(); return textContextMenu(editable, event); }
    if (event.defaultPrevented || event.target.closest('#view-host canvas')) return undefined;
    event.preventDefault();
    const problemRow = event.target.closest('[data-problem]');
    if (problemRow) return contextMenu(event, 'problem', { id: problemRow.dataset.problem });
    const logRow = event.target.closest('[data-log]');
    if (logRow) return contextMenu(event, 'log', { index: Number(logRow.dataset.log) });
    if (event.target.closest('#bottom-panel')) return contextMenu(event, 'bottom');
    const olRow = event.target.closest('[data-ol-select]');
    if (olRow) { if (!isSelected(olRow.dataset.olSelect)) select([olRow.dataset.olSelect]); return contextMenu(event, 'entity', { hit: { entity: { id: olRow.dataset.olSelect } } }); }
    const card = event.target.closest('.lib-card[data-item]');
    if (card) return contextMenu(event, 'libraryCard', { id: card.dataset.item });
    const mat = event.target.closest('[data-material]');
    if (mat) return contextMenu(event, 'material', { id: mat.dataset.material });
    if (event.target.closest('#left-panel, #right-panel, #palette-host')) return contextMenu(event, 'panel');
    if (event.target.closest('#start-page')) return contextMenu(event, 'start');
    if (event.target.closest('#statusbar')) return contextMenu(event, 'status');
    return contextMenu(event, 'default');
  });

  // Library card → view: drag to place there (pointer-based so it also works in WebView2 without HTML5 DnD quirks).
  root.addEventListener('pointerdown', (event) => {
    const cardEl = event.button === 0 ? event.target.closest?.('.lib-card[data-item]') : null;
    if (!cardEl || !hasDoc()) return;
    const start = { x: event.clientX, y: event.clientY };
    let ghost = null;
    const overView = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest('#view-host');
    const move = (e) => {
      if (!ghost) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
        ghost = document.createElement('div');
        ghost.className = 'stencil-ghost lib-ghost';
        ghost.innerHTML = cardEl.querySelector('.lib-thumb')?.innerHTML ?? '';
        document.body.append(ghost);
        startPlacing(cardEl.dataset.item, { sticky: false });
      }
      ghost.style.transform = `translate(${e.clientX - 28}px, ${e.clientY - 28}px)`;
      ghost.classList.toggle('over', Boolean(overView(e)));
      if (overView(e)) state.toolObject?.move?.(e);
    };
    const up = (e) => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      if (!ghost) return;
      ghost.remove();
      const swallow = (c) => { c.stopPropagation(); c.preventDefault(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, true), 0);
      if (overView(e)) state.toolObject?.up?.(e); else setTool('select');
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
  });

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

  window.addEventListener('resize', frameThrottle(() => { if (desktop && state.minWidth && window.innerWidth < state.minWidth - 1) native.setMinimumSize(state.minWidth, 640).catch(() => {}); }));
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', (event) => { try { state.toolObject?.keyUp?.(event); } catch { /* ignore */ } }, true);

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) { const previous = state.settings; state.settings = loadSettings(globalThis.localStorage); applySettings(previous); }
    else if (event.key === RECENT_KEY || event.key === RECENT_DIRS_KEY) { state.recent = loadRecent(globalThis.localStorage); state.recentDirs = loadRecentDirs(globalThis.localStorage); if (state.showStart || !state.doc) renderStartPage(); }
  });

  if (!desktop) {
    let depth = 0;
    document.addEventListener('dragenter', (event) => { if ([...(event.dataTransfer?.types ?? [])].includes('Files')) { depth += 1; setDropActive(true); event.preventDefault(); } });
    document.addEventListener('dragover', (event) => { event.preventDefault(); });
    document.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) setDropActive(false); });
    document.addEventListener('drop', (event) => { event.preventDefault(); depth = 0; setDropActive(false); handleDroppedFiles([...(event.dataTransfer?.files ?? [])]); });
    window.addEventListener('beforeunload', (event) => { if (doc()?.dirty) { event.preventDefault(); event.returnValue = ''; } });
  }

  setInterval(() => { const clock = root.querySelector('#status-clock'); if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 15000);
}

/** Ctrl+key shortcuts: [key, shift, command]. Single letters (SketchUp) come from the commands' `key`. */
const SHORTCUTS = [
  ['n', false, 'new'], ['o', false, 'open'], ['s', false, 'save'], ['s', true, 'saveAs'], ['w', false, 'closeProject'], ['i', false, 'importModel'],
  ['z', false, 'undo'], ['y', false, 'redo'], ['z', true, 'redo'], ['x', false, 'cut'], ['c', false, 'copy'], ['v', false, 'paste'], ['d', false, 'duplicate'],
  ['a', false, 'selectAll'], [']', false, 'rotate90'], ['[', false, 'rotateMinus90'], ['e', true, 'exportImage'],
  [',', false, 'settings'], ['l', true, 'language'], ['!', true, 'leftPanel'], ['1', true, 'leftPanel'], ['@', true, 'rightPanel'], ['2', true, 'rightPanel'],
  ['r', true, 'rulers'], ['arrowup', true, 'levelUp'], ['arrowdown', true, 'levelDown'], ['q', false, 'exit'], ['h', true, 'startPage'], ['b', true, 'shuffleBackground'], ['r', false, 'recent'], ['j', false, 'bottomPanel'],
];

/** Single keys → commands (SketchUp's default shortcuts). */
const LETTERS = Object.fromEntries(Object.entries(commands).filter(([, c]) => c.key && /^(Shift\+)?[A-Z]$|^Space$/.test(c.key)).map(([id, c]) => [c.key.toLowerCase().replace('space', ' '), id]));

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
  if (key === 'f1') { event.preventDefault(); run('about'); return; }
  if (key === 'f4') { event.preventDefault(); run('planView'); return; }
  if (key === 'f9') { event.preventDefault(); run('renderPhoto'); return; }
  if (key === 'f11') { event.preventDefault(); run('tutorial'); return; }
  if (editing) { if (key === 'escape') event.target.blur(); return; }
  if (!hasDoc()) return;
  // The active tool first (arrow locks, Shift locks, rotation keys, walk keys).
  try { if (state.toolObject?.key?.(event)) { event.preventDefault(); return; } } catch (error) { showError('error.tool', error); }
  if (key === 'delete' || key === 'backspace') { event.preventDefault(); run('delete'); return; }
  if (key === 'escape') { event.preventDefault(); if (state.tool !== 'select') setTool('select'); else if (Modeling?.editingModel?.()) { Modeling.stopEditing(); notify('info', t('notice.editDone')); } else clearSelection(); return; }
  if (key === 'pageup' || key === 'pagedown') { event.preventDefault(); run(key === 'pageup' ? 'prevScene' : 'nextScene'); return; }
  // Typing a number or a length goes to the Measurements box (SketchUp's VCB).
  if (/^[0-9.,'"x*/-]$/.test(event.key) && !event.altKey) {
    const vcb = root.querySelector('#vcb');
    if (vcb) { event.preventDefault(); vcb.focus(); vcb.value = event.key; return; }
  }
  const letter = (event.shiftKey ? 'shift+' : '') + key;
  const id = LETTERS[letter];
  if (id) { event.preventDefault(); run(id); }
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
  popups.on('start-tutorial', () => startTutorial());
  popups.on('show-start', () => showStartPage(true));
  popups.on('progress-cancel', (data) => { popups.actions.get(`cancel:${data.op}`)?.(); });
  popups.on('raise-test-panic', () => native.invoke('raise_test_panic').catch((error) => showError('error.unexpected', error)));
}

async function newCustomMaterial() {
  const result = await popups.open('material', { name: t('materials.newName'), color: '#a0a0a0', roughness: 0.7, metalness: 0 });
  if (!result?.ok) return;
  const spec = { id: newId('mat'), ko: result.name, en: result.name, color: result.color, roughness: Number(result.roughness), metalness: Number(result.metalness), category: 'other' };
  change('op.material', (p) => { p.materials.push(spec); }, ['materials']);
  defineCustomMaterial(spec);
  state.brush = spec.id;
  renderLeft();
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
  if (exists[0]) await openPath(files[0], { quiet: true });
}

/** What the panels (ui/panels.js) and the start page read. */
const panelApi = {
  state, commands, commandTip, commandEnabled, t,
  settings: () => state.settings,
  version: () => state.info?.version ?? VERSION,
  project, units, selection: () => state.selection,
  entity: (id) => entity(id),
  get builder() { return builder; },
  brush: () => state.brush,
  thumbnailOf, materialThumbnail: (id) => materialThumbnail(id, null),
  materialsOf,
  environments: () => [{ id: 'room', ko: '기본 실내 조명', en: 'Built-in room light' }, ...(Env?.ENVIRONMENTS ?? [])],
  modelStats: (e) => Modeling?.modelStats?.(e) ?? '',
};

/** What the tutorial and tests use. */
const appApi = {
  state, t, run, commands, popups, notify, showError, change, select, clearSelection, setTool, startPlacing, newProject, showStartPage, updateSettings, renderAll,
  settings: () => state.settings, project, get viewport() { return viewport; }, get builder() { return builder; }, anchorBelow, openMenubarMenu, openDocWindow, closeDocFrames,
  closeProject, setPlanView, goScene, addScene, ask, version: () => state.info?.version ?? VERSION,
  // The tutorial keeps the user's project: it swaps in its own and puts the user's back afterwards.
  takeDoc: () => state.doc, putDoc: (d) => { if (d) setDoc(d); else closeProject({ force: true }); },
  openTemplate: (id) => newProject(id),
};

async function start() {
  renderShell();
  bindEvents();
  bindPopupActions();
  await popups.init();
  state.info = await native.appInfo().catch(() => null);
  state.instance = await native.instanceInfo().catch(() => ({ first: true, others: 0 }));
  if (state.settings.animationRandom) updateSettings({ animation: randomAnimation(state.settings.animation) }, { quiet: true });
  setInterval(tickStartBackground, 1000);
  document.title = `MySketchBook v${state.info?.version ?? VERSION}`;
  native.setBackendLanguage(state.settings.language);
  applySettings({});
  await loadBackground();
  // Installed app: the asset library is an installer resource, read through the asset protocol
  // (the development build gets it from Vite like the web build).
  if (desktop && !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(location.href)) {
    try {
      const { resolveResource } = await import('@tauri-apps/api/path');
      const { convertFileSrc } = await import('@tauri-apps/api/core');
      // resolveResource may return a \\?\ long path; the asset protocol wants a plain one.
      const dir = String(await resolveResource('library')).replace(/^\\\\\?\\/, '');
      Env?.setLibraryBase?.(`${convertFileSrc(dir).replace(/\/?$/, '')}/`);
    } catch (error) { console.warn('library location', error); }
  }
  assetApi()?.installTextureHook?.();
  assetApi()?.setOnTexturesLoaded?.(() => { viewport?.requestRender(); });
  loadAssetItems().then(() => { if (state.leftTab === 'library') renderLeft(); });
  onCatalogChange(() => { if (state.leftTab === 'library') renderLeft(); });

  if (desktop) {
    appWindow.onCloseRequested(async (event) => {
      if (state.quitting) return;
      event.preventDefault();
      if (await confirmExit()) { state.quitting = true; await native.quitApp(); }
    });
    getCurrentWebview().onDragDropEvent((event) => {
      const { type } = event.payload;
      if (type === 'enter' || type === 'over') setDropActive(true);
      else if (type === 'leave') setDropActive(false);
      else if (type === 'drop') { setDropActive(false); handleDroppedPaths(event.payload.paths ?? []); }
    });
    native.listen('fatal-error', (fatal) => { const error = new Error(fatal.message); error.stack = [fatal.location, fatal.backtrace].join('\n'); showError('error.fatal', error, fatal.location); });
  }

  await restoreSession();
  trackMaximized();
  for (const path of await native.startupFiles().catch(() => [])) await openPath(path);
  if (!state.doc && !state.settings.showStartPage) newProject('room');
  state.showStart = !state.doc;
  renderAll();
  if (desktop) { await appWindow.show(); await appWindow.setFocus(); setTimeout(() => popups.prewarm('menu'), 400); }
  // The welcome popup belongs to the start page: not when the app opens straight into a project.
  if (state.settings.showWelcome && state.showStart && !globalThis.__MYSKETCHBOOK_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome')) setTimeout(() => { if (state.showStart || !state.doc) openWelcome(); }, 600);
}

async function openWelcome() {
  updateSettings({ tutorialOffered: true }, { quiet: true });
  const result = await popups.open('welcome', {});
  if (result?.choice === 'tutorial') startTutorial();
  else if (result?.choice === 'sample') newProjectAsk('apt59');
}

// Test hook: E2E suites and the smoke script drive the app through this.
window.__mysketchbook = {
  state, t, commands, popups, run,
  menus: { MENUS, SUBMENUS, enabled: (id) => commandEnabled(id) },
  api: appApi,
  get viewport() { return viewport; },
  get builder() { return builder; },
  actions: { newProject, openPath, openContent, saveDoc, closeProject, select, change, undo, redo, setTool, startPlacing, setPlanView, exportImage, renderPhoto, importModelFiles, withProgress, showStartPage, updateSettings, addScene, goScene, moveEntities, rotateSelection, deleteEntities, duplicateEntities, applyProjectView, showLibrary },
  domain: { buildTemplate, TEMPLATES, catalogItem, searchItems, MATERIAL_PRESETS, tutorialSteps: () => TUTORIAL_STEPS.length },
  tutorial: () => tutorial,
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => { if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {}); });

// Unused imports kept for the modelling tools' API surface.
void [fromUnits, toUnits, polygonCentroid, projectOnSegment, wallNormal, clearMaterialCache, idbGet, idbSet, idbDelete, MY_OBJECTS_KEY, CANVAS_ZOOM];
