// Main window: menu bar (the title bar), toolbar, the photo with its face points (left), the
// caricature gallery or the large view (centre), the selected caricature's exaggeration, style
// options and effects (right), status bar. A photo goes through the face finder (ui/facefinder.js)
// and the render workers (ui/renderer.js → engine/), which draw the ten caricatures at once.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import APP_ICON from '../assets/icon-256.png';
import {
  loadSettings, PANEL_MIN, RECENT_DIRS_KEY, RECENT_KEY, SESSION_KEY, STORAGE_KEY, storeSettings, VIEW_ZOOM, zoomStep, ANIMATIONS, GALLERY_COLUMNS, GALLERY_LAYOUTS,
} from './domain/settings.js';
import { addRecent, loadRecent, loadRecentDirs, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import {
  baseName, defaultItems, directoryOf, FormatError, isOpenableName, isProjectName, MAX_ITEMS, mimeOf, newItem, parseProject, PHOTO_EXTENSIONS,
  PROJECT_EXTENSION, safeFileName, serializeProject, stripExtension, varyItem,
} from './domain/project.js';
import { History } from './domain/history.js';
import { SAMPLE_PHOTOS, sampleById, sampleUrl } from './domain/samples.js';
import { STYLES, styleById, normalizeOptions } from './engine/styles.js';
import { NO_WARP, normalizeWarp, personalWarp, WARP_KEYS } from './engine/warp.js';
import { effectDef, newEffect, normalizeEffect } from './engine/effects.js';
import { distinctiveness, faceCrop, moveFeature, scaleFeatures, standoutFeatures, translateFeatures, validFeatures } from './engine/face.js';
import { switchFlag } from './flags.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { PopupHost } from './platform/popups.js';
import { applyFont, applyTheme, DARK_THEMES, LIGHT_THEMES, resolveTheme, themeName } from './themes.js';
import { escapeHtml, frameThrottle, keyLabel, pointerDrag } from './ui/dom.js';
import { AnimatedBackground } from './ui/background.js';
import { startPageHtml } from './ui/startpage.js';
import { startBoard } from './ui/startboard.js';
import { bindSteppers } from './stepper.js';
import { RenderPool } from './ui/renderer.js';
import { analyse, resizeMask } from './ui/facefinder.js';
import { blobToDataUrl, cropDataUrl, encodeCanvas, EXPORT_TYPES, imageFromBytes, loadImage, normalizePhoto, rasterFromImage, base64ToBytes } from './ui/photo.js';
import { composeCanvas } from './ui/overlay.js';
import { effectMenuItems, galleryCardHtml, itemName, leftPanelHtml, marksSvg, rightPanelHtml } from './ui/panels.js';
import { bytesToBase64, zip } from './export/files.js';
import { DOC_KINDS, docLabel, docWindowTitle } from './domain/helpdocs.js';

const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const clone = (value) => structuredClone(value);

const state = {
  settings: loadSettings(globalThis.localStorage),
  recent: loadRecent(globalThis.localStorage),
  recentDirs: loadRecentDirs(globalThis.localStorage),
  /** The open photo and its caricatures (null: none). */
  doc: null,
  /** item id → { image, features, mask, ms, canvas (composed), busy } */
  results: new Map(),
  view: 'gallery',
  compare: false,
  comparePos: 50,
  /** Large view zoom in percent; 0 = fit to the window. */
  zoom: 0,
  busy: 0,
  analysing: false,
  notice: null,
  info: null,
  openMenu: null,
  lastMenuClose: { name: null, at: 0 },
  quitting: false,
  maximized: false,
  minWidth: 0,
  showStart: false,
  dropActive: false,
  clipboardEffects: null,
};

let pool = null;
const lang = () => getLanguage();
const doc = () => state.doc;
const items = () => state.doc?.items ?? [];
const selectedItem = () => items().find((item) => item.id === state.doc?.selected) ?? null;
const selectedIndex = () => items().findIndex((item) => item.id === state.doc?.selected);
const docName = () => (state.doc ? state.doc.path ? baseName(state.doc.path) : state.doc.name : '');
const hasDoc = () => Boolean(state.doc);
const hasItem = () => Boolean(selectedItem());

// ───────────────────────── notices & errors

let noticeTimer = 0;
function notify(kind, text) {
  state.notice = { kind, text, at: Date.now() };
  renderStatus();
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { state.notice = null; renderStatus(); }, kind === 'error' ? 12000 : 6000);
}

function formatError(error) {
  if (error instanceof FormatError || (error?.code && t(error.code) !== error.code)) return { message: t(error.code), detail: [error.detail, error.message !== error.code ? error.message : ''].filter(Boolean).join('\n') };
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
    app: info ? `${info.name} ${info.version} (${info.web ? 'web' : `${info.os}/${info.arch}`}, ${info.commit})` : `MyPhotoCut ${VERSION}`,
  });
}

window.addEventListener('error', (event) => showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''));
window.addEventListener('unhandledrejection', (event) => showError('error.unexpected', event.reason));

// ───────────────────────── the document: photo → analysis → caricatures

/** The editable part of the document (what Undo restores). */
const snapshot = () => ({ features: clone(state.doc.features), items: clone(state.doc.items), selected: state.doc.selected, autoCrop: state.doc.autoCrop, crop: clone(state.doc.crop) });

/**
 * Changes the document: records Undo, applies `mutate(doc)`, marks it modified and redraws the
 * caricatures named by `rerender` ('all', an array of ids, or 'selected').
 */
function change(label, mutate, { merge = null, rerender = 'selected', panel = true } = {}) {
  const d = state.doc;
  if (!d) return;
  d.history.push(snapshot(), label, { merge });
  mutate(d);
  d.dirty = true;
  afterChange(rerender, { panel });
}

function afterChange(rerender, { panel = true } = {}) {
  const d = state.doc;
  if (rerender === 'all') renderAllItems();
  else if (rerender === 'selected') { const item = selectedItem(); if (item) renderItem(item); } else if (Array.isArray(rerender)) for (const id of rerender) { const item = d.items.find((x) => x.id === id); if (item) renderItem(item); }
  renderGallery();
  if (panel) renderRight();
  renderLeftMarks();
  renderTitleProject();
  renderToolbarState();
  renderStatus();
}

function undo() {
  const d = state.doc;
  const entry = d?.history.undo(snapshot());
  if (!entry) return;
  restore(entry.state);
  notify('info', t('notice.undone', { name: entry.label }));
}

function redo() {
  const d = state.doc;
  const entry = d?.history.redo(snapshot());
  if (!entry) return;
  restore(entry.state);
  notify('info', t('notice.redone', { name: entry.label }));
}

function restore(saved) {
  const d = state.doc;
  const framingChanged = saved.autoCrop !== d.autoCrop || JSON.stringify(saved.crop) !== JSON.stringify(d.crop);
  const featuresChanged = framingChanged || JSON.stringify(saved.features) !== JSON.stringify(d.features);
  const before = new Map(d.items.map((item) => [item.id, JSON.stringify(item)]));
  d.features = saved.features;
  d.items = saved.items;
  d.selected = saved.selected;
  d.autoCrop = saved.autoCrop;
  d.crop = saved.crop;
  d.dirty = true;
  if (framingChanged) buildWork();
  for (const id of [...state.results.keys()]) if (!d.items.some((item) => item.id === id)) dropResult(id);
  const changed = featuresChanged ? 'all' : d.items.filter((item) => before.get(item.id) !== JSON.stringify(item) || !state.results.has(item.id)).map((item) => item.id);
  renderLeft();
  afterChange(changed);
}

function dropResult(id) {
  state.results.delete(id);
}

/** Opens a photo (an <img> already decoded) as a new document. */
async function openPhoto(img, { name, path = null, project = null } = {}) {
  const photo = project?.photo ?? { name, type: mimeOf(name), ...(await normalizePhoto(img)) };
  const photoImg = project ? img : await loadImage(photo.data);
  state.results.clear();
  state.doc = {
    name: project?.name || stripExtension(name) || t('doc.untitled'),
    path,
    handle: null,
    dirty: !project,
    photo,
    img: photoImg,
    work: null,
    workScale: 1,
    mask: null,
    fullMask: null,
    /** Head-and-shoulders framing ({ x, y, w, h } in photo pixels) and whether it is used. */
    autoCrop: project ? project.autoCrop : state.settings.autoCrop,
    crop: project?.crop ?? null,
    region: null,
    regionUrl: null,
    features: project?.features ?? null,
    autoFeatures: null,
    items: project?.items?.length ? project.items : [],
    selected: project?.selected ?? null,
    created: project?.created ?? new Date().toISOString(),
    history: new History(),
    analysis: null,
  };
  state.view = 'gallery';
  state.compare = false;
  state.zoom = 0;
  state.showStart = false;
  renderAll();
  await prepareWork({ analyseFace: !validFeatures(state.doc.features) });
  if (!state.doc.items.length && state.settings.autoGenerate) state.doc.items = defaultItems(state.settings.styleSet, Math.floor(Math.random() * 1e6), faceFactors());
  if (!state.doc.selected && state.doc.items.length) state.doc.selected = state.doc.items[0].id;
  renderAll();
  renderAllItems();
  notify('success', t(project ? 'notice.projectOpened' : 'notice.photoOpened', { name: project ? docName() : name, count: state.doc.items.length }));
}

/**
 * Finds the face and the person in the photo (at the work size), then makes the working picture.
 * `analyseFace`: the found face replaces the current points (and the framing follows it).
 */
async function prepareWork({ analyseFace = true } = {}) {
  const d = state.doc;
  const full = rasterFromImage(d.img, state.settings.workSize);
  const fullScale = full.width / d.photo.width;
  state.analysing = true;
  renderStatus();
  try {
    const result = await analyse(full, { useFaceModel: state.settings.useFaceModel, usePersonMask: state.settings.usePersonMask });
    d.fullMask = result.mask ? { data: result.mask, width: full.width, height: full.height, scale: fullScale } : null;
    const found = scaleFeatures(result.features, 1 / fullScale);
    d.autoFeatures = found;
    if (analyseFace || !validFeatures(d.features)) d.features = found;
    if (analyseFace || !d.crop) d.crop = faceCrop(d.features, d.photo.width, d.photo.height);
    d.analysis = { faceMethod: result.faceMethod, maskMethod: result.maskMethod, faces: result.faces };
    if (result.faceMethod !== 'landmarks' && state.settings.useFaceModel && analyseFace) notify('info', t(result.faceMethod === 'default' ? 'notice.faceNotFound' : 'notice.faceBySkin'));
  } catch (error) {
    showError('error.analyse', error);
  } finally {
    state.analysing = false;
  }
  buildWork();
}

/** The working picture: the whole photo, or the head-and-shoulders framing, at the work size; its mask follows. */
function buildWork() {
  const d = state.doc;
  const crop = d.autoCrop ? d.crop : null;
  const region = crop ?? { x: 0, y: 0, w: d.photo.width, h: d.photo.height };
  d.region = region;
  d.work = rasterFromImage(d.img, state.settings.workSize, crop);
  d.workScale = d.work.width / region.w;
  const m = d.fullMask;
  d.mask = m ? resizeMask(m.data, m.width, m.height, d.work.width, d.work.height, { x: region.x * m.scale, y: region.y * m.scale, w: region.w * m.scale, h: region.h * m.scale }) : null;
  d.regionUrl = crop ? cropDataUrl(d.img, crop) : d.photo.data;
  d.exportKey = null;
  pool.setSource('work', d.work, d.mask);
}

/** The face points in a picture of the region at `scale` pixels per photo pixel. */
const regionFeatures = (scale) => scaleFeatures(translateFeatures(state.doc.features, -state.doc.region.x, -state.doc.region.y), scale);
const workFeatures = () => regionFeatures(state.doc.workScale);

/** Head-and-shoulders framing on / off (an Undo step; every caricature is drawn again). */
function toggleCrop() {
  const d = state.doc;
  if (!d) return;
  const crop = d.crop ?? faceCrop(d.features, d.photo.width, d.photo.height);
  if (!d.autoCrop && !crop) { notify('info', t('notice.cropNotNeeded')); return; }
  d.history.push(snapshot(), t(d.autoCrop ? 'op.cropOff' : 'op.cropOn'));
  d.autoCrop = !d.autoCrop;
  d.crop = crop;
  d.dirty = true;
  buildWork();
  renderLeft();
  renderCenter();
  afterChange('all');
}

/** Draws one caricature in a worker; the card and the large view update when it is done. */
async function renderItem(item) {
  const d = state.doc;
  if (!d?.work) return;
  const result = state.results.get(item.id) ?? {};
  result.busy = true;
  state.results.set(item.id, result);
  markCardBusy(item.id, true);
  try {
    const done = await pool.render('work', workFeatures(), item);
    if (!done || state.doc !== d) return;
    const current = d.items.find((x) => x.id === item.id);
    if (!current) return;
    const entry = { ...done, busy: false };
    entry.canvas = composeCanvas(done.image, current.effects, done.features);
    state.results.set(item.id, entry);
    placeCardCanvas(item.id);
    if (state.view === 'single' && d.selected === item.id) renderSingle();
  } catch (error) {
    const entry = state.results.get(item.id);
    if (entry) entry.busy = false;
    markCardBusy(item.id, false);
    showError('error.render', error, `${item.styleId}`);
  }
}

function renderAllItems() {
  // The selected one first, then in gallery order.
  const list = [...items()].sort((a, b) => (a.id === state.doc.selected ? -1 : b.id === state.doc.selected ? 1 : 0));
  for (const item of list) renderItem(item);
}

/** Recomputes the working picture (work size changed) and redraws everything. */
async function reworkAll() {
  if (!state.doc) return;
  await prepareWork({ analyseFace: false });
  renderLeft();
  renderAllItems();
}

// ───────────────────────── caricature commands

function select(id, { reveal = true } = {}) {
  if (!state.doc || state.doc.selected === id) return;
  state.doc.selected = id;
  for (const card of root.querySelectorAll('.cari-card')) {
    const on = card.dataset.item === id;
    card.classList.toggle('selected', on);
    card.setAttribute('aria-selected', String(on));
    if (on && reveal) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  renderRight();
  if (state.view === 'single') renderSingle();
  renderTabs();
  renderStatus();
  renderToolbarState();
}

function step(direction) {
  const list = items();
  if (!list.length) return;
  const index = Math.max(0, selectedIndex());
  select(list[(index + direction + list.length) % list.length].id);
}

function addStyle(styleId) {
  if (!state.doc) return;
  if (items().length >= MAX_ITEMS) { notify('error', t('notice.tooMany', { max: MAX_ITEMS })); return; }
  const item = newItem(styleId, undefined, faceFactors());
  change(t('op.addStyle', { name: t(`style.${styleId}`) }), (d) => { d.items.push(item); d.selected = item.id; }, { rerender: [item.id] });
  revealSelected();
}

function revealSelected() {
  requestAnimationFrame(() => root.querySelector('.cari-card.selected')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
}

function duplicateItem(id = state.doc?.selected) {
  const source = items().find((x) => x.id === id);
  if (!source) return;
  if (items().length >= MAX_ITEMS) { notify('error', t('notice.tooMany', { max: MAX_ITEMS })); return; }
  const copy = { ...clone(source), id: newItem(source.styleId).id };
  change(t('op.duplicate'), (d) => { d.items.splice(d.items.indexOf(source) + 1, 0, copy); d.selected = copy.id; }, { rerender: [copy.id] });
  revealSelected();
}

function varySelected(id = state.doc?.selected) {
  const source = items().find((x) => x.id === id);
  if (!source) return;
  if (items().length >= MAX_ITEMS) { notify('error', t('notice.tooMany', { max: MAX_ITEMS })); return; }
  const next = varyItem(source, undefined, state.settings.varySpread / 100);
  change(t('op.vary'), (d) => { d.items.splice(d.items.indexOf(source) + 1, 0, next); d.selected = next.id; }, { rerender: [next.id] });
  revealSelected();
}

async function deleteItem(id = state.doc?.selected) {
  const item = items().find((x) => x.id === id);
  if (!item) return;
  if (state.settings.confirmDelete) {
    const choice = await ask({
      icon: 'trash', title: t('confirm.deleteTitle'), message: t('confirm.deleteMessage'), items: [itemName(item)],
      buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'delete', label: t('confirm.delete'), icon: 'trash', danger: true, primary: true }],
    });
    if (choice !== 'delete') return;
  }
  change(t('op.delete'), (d) => {
    const index = d.items.indexOf(item);
    d.items.splice(index, 1);
    if (d.selected === id) d.selected = d.items[Math.min(index, d.items.length - 1)]?.id ?? null;
  }, { rerender: [] });
  dropResult(id);
  if (!items().length && state.view === 'single') setView('gallery');
}

/** Ten new caricatures of the chosen styles, replacing the current ones (asks when there are edits). */
async function generateSet() {
  if (!state.doc) return;
  if (items().length) {
    const choice = await ask({
      icon: 'generate', title: t('confirm.generateTitle'), message: t('confirm.generateMessage', { count: state.settings.styleSet.length }),
      buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'add', label: t('confirm.generateAdd'), icon: 'plus' }, { id: 'replace', label: t('confirm.generateReplace'), icon: 'generate', primary: true }],
    });
    if (choice === 'cancel') return;
    const fresh = defaultItems(state.settings.styleSet, Math.floor(Math.random() * 1e6), faceFactors());
    if (choice === 'add') {
      const room = MAX_ITEMS - items().length;
      const added = fresh.slice(0, room);
      change(t('op.generate'), (d) => { d.items.push(...added); d.selected = added[0]?.id ?? d.selected; }, { rerender: added.map((x) => x.id) });
      return;
    }
    state.results.clear();
    change(t('op.generate'), (d) => { d.items = fresh; d.selected = fresh[0]?.id ?? null; }, { rerender: 'all' });
    return;
  }
  const fresh = defaultItems(state.settings.styleSet, Math.floor(Math.random() * 1e6), faceFactors());
  change(t('op.generate'), (d) => { d.items = fresh; d.selected = fresh[0]?.id ?? null; }, { rerender: 'all' });
}

/** A new take on every caricature (new seeds and slightly different exaggeration). */
function varyAll() {
  if (!items().length) return;
  change(t('op.varyAll'), (d) => { d.items = d.items.map((item) => ({ ...varyItem(item, undefined, state.settings.varySpread / 100), id: item.id, name: item.name })); }, { rerender: 'all' });
}

function setItemValue(scope, key, value, label) {
  const item = selectedItem();
  if (!item) return;
  change(label, () => {
    if (scope === 'warp') item.warp = normalizeWarp({ ...item.warp, [key]: value });
    else if (scope === 'option') item.options = normalizeOptions(item.styleId, { ...item.options, [key]: value });
  }, { merge: `${item.id}:${scope}:${key}`, panel: false });
}

function setStyle(styleId) {
  const item = selectedItem();
  if (!item || item.styleId === styleId) return;
  const style = styleById(styleId);
  change(t('op.style', { name: t(`style.${styleId}`) }), () => {
    item.styleId = style.id;
    item.warp = normalizeWarp({ ...style.warp, strength: item.warp.strength });
    item.options = normalizeOptions(style.id, style.options);
  });
}

function renameItem(name) {
  const item = selectedItem();
  if (!item || item.name === name) return;
  change(t('op.rename'), () => { item.name = name.trim().slice(0, 80); }, { rerender: [], panel: false });
}

async function renamePrompt() {
  const item = selectedItem();
  if (!item) return;
  const result = await popups.open('prompt', { title: t('action.rename'), label: t('panel.name'), value: item.name || itemName(item), icon: 'rename' });
  if (result?.value != null) { renameItem(String(result.value)); renderRight(); }
}

/** How much each feature of this face stands out (null when exaggeration follows the styles only). */
function faceFactors() {
  const d = state.doc;
  if (!d?.features || !state.settings.personalWarp) return null;
  return distinctiveness(d.features, state.settings.personalGain / 100);
}

function warpPreset(kind) {
  const item = selectedItem();
  if (!item) return;
  const style = styleById(item.styleId);
  change(t(`op.warp.${kind}`), () => {
    if (kind === 'style') item.warp = normalizeWarp({ ...style.warp, strength: 1 });
    else if (kind === 'personal') item.warp = personalWarp(style.warp, distinctiveness(state.doc.features, state.settings.personalGain / 100));
    else if (kind === 'none') item.warp = normalizeWarp(NO_WARP);
    else {
      const random = Math.random;
      const warp = { strength: 1 };
      for (const key of WARP_KEYS) warp[key] = Math.round((0.85 + random() * 0.75) * 100) / 100;
      warp.head = Math.round((1.15 + random() * 0.7) * 100) / 100;
      item.warp = normalizeWarp(warp);
    }
  });
}

/** Every caricature's exaggeration fitted to this face again (after moving points, for example). */
function personalAll() {
  const factors = distinctiveness(state.doc.features, state.settings.personalGain / 100);
  change(t('op.personalAll'), (d) => { for (const item of d.items) item.warp = { ...personalWarp(styleById(item.styleId).warp, factors), strength: item.warp.strength }; }, { rerender: 'all' });
}

function reseed() {
  const item = selectedItem();
  if (!item) return;
  change(t('op.reseed'), () => { item.seed = Math.floor(Math.random() * 1e9) >>> 0; });
}

function resetOptions() {
  const item = selectedItem();
  if (!item) return;
  change(t('op.optionsReset'), () => { item.options = normalizeOptions(item.styleId, styleById(item.styleId).options); });
}

// ───────────────────────── effects

function addEffect(id) {
  const item = selectedItem();
  if (!item || !effectDef(id)) return;
  const effect = newEffect(id, id === 'caption' ? { text: itemName(item) } : id === 'bubble' ? { text: t('effect.bubbleDefault') } : {});
  change(t('op.addEffect', { name: t(`effect.${id}`) }), () => { item.effects.push(effect); });
}

function effectAction(action, index) {
  const item = selectedItem();
  const effect = item?.effects[index];
  if (!effect) return;
  const name = t(`effect.${effect.id}`);
  if (action === 'toggle') change(t(effect.on ? 'op.effectOff' : 'op.effectOn', { name }), () => { effect.on = !effect.on; });
  else if (action === 'remove') change(t('op.effectRemove', { name }), () => { item.effects.splice(index, 1); });
  else if (action === 'up' && index > 0) change(t('op.effectMove', { name }), () => { item.effects.splice(index - 1, 0, ...item.effects.splice(index, 1)); });
  else if (action === 'down' && index < item.effects.length - 1) change(t('op.effectMove', { name }), () => { item.effects.splice(index + 1, 0, ...item.effects.splice(index, 1)); });
}

function setEffectParam(index, key, value, { merge = true } = {}) {
  const item = selectedItem();
  const effect = item?.effects[index];
  if (!effect) return;
  change(t('op.effectParam', { name: t(`effect.${effect.id}`) }), () => {
    item.effects[index] = normalizeEffect({ ...effect, [key]: value }) ?? effect;
  }, { merge: merge ? `${item.id}:fx:${index}:${key}` : null, panel: false });
}

function effectsToAll() {
  const item = selectedItem();
  if (!item) return;
  const effects = clone(item.effects);
  change(t('op.effectsToAll'), (d) => { for (const other of d.items) other.effects = clone(effects); }, { rerender: 'all' });
  notify('success', t('notice.effectsToAll', { count: items().length }));
}

function effectsClear() {
  const item = selectedItem();
  if (!item?.effects.length) return;
  change(t('op.effectsClear'), () => { item.effects = []; });
}

function copyEffects() {
  const item = selectedItem();
  if (!item) return;
  state.clipboardEffects = clone(item.effects);
  notify('success', t('notice.effectsCopied', { count: item.effects.length }));
  renderToolbarState();
}

function pasteEffects() {
  const item = selectedItem();
  if (!item || !state.clipboardEffects) return;
  const effects = clone(state.clipboardEffects);
  change(t('op.effectsPaste'), () => { item.effects = effects; });
}

// ───────────────────────── face points

async function refindFace() {
  if (!state.doc) return;
  const before = snapshot();
  await prepareWork({ analyseFace: true });
  state.doc.history.push(before, t('op.faceFind'));
  state.doc.dirty = true;
  renderLeft();
  afterChange('all');
  notify('success', t('notice.faceFound', { method: t(`face.method.${state.doc.features.method}`) }));
}

function resetFace() {
  const d = state.doc;
  if (!d?.autoFeatures) return;
  change(t('op.faceReset'), () => { d.features = clone(d.autoFeatures); }, { rerender: 'all' });
  renderLeft();
}

// ───────────────────────── views

function setView(view) {
  if (!state.doc) return;
  if (view === 'single' && !selectedItem()) return;
  state.view = view;
  renderCenter();
  renderToolbarState();
  renderStatus();
}

function setZoom(percent) {
  state.zoom = percent ? Math.max(VIEW_ZOOM.min, Math.min(VIEW_ZOOM.max, Math.round(percent))) : 0;
  if (state.view !== 'single') setView('single'); else renderSingle();
  renderToolbarState();
  renderStatus();
}

/** The zoom the large view shows: the chosen one, or the one that fits. */
function effectiveZoom() {
  if (state.zoom) return state.zoom;
  const entry = state.results.get(state.doc?.selected);
  const host = root.querySelector('#single-stage');
  if (!entry?.canvas || !host) return 100;
  const fit = Math.min((host.clientWidth - 40) / entry.canvas.width, (host.clientHeight - 40) / entry.canvas.height);
  return Math.max(5, Math.floor(fit * 100));
}

// ───────────────────────── files

const findOpen = (path) => state.doc?.path && state.doc.path.replace(/\\/g, '/').toLowerCase() === String(path).replace(/\\/g, '/').toLowerCase();

function rememberRecent(entry) {
  state.recent = addRecent(state.recent, entry);
  storeRecent(globalThis.localStorage, state.recent);
}

function rememberDirectory(dir) {
  if (!dir) return;
  state.recentDirs = addRecent(state.recentDirs, { path: dir });
  storeRecentDirs(globalThis.localStorage, state.recentDirs);
  updateSettings({ lastDirectory: dir }, { quiet: true });
}

/** Before another photo replaces the current one: Save / Don't save / Cancel when it has changes. */
async function confirmReplace() {
  if (!state.doc?.dirty) return true;
  const choice = await ask({
    icon: 'save', title: t('confirm.replaceTitle'), message: t('confirm.replaceMessage', { name: docName() }),
    buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }],
  });
  if (choice === 'save') return saveDoc();
  return choice === 'discard';
}

/** Opens a file (photo or project) given as name + bytes / text. */
async function openContent(name, content, { path = null, handle = null } = {}) {
  if (isProjectName(name)) {
    const text = typeof content === 'string' ? content : new TextDecoder().decode(content);
    const project = parseProject(text);
    const img = await loadImage(project.photo.data);
    await openPhoto(img, { name, path, project });
    state.doc.handle = handle;
    state.doc.dirty = false;
  } else {
    const img = await imageFromBytes(name, content, mimeOf(name));
    await openPhoto(img, { name, path });
  }
  if (path) { rememberRecent({ path }); rememberDirectory(directoryOf(path)); } else rememberRecent({ path: name, web: true });
  persistSession();
  renderTitleProject();
}

async function openPath(path, { quiet = false } = {}) {
  if (findOpen(path)) return;
  if (!(await confirmReplace())) return;
  try {
    const name = baseName(path);
    if (!isOpenableName(name)) throw new FormatError('format.unsupported', name);
    const content = isProjectName(name)
      ? await withProgress('progress.open', name, (op) => native.readTextFile(path, op))
      : base64ToBytes(await withProgress('progress.open', name, (op) => native.readBase64File(path, op)));
    await openContent(name, content, { path });
  } catch (error) {
    if (!quiet) showError('error.open', error, path);
    else throw error;
  }
}

async function openWithDialog(directory = null) {
  if (desktop) {
    const picked = await native.chooseFiles(directory ?? state.settings.lastDirectory, [
      { name: t('file.openable'), extensions: [PROJECT_EXTENSION, ...PHOTO_EXTENSIONS] },
      { name: t('file.photos'), extensions: PHOTO_EXTENSIONS },
      { name: 'JPEG · PNG · WebP · AVIF · GIF · BMP', extensions: ['jpg', 'jpeg', 'jfif', 'png', 'apng', 'webp', 'avif', 'gif', 'bmp'] },
      { name: 'TIFF · TGA · PSD · QOI · PPM/PGM/PBM', extensions: ['tif', 'tiff', 'tga', 'psd', 'qoi', 'ppm', 'pgm', 'pbm', 'pnm', 'pam'] },
      { name: 'ICO · SVG · HEIC', extensions: ['ico', 'cur', 'svg', 'heic', 'heif'] },
      { name: t('file.projects'), extensions: [PROJECT_EXTENSION] },
    ], false);
    if (picked[0]) await openPath(picked[0]);
    return;
  }
  const [file] = await native.pickWithInput(`image/*,${PHOTO_EXTENSIONS.map((e) => `.${e}`).join(',')},.${PROJECT_EXTENSION}`);
  if (!file) return;
  if (!(await confirmReplace())) return;
  try {
    await openContent(file.name, isProjectName(file.name) ? await file.text() : new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    showError('error.open', error, file.name);
  }
}

async function openRecent(path) {
  const entry = state.recent.find((item) => item.path === path);
  if (entry?.web || !desktop) { notify('info', t('notice.webRecent')); return openWithDialog(); }
  try {
    await openPath(path, { quiet: true });
  } catch (error) {
    const missing = (await native.pathsExist([path]).catch(() => [true]))[0] === false;
    if (missing) {
      state.recent = removeRecent(state.recent, path);
      storeRecent(globalThis.localStorage, state.recent);
      notify('error', t('notice.recentMissing', { name: baseName(path) }));
      if (state.showStart) renderStartPage();
    } else showError('error.open', error, path);
  }
  return undefined;
}

async function openSample(id) {
  const sample = sampleById(id) ?? SAMPLE_PHOTOS[0];
  if (!(await confirmReplace())) return;
  try {
    const img = await loadImage(sampleUrl(sample));
    await openPhoto(img, { name: `${sample[lang()]}.jpg` });
  } catch (error) {
    showError('error.open', error, sample.file);
  }
}

async function openDataUrl(dataUrl, name) {
  if (!(await confirmReplace())) return;
  try {
    const img = await loadImage(dataUrl);
    await openPhoto(img, { name });
  } catch (error) {
    showError('error.open', error, name);
  }
}

async function openCamera() {
  const result = await popups.open('camera', {});
  if (result?.data) await openDataUrl(result.data, `${t('doc.cameraName')} ${new Date().toLocaleString().replace(/[\\/:*?"<>|]/g, '-')}.jpg`);
}

async function pastePhoto() {
  try {
    if (!navigator.clipboard?.read) throw new Error('no clipboard');
    const clipItems = await navigator.clipboard.read();
    for (const entry of clipItems) {
      const type = entry.types.find((x) => x.startsWith('image/'));
      if (type) return openDataUrl(await blobToDataUrl(await entry.getType(type)), `${t('doc.pastedName')}.png`);
    }
    notify('info', t('notice.noClipboardImage'));
  } catch {
    notify('info', t('notice.pasteWithKeys'));
  }
  return undefined;
}

const projectName = () => `${safeFileName(state.doc.path ? stripExtension(baseName(state.doc.path)) : state.doc.name)}.${PROJECT_EXTENSION}`;

function projectData() {
  const d = state.doc;
  return { name: d.name, created: d.created, photo: d.photo, features: d.features, items: d.items, selected: d.selected, autoCrop: d.autoCrop, crop: d.crop };
}

async function saveDoc({ saveAs = false } = {}) {
  const d = state.doc;
  if (!d) return false;
  const text = serializeProject(projectData());
  try {
    if (desktop) {
      let path = !saveAs && d.path && isProjectName(d.path) ? d.path : null;
      if (!path) {
        const dir = d.path ? directoryOf(d.path) : state.settings.lastDirectory;
        path = await native.chooseSavePath(dir ? `${dir}/${projectName()}` : projectName(), [PROJECT_EXTENSION]);
        if (!path) return false;
        if (!isProjectName(path)) path = `${path}.${PROJECT_EXTENSION}`;
      }
      await withProgress('progress.save', baseName(path), (op) => native.writeTextFile(path, text, op));
      d.path = path;
      rememberRecent({ path });
      rememberDirectory(directoryOf(path));
    } else {
      const saved = await native.saveFileWeb(text, { name: projectName(), handle: d.handle, saveAs, mime: 'application/json' });
      if (!saved) return false;
      d.handle = saved.handle;
      d.name = stripExtension(saved.name);
      rememberRecent({ path: saved.name, web: true });
    }
    d.dirty = false;
    renderTitleProject();
    renderStatus();
    notify('success', t('notice.saved', { name: docName() || projectName() }));
    return true;
  } catch (error) {
    showError('error.save', error);
    return false;
  }
}

async function closePhoto() {
  if (!state.doc || !(await confirmReplace())) return;
  state.doc = null;
  state.results.clear();
  pool?.forget('work');
  state.showStart = true;
  renderAll();
}

// ───────────────────────── export

/** A finished caricature at export size: a canvas with every effect and overlay. */
async function exportCanvas(item, size) {
  const d = state.doc;
  const key = `export:${size}`;
  if (d.exportKey !== key) {
    // (Calls made together share one source: the first sets it, the others see the key.)
    const raster = rasterFromImage(d.img, size, d.autoCrop ? d.crop : null);
    const mask = d.mask ? resizeMask(d.mask, d.work.width, d.work.height, raster.width, raster.height) : null;
    pool.setSource('export', raster, mask);
    d.exportKey = key;
    d.exportScale = raster.width / d.region.w;
  }
  const done = await pool.render('export', regionFeatures(d.exportScale), { ...item, id: `export-${item.id}` });
  if (!done) throw new Error('export.cancelled');
  return composeCanvas(done.image, item.effects, done.features);
}

async function saveBytes(name, type, bytes) {
  if (desktop) {
    const dir = state.settings.lastDirectory;
    const path = await native.chooseSavePath(dir ? `${dir}/${name}` : name, [type]);
    if (!path) return null;
    await withProgress('progress.export', baseName(path), (op) => native.writeBase64File(path, bytesToBase64(bytes), op));
    rememberDirectory(directoryOf(path));
    return path;
  }
  const mime = EXPORT_TYPES[type]?.mime ?? (type === 'zip' ? 'application/zip' : 'application/octet-stream');
  const saved = await native.saveFileWeb(new Blob([bytes], { type: mime }), { name, saveAs: true, mime });
  return saved?.name ?? null;
}

async function openExport(scope = 'selected') {
  if (!state.doc || (scope === 'selected' && !selectedItem())) return;
  const s = state.settings;
  const result = await popups.open('image', { scope, type: s.exportType, size: s.exportSize, quality: s.exportQuality, count: items().length, name: selectedItem() ? itemName(selectedItem()) : '' });
  if (!result) return;
  updateSettings({ exportType: result.type, exportSize: result.size, exportQuality: result.quality }, { quiet: true });
  if (result.scope === 'all') return exportAll(result);
  if (result.scope === 'sheet') return exportSheet(result);
  return exportSelected(result);
}

const exportFileName = (item, index, type) => `${safeFileName(state.doc.name)}-${String(index + 1).padStart(2, '0')}-${safeFileName(itemName(item))}.${EXPORT_TYPES[type].ext}`;

async function exportSelected({ type, size, quality }) {
  const item = selectedItem();
  if (!item) return;
  try {
    const canvas = await withBusy(t('progress.export'), () => exportCanvas(item, size));
    const bytes = await encodeCanvas(canvas, type, quality);
    const saved = await saveBytes(exportFileName(item, selectedIndex(), type), type, bytes);
    if (saved) notify('success', t('notice.exported', { name: baseName(saved) }));
  } catch (error) {
    showError('error.export', error);
  }
}

async function exportAll({ type, size, quality }) {
  const list = items();
  if (!list.length) return;
  try {
    const entries = [];
    await withBusy(t('progress.exportAll'), async (progress) => {
      for (const [index, item] of list.entries()) {
        progress(index, list.length);
        const canvas = await exportCanvas(item, size);
        entries.push({ name: exportFileName(item, index, type), data: await encodeCanvas(canvas, type, quality) });
      }
    });
    const saved = await saveBytes(`${safeFileName(state.doc.name)}-caricatures.zip`, 'zip', zip(entries));
    if (saved) notify('success', t('notice.exportedAll', { count: entries.length, name: baseName(saved) }));
  } catch (error) {
    showError('error.export', error);
  }
}

/** Every caricature on one picture (a contact sheet) with their names. */
async function buildSheet(size) {
  const list = items();
  const canvases = [];
  await withBusy(t('progress.sheet'), async (progress) => {
    for (const [index, item] of list.entries()) {
      progress(index, list.length);
      canvases.push(await exportCanvas(item, size));
    }
  });
  const cols = Math.min(5, Math.ceil(Math.sqrt(list.length * 1.4)));
  const rows = Math.ceil(list.length / cols);
  const cellW = Math.max(...canvases.map((c) => c.width));
  const cellH = Math.max(...canvases.map((c) => c.height));
  const label = Math.round(cellW * 0.08);
  const gap = Math.round(cellW * 0.04);
  const sheet = document.createElement('canvas');
  sheet.width = cols * cellW + (cols + 1) * gap;
  sheet.height = rows * (cellH + label) + (rows + 1) * gap + label;
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = '#1d2433';
  ctx.font = `700 ${Math.round(label * 0.7)}px "Segoe UI", "Malgun Gothic", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(`${state.doc.name} — MyPhotoCut`, gap, gap + label / 2);
  canvases.forEach((canvas, i) => {
    const x = gap + (i % cols) * (cellW + gap);
    const y = gap + label + Math.floor(i / cols) * (cellH + label + gap);
    ctx.drawImage(canvas, x + (cellW - canvas.width) / 2, y + (cellH - canvas.height) / 2);
    ctx.font = `600 ${Math.round(label * 0.55)}px "Segoe UI", "Malgun Gothic", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${i + 1}. ${itemName(list[i])}`, x + cellW / 2, y + cellH + label / 2);
    ctx.textAlign = 'left';
  });
  return sheet;
}

async function exportSheet({ type, size, quality }) {
  if (!items().length) return;
  try {
    const cell = Math.max(320, Math.round(size / 3));
    const sheet = await buildSheet(cell);
    const bytes = await encodeCanvas(sheet, type, quality);
    const saved = await saveBytes(`${safeFileName(state.doc.name)}-sheet.${EXPORT_TYPES[type].ext}`, type, bytes);
    if (saved) notify('success', t('notice.exported', { name: baseName(saved) }));
  } catch (error) {
    showError('error.export', error);
  }
}

async function copyImage() {
  const item = selectedItem();
  if (!item) return;
  try {
    const canvas = await withBusy(t('progress.export'), () => exportCanvas(item, Math.min(1600, state.settings.exportSize)));
    if (desktop) {
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      await native.invoke('clipboard_write_image', { width: canvas.width, height: canvas.height, rgba: bytesToBase64(new Uint8Array(data.buffer)) });
    } else {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    }
    notify('success', t('notice.copied'));
  } catch (error) {
    showError('error.copy', error);
  }
}

/** The print window (printer, page setup, preview): it asks for the pictures with 'print-request'. */
function openPrint() {
  if (!state.doc) return;
  popups.open('print', { scope: 'selected', count: items().length, docName: state.doc.name, selected: selectedItem() ? itemName(selectedItem()) : '' });
}

/** Pictures to print (JPEG data: URLs, 1400 px): the selected caricature, all of them, or the contact sheet. */
async function printImages(scope) {
  const list = scope === 'all' ? items() : selectedItem() ? [selectedItem()] : items().slice(0, 1);
  if (scope === 'sheet') {
    const sheet = await buildSheet(420);
    return [{ name: `${state.doc.name} — ${t('export.scope.sheet')}`, url: sheet.toDataURL('image/jpeg', 0.9), width: sheet.width, height: sheet.height }];
  }
  const size = list.length > 1 ? 1000 : 1400;
  let done = 0;
  return withBusy(t('progress.print'), (progress) => Promise.all(list.map(async (item) => {
    // The workers draw several at once; the order of the list is kept.
    const canvas = await exportCanvas(item, size);
    progress(++done, list.length);
    return { name: itemName(item), url: canvas.toDataURL('image/jpeg', 0.88), width: canvas.width, height: canvas.height };
  })));
}

async function printSelected() {
  const item = selectedItem();
  if (!item) return;
  try {
    const canvas = await withBusy(t('progress.export'), () => exportCanvas(item, 1600));
    const area = root.querySelector('#print-area');
    area.innerHTML = `<img src="${canvas.toDataURL('image/png')}" alt="" /><p>${escapeHtml(itemName(item))} — ${escapeHtml(state.doc.name)}</p>`;
    await new Promise((resolve) => area.querySelector('img').decode().then(resolve, resolve));
    await native.printWindow();
  } catch (error) {
    showError('error.print', error);
  }
}

/** Runs a task with the progress popup when it takes a while; `progress(done, total)` updates it. */
async function withBusy(title, task) {
  let shown = false;
  let last = null;
  const timer = setTimeout(() => { shown = true; popups.open('progress', { title, name: state.doc?.name ?? '', last }); }, 300);
  try {
    return await task((done, total) => {
      last = { done, total };
      if (shown) popups.post('progress', { type: 'progress', done, total });
    });
  } finally {
    clearTimeout(timer);
    if (shown) { popups.post('progress', { type: 'done' }); setTimeout(() => popups.close('progress'), 250); }
  }
}

/** File reading/writing with the progress popup (the backend reports bytes for large files). */
async function withProgress(titleKey, name, task) {
  const op = `op-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  let shown = false;
  let last = null;
  const timer = setTimeout(() => { shown = true; popups.open('progress', { title: t(titleKey), name, op, last }); }, 250);
  const unlisten = await native.listen('io-progress', (progress) => {
    if (progress.op !== op) return;
    last = progress;
    if (shown) popups.post('progress', { type: 'progress', ...progress });
  });
  try {
    return await task(op);
  } finally {
    clearTimeout(timer);
    unlisten();
    if (shown) { popups.post('progress', { type: 'done' }); setTimeout(() => popups.close('progress'), 300); }
  }
}

// ───────────────────────── commands

const toggle = (key) => updateSettings({ [key]: !state.settings[key] });
const sameWarp = (a, b) => { const n = normalizeWarp(b); return Object.keys(n).every((k) => Math.abs(a[k] - n[k]) < 1e-6); };

const commands = {
  open: { icon: 'folderOpen', label: 'action.open', key: 'Ctrl+O', run: () => openWithDialog() },
  camera: { icon: 'camera', label: 'action.camera', key: 'Ctrl+Shift+O', run: () => openCamera() },
  pastePhoto: { icon: 'paste', label: 'action.pastePhoto', run: () => pastePhoto() },
  recent: { icon: 'recent', label: 'action.recent', run: () => popups.open('recent', {}), enabled: () => state.recent.length > 0 },
  startPage: { icon: 'home', label: 'action.startPage', key: 'Ctrl+Shift+H', run: () => showStartPage(!state.showStart), checked: () => state.showStart },
  save: { icon: 'save', label: 'action.save', key: 'Ctrl+S', enabled: hasDoc, run: () => saveDoc() },
  saveAs: { icon: 'saveAs', label: 'action.saveAs', key: 'Ctrl+Shift+S', enabled: hasDoc, run: () => saveDoc({ saveAs: true }) },
  exportImage: { icon: 'exportImage', label: 'action.exportImage', key: 'Ctrl+E', enabled: hasItem, run: () => openExport('selected') },
  exportAll: { icon: 'exportAll', label: 'action.exportAll', key: 'Ctrl+Shift+E', enabled: () => items().length > 0, run: () => openExport('all') },
  exportSheet: { icon: 'contactSheet', label: 'action.exportSheet', enabled: () => items().length > 0, run: () => openExport('sheet') },
  exportMenu: { icon: 'chevronDown', label: 'action.exportMenu', enabled: hasDoc, run: (c) => showMenu(menuItems(['exportImage', 'exportAll', 'exportSheet', '-', 'copyImage', 'print']), c?.anchor ?? anchorFor('exportMenu'), 'context', { header: { icon: 'exportImage', title: t('action.exportMenu') } }) },
  copyImage: { icon: 'copyImage', label: 'action.copyImage', key: 'Ctrl+Shift+C', enabled: hasItem, run: () => copyImage() },
  print: { icon: 'print', label: 'action.print', key: 'Ctrl+P', enabled: () => items().length > 0, run: () => openPrint() },
  closePhoto: { icon: 'closeTab', label: 'action.closePhoto', key: 'Ctrl+W', enabled: hasDoc, run: () => closePhoto() },
  exit: { icon: 'exit', label: 'action.exit', run: () => requestExit() },
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: () => Boolean(state.doc?.history.canUndo), run: undo, tip: () => (state.doc?.history.canUndo ? t('tip.undoWhat', { name: state.doc.history.undoLabel }) : '') },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: () => Boolean(state.doc?.history.canRedo), run: redo, tip: () => (state.doc?.history.canRedo ? t('tip.redoWhat', { name: state.doc.history.redoLabel }) : '') },
  duplicate: { icon: 'duplicate', label: 'action.duplicate', key: 'Ctrl+D', enabled: hasItem, run: () => duplicateItem() },
  vary: { icon: 'vary', label: 'action.vary', key: 'Ctrl+R', enabled: hasItem, run: () => varySelected() },
  delete: { icon: 'trash', label: 'action.delete', key: 'Delete', enabled: hasItem, run: () => deleteItem() },
  rename: { icon: 'rename', label: 'action.rename', key: 'F2', enabled: hasItem, run: () => renamePrompt() },
  prev: { icon: 'chevronLeft', label: 'action.prev', key: '←', enabled: () => items().length > 1, run: () => step(-1) },
  next: { icon: 'chevronRight', label: 'action.next', key: '→', enabled: () => items().length > 1, run: () => step(1) },
  generate: { icon: 'generate', label: 'action.generate', key: 'F5', enabled: () => Boolean(state.doc?.work), run: () => generateSet() },
  varyAll: { icon: 'regenerate', label: 'action.varyAll', key: 'Ctrl+Shift+R', enabled: () => items().length > 0, run: () => varyAll() },
  styleSet: { icon: 'styleSet', label: 'action.styleSet', run: () => openStyleSet() },
  addStyleMenu: { icon: 'plus', label: 'action.addStyle', enabled: hasDoc, run: (c) => styleMenu(c?.anchor ?? anchorFor('addStyleMenu')) },
  faceFind: { icon: 'faceFind', label: 'action.faceFind', key: 'Ctrl+Shift+F', enabled: () => Boolean(state.doc?.work) && !state.analysing, run: () => refindFace() },
  faceReset: { icon: 'faceReset', label: 'action.faceReset', enabled: () => Boolean(state.doc?.autoFeatures) && JSON.stringify(state.doc.autoFeatures) !== JSON.stringify(state.doc.features), run: () => resetFace() },
  landmarks: { icon: 'landmarks', label: 'action.landmarks', key: 'Ctrl+L', run: () => toggle('showLandmarks'), checked: () => state.settings.showLandmarks },
  cropFace: { icon: 'crop', label: 'action.cropFace', key: 'Ctrl+J', enabled: () => Boolean(state.doc?.work), run: () => toggleCrop(), checked: () => Boolean(state.doc?.autoCrop && state.doc?.crop) },
  warpStyle: { icon: 'refresh', label: 'action.warpStyle', enabled: () => hasItem() && !sameWarp(selectedItem().warp, { ...styleById(selectedItem().styleId).warp, strength: 1 }), run: () => warpPreset('style') },
  warpNone: { icon: 'original', label: 'action.warpNone', enabled: () => hasItem() && !sameWarp(selectedItem().warp, NO_WARP), run: () => warpPreset('none') },
  warpRandom: { icon: 'dice', label: 'action.warpRandom', enabled: hasItem, run: () => warpPreset('random') },
  warpPersonal: { icon: 'faceFind', label: 'action.warpPersonal', enabled: () => hasItem() && validFeatures(state.doc.features) && !sameWarp(selectedItem().warp, personalWarp(styleById(selectedItem().styleId).warp, distinctiveness(state.doc.features, state.settings.personalGain / 100))), run: () => warpPreset('personal') },
  personalAll: { icon: 'faceFind', label: 'action.personalAll', enabled: () => items().length > 0 && validFeatures(state.doc.features), run: () => personalAll() },
  optionsReset: { icon: 'refresh', label: 'action.optionsReset', enabled: () => hasItem() && JSON.stringify(selectedItem().options) !== JSON.stringify(normalizeOptions(selectedItem().styleId, styleById(selectedItem().styleId).options)), run: () => resetOptions() },
  reseed: { icon: 'dice', label: 'action.reseed', enabled: hasItem, run: () => reseed() },
  addEffectMenu: { icon: 'addEffect', label: 'action.addEffect', enabled: hasItem, run: (c) => effectMenu(c?.anchor ?? anchorFor('addEffectMenu')) },
  effectsToAll: { icon: 'gallery', label: 'action.effectsToAll', enabled: () => hasItem() && items().length > 1, run: () => effectsToAll() },
  effectsClear: { icon: 'trash', label: 'action.effectsClear', enabled: () => Boolean(selectedItem()?.effects.length), run: () => effectsClear() },
  effectsCopy: { icon: 'copy', label: 'action.effectsCopy', enabled: hasItem, run: () => copyEffects() },
  effectsPaste: { icon: 'paste', label: 'action.effectsPaste', enabled: () => hasItem() && Boolean(state.clipboardEffects), run: () => pasteEffects() },
  gallery: { icon: 'gallery', label: 'action.gallery', key: 'Ctrl+1', enabled: hasDoc, run: () => setView('gallery'), checked: () => hasDoc() && state.view === 'gallery' },
  single: { icon: 'viewSingle', label: 'action.single', key: 'Ctrl+2', enabled: hasItem, run: () => setView('single'), checked: () => hasDoc() && state.view === 'single' },
  compare: { icon: 'compare', label: 'action.compare', key: 'Ctrl+K', enabled: hasItem, run: () => { state.compare = !state.compare; if (state.view !== 'single') setView('single'); else renderSingle(); renderToolbarState(); }, checked: () => state.compare },
  zoomIn: { icon: 'zoomIn', label: 'action.zoomIn', key: 'Ctrl+=', enabled: hasItem, run: () => setZoom(zoomStep(effectiveZoom(), 1)) },
  zoomOut: { icon: 'zoomOut', label: 'action.zoomOut', key: 'Ctrl+-', enabled: hasItem, run: () => setZoom(zoomStep(effectiveZoom(), -1)) },
  zoomFit: { icon: 'fitPage', label: 'action.zoomFit', key: 'Ctrl+0', enabled: hasItem, run: () => setZoom(0), checked: () => state.view === 'single' && !state.zoom },
  zoom100: { icon: 'zoomReset', label: 'action.zoom100', enabled: hasItem, run: () => setZoom(100) },
  layoutMenu: {
    icon: 'layoutGrid', label: 'action.layout', key: 'Ctrl+3', enabled: hasDoc,
    run: (c) => showMenu(GALLERY_LAYOUTS.map((id) => ({ id: `custom:layout:${id}`, label: t(`layout.${id}`), icon: LAYOUT_ICONS[id], checked: state.settings.galleryLayout === id })), c?.anchor ?? anchorFor('layoutMenu'), 'context', {
      handlers: Object.fromEntries(GALLERY_LAYOUTS.map((id) => [`custom:layout:${id}`, () => setLayout(id)])), header: { icon: 'layoutGrid', title: t('action.layout') },
    }),
  },
  columnsMenu: { icon: 'gallery', label: 'action.columns', run: (c) => showMenu(GALLERY_COLUMNS.map((n) => ({ id: `custom:cols:${n}`, label: n ? t('action.columnsN', { n }) : t('action.columnsAuto'), icon: 'gallery', checked: state.settings.galleryColumns === n })), c?.anchor ?? anchorFor('columnsMenu'), 'context', { handlers: Object.fromEntries(GALLERY_COLUMNS.map((n) => [`custom:cols:${n}`, () => updateSettings({ galleryColumns: n })])), header: { icon: 'gallery', title: t('action.columns') } }) },
  showNames: { icon: 'rename', label: 'action.showNames', run: () => toggle('showNames'), checked: () => state.settings.showNames },
  leftPanel: { icon: 'panelLeft', label: 'action.leftPanel', key: 'Ctrl+Shift+1', run: () => toggle('showLeftPanel'), checked: () => state.settings.showLeftPanel },
  rightPanel: { icon: 'panelRight', label: 'action.rightPanel', key: 'Ctrl+Shift+2', run: () => toggle('showRightPanel'), checked: () => state.settings.showRightPanel },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', run: () => toggle('showStatusBar'), checked: () => state.settings.showStatusBar },
  theme: { icon: 'dice', label: 'action.themeRandom', run: () => randomTheme() },
  themeMenu: { icon: 'palette', label: 'action.themeChoose', run: (c) => openThemePicker(c?.anchor) },
  language: { icon: 'globe', label: 'action.language', key: 'Ctrl+Shift+L', run: () => updateSettings({ language: lang() === 'ko' ? 'en' : 'ko' }) },
  shuffleBackground: { icon: 'dice', label: 'action.shuffleBackground', key: 'Ctrl+Shift+B', run: () => shuffleBackground() },
  backgroundImage: { icon: 'imageBg', label: 'action.backgroundImage', run: () => chooseBackground() },
  clearBackground: { icon: 'imageClear', label: 'action.clearBackground', enabled: () => Boolean(state.settings.backgroundImage), run: () => removeBackground() },
  settings: { icon: 'gear', label: 'action.settings', key: 'Ctrl+,', run: () => popups.open('settings', { tab: 'general' }) },
  about: { icon: 'info', label: 'action.about', key: 'F1', run: () => popups.open('about', {}) },
  welcome: { icon: 'bulb', label: 'action.welcome', run: () => openWelcome() },
  userGuide: { icon: 'userGuide', label: 'action.userGuide', run: () => openDocWindow('guide') },
  shortcuts: { icon: 'keyboard', label: 'action.shortcuts', run: () => popups.open('settings', { tab: 'shortcuts' }) },
  sampleMenu: { icon: 'samples', label: 'action.samples', run: (c) => sampleMenu(c?.anchor ?? anchorFor('sampleMenu')) },
};

const SHORTCUTS = Object.entries(commands)
  .filter(([, c]) => c.key && c.key.startsWith('Ctrl+'))
  .map(([id, c]) => {
    const parts = c.key.split('+');
    const k = parts.at(-1).toLowerCase();
    return [k === '=' ? '=' : k, parts.includes('Shift'), id];
  });

function commandEnabled(id) {
  const command = commands[id];
  return Boolean(command) && (command.enabled ? command.enabled() : true);
}

function commandTip(id) {
  const command = commands[id];
  if (!command) return id;
  const extra = command.tip?.() || t(`tip.${id}`, null, '');
  return `${t(command.label)}${command.key ? ` (${keyLabel(command.key)})` : ''}${extra ? ` — ${extra}` : ''}`;
}

async function run(id, context) {
  const command = commands[id];
  if (!command || !commandEnabled(id)) return undefined;
  try {
    return await command.run(context);
  } catch (error) {
    return showError('error.command', error, id);
  }
}

// ───────────────────────── layout

const MENUS = {
  file: ['open', 'camera', 'pastePhoto', 'sampleMenu', 'recent', 'startPage', '-', 'save', 'saveAs', '-', 'exportImage', 'exportAll', 'exportSheet', 'copyImage', '-', 'print', '-', 'closePhoto', 'exit'],
  edit: ['undo', 'redo', '-', 'duplicate', 'vary', 'rename', 'delete', '-', 'prev', 'next'],
  caricature: ['generate', 'varyAll', 'addStyleMenu', 'styleSet', '-', 'warpPersonal', 'personalAll', 'warpStyle', 'warpNone', 'warpRandom', '-', 'optionsReset', 'reseed', '-', 'faceFind', 'faceReset', 'landmarks', 'cropFace'],
  effects: ['addEffectMenu', '-', 'effectsCopy', 'effectsPaste', 'effectsToAll', 'effectsClear'],
  view: ['gallery', 'single', 'compare', 'layoutMenu', '-', 'zoomIn', 'zoomOut', 'zoomFit', 'zoom100', '-', 'columnsMenu', 'showNames', '-', 'leftPanel', 'rightPanel', 'statusBar', '-', 'themeMenu', 'theme', 'language', 'shuffleBackground', 'backgroundImage', 'clearBackground'],
  help: ['welcome', 'userGuide', 'shortcuts', '-', 'settings', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', caricature: 'generate', effects: 'addEffect', view: 'eye', help: 'question' };

// Toolbar: every button shows its icon and name (names hide only when the window is narrow).
const TOOLBAR = [
  ['open', 'camera', 'save', 'print', 'exportSplit'],
  ['undo', 'redo'],
  ['generate', 'vary', 'styleSet', 'addEffectMenu'],
  ['faceFind', 'landmarks', 'cropFace'],
  ['gallery', 'single', 'compare', 'layoutMenu'],
  ['zoom'],
  ['leftPanel', 'rightPanel'],
];
const TOOLBAR_RIGHT = ['themeSplit', 'language', 'settings', 'about'];
const SHORT_LABELS = {
  open: 'tool.open', camera: 'tool.camera', save: 'tool.save', print: 'tool.print', exportImage: 'tool.export', undo: 'tool.undo', redo: 'tool.redo', generate: 'tool.generate', vary: 'tool.vary',
  styleSet: 'tool.styleSet', addEffectMenu: 'tool.effect', faceFind: 'tool.faceFind', landmarks: 'tool.landmarks', cropFace: 'tool.cropFace', gallery: 'tool.gallery', single: 'tool.single', compare: 'tool.compare',
  zoomFit: 'tool.zoomFit', layoutMenu: 'tool.layout', leftPanel: 'tool.leftPanel', rightPanel: 'tool.rightPanel', theme: 'tool.theme', language: 'tool.language', settings: 'tool.settings', about: 'tool.about',
};
const toolLabel = (id) => t(SHORT_LABELS[id] ?? commands[id].label).replace(/…$/, '');

function renderShell() {
  root.innerHTML = `
    <div class="app-bg" aria-hidden="true"><canvas class="anim-bg"></canvas><div class="image-bg"></div></div>
    <nav id="menubar" role="menubar"></nav>
    <div id="toolbar" role="toolbar"></div>
    <main id="workspace">
      <aside id="left-panel" class="side-panel" aria-label="${escapeHtml(t('panel.photo'))}"></aside>
      <div class="splitter vertical panel-split" data-split="left" title="${escapeHtml(t('tip.panelSplitter'))}" role="separator" aria-orientation="vertical"></div>
      <section id="center">
        <div id="tabs"></div>
        <div id="center-body">
          <div id="view-host" class="view-host"></div>
          <div id="start-page" hidden></div>
          <div class="drop-overlay" aria-hidden="true"><div>${icon('drop')}<span>${escapeHtml(t('drop.hint'))}</span></div></div>
        </div>
      </section>
      <div class="splitter vertical panel-split" data-split="right" title="${escapeHtml(t('tip.panelSplitter'))}" role="separator" aria-orientation="vertical"></div>
      <aside id="right-panel" class="side-panel" aria-label="${escapeHtml(t('panel.properties'))}"></aside>
    </main>
    <footer id="statusbar" role="status"></footer>
    ${desktop ? `<div class="resize-grip" data-resize-grip title="${escapeHtml(t('tip.resize'))}" aria-label="${escapeHtml(t('tip.resize'))}" role="separator">${icon('grip')}</div>` : `<div class="resize-grip static" title="${escapeHtml(t('tip.resize'))}" aria-hidden="true">${icon('grip')}</div>`}
    <div id="print-area" aria-hidden="true"></div>`;
}

function renderMenubar() {
  const menubar = root.querySelector('#menubar');
  const onStart = state.showStart;
  const home = `<button class="menubar-item menubar-home ${onStart ? 'current' : ''}" data-home title="${escapeHtml(t('tip.home'))}" aria-label="${escapeHtml(t('menu.home'))}" aria-pressed="${onStart}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button><span class="menubar-sep" aria-hidden="true"></span>`;
  const brand = `<div class="app-brand" data-window-drag title="${escapeHtml(`MyPhotoCut v${VERSION}`)}"><img class="app-brand-icon" src="${APP_ICON}" alt="" data-window-drag /><span class="app-brand-name" data-window-drag>MyPhotoCut</span><span class="app-brand-version" data-window-drag>v${escapeHtml(VERSION)}</span></div>`;
  // Home and the menus follow the version at once; the open photo's name sits after the menus.
  const project = `<span class="app-brand-project" data-window-drag><span class="app-brand-project-name" data-window-drag></span><span class="app-brand-dirty" data-window-drag>●</span></span>`;
  const button = (id, glyph, key) => `<button class="window-button ${id === 'close' ? 'close' : ''}" data-window="${id}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(glyph)}</button>`;
  const controls = desktop ? `<div class="window-controls">${button('minimize', 'winMinimize', 'window.minimize')}${state.maximized ? button('maximize', 'winRestore', 'window.restore') : button('maximize', 'winMaximize', 'window.maximize')}${button('close', 'winClose', 'window.close')}</div>` : '';
  menubar.innerHTML = brand + home + Object.keys(MENUS).map((name) => `
    <button class="menubar-item ${state.openMenu === name ? 'open' : ''}" data-menu="${name}" role="menuitem" aria-haspopup="true" title="${escapeHtml(t(`menu.${name}`))}">${icon(MENU_ICONS[name])}<span>${escapeHtml(t(`menu.${name}`))}</span></button>`).join('')
    + `<div class="menubar-drag" data-window-drag>${project}</div>${controls}`;
  renderTitleProject();
}

function renderTitleProject() {
  const box = root.querySelector('.app-brand-project');
  if (!box) return;
  const d = state.showStart ? null : state.doc;
  box.classList.toggle('empty', !d);
  box.classList.toggle('dirty', Boolean(d?.dirty));
  box.querySelector('.app-brand-project-name').textContent = d ? docName() : '';
  box.title = d ? `${d.path ?? docName()}${d.dirty ? ` (${t('status.modified')})` : ''}` : '';
  document.title = d ? `${docName()}${d.dirty ? ' ●' : ''} — MyPhotoCut` : `MyPhotoCut v${VERSION}`;
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
  for (const type of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(type, () => mark('myphotocut.main.input'), { capture: true, passive: true });
  window.addEventListener('focus', () => mark('myphotocut.main.focus'));
}

let toolbarLanguage = null;

function renderToolbar() {
  const toolbar = root.querySelector('#toolbar');
  toolbarLanguage = getLanguage();
  const plain = (id, extra = '', labelled = true) => {
    const command = commands[id];
    const glyph = id === 'language' ? switchFlag(getLanguage()) : icon(id === 'layoutMenu' ? LAYOUT_ICONS[state.settings.galleryLayout] : command.icon);
    return `<button class="tool-button ${labelled ? 'tool-labeled' : ''} ${extra}" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(command.label))}">${glyph}${labelled ? `<span class="tool-label">${escapeHtml(toolLabel(id))}</span>` : ''}</button>`;
  };
  const button = (id) => {
    if (id === 'zoom') {
      return `<span class="stepper toolbar-zoom" title="${escapeHtml(t('tip.zoomValue'))}">
        <button class="tool-button stepper-button-tool" data-command="zoomOut" title="${escapeHtml(commandTip('zoomOut'))}" aria-label="${escapeHtml(t('action.zoomOut'))}">${icon('minus')}</button>
        <input class="stepper-value" id="zoom-value" type="text" inputmode="decimal" value="${state.zoom ? `${state.zoom}%` : t('zoom.fit')}" title="${escapeHtml(t('tip.zoomValue'))}" aria-label="${escapeHtml(t('tip.zoomValue'))}" />
        <button class="tool-button stepper-button-tool" data-command="zoomIn" title="${escapeHtml(commandTip('zoomIn'))}" aria-label="${escapeHtml(t('action.zoomIn'))}">${icon('plus')}</button>
      </span>${plain('zoomFit')}`;
    }
    if (id === 'exportSplit') return `<span class="split-button">${plain('exportImage')}<button class="tool-button split-arrow" data-command="exportMenu" title="${escapeHtml(commandTip('exportMenu'))}" aria-label="${escapeHtml(t('action.exportMenu'))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
    if (id === 'themeSplit') return `<span class="split-button">${plain('theme')}<button class="tool-button split-arrow" data-command="themeMenu" title="${escapeHtml(commandTip('themeMenu'))}" aria-label="${escapeHtml(t('action.themeChoose'))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
    return plain(id);
  };
  toolbar.innerHTML = `<div class="toolbar-inner">
    <div class="toolbar-left">${TOOLBAR.map((group) => `<div class="tool-group">${group.map(button).join('')}</div>`).join('<span class="tool-sep" aria-hidden="true"></span>')}</div>
    <span class="grow"></span>
    <div class="toolbar-right tool-group">${TOOLBAR_RIGHT.map(button).join('')}</div>
  </div>`;
  renderToolbarState();
  fitToolbar();
}

function renderToolbarState() {
  for (const element of root.querySelectorAll('#toolbar [data-command], #left-panel [data-command], #right-panel [data-command]')) {
    const id = element.dataset.command;
    if (!commands[id]) continue;
    element.disabled = !commandEnabled(id);
    if (element.closest('#toolbar')) element.title = commandTip(id);
    const checked = commands[id]?.checked?.();
    element.classList.toggle('active', Boolean(checked));
    if (checked !== undefined) element.setAttribute('aria-pressed', String(Boolean(checked)));
  }
  const zoom = root.querySelector('#zoom-value');
  if (zoom && document.activeElement !== zoom) zoom.value = state.zoom ? `${state.zoom}%` : t('zoom.fit');
}

/**
 * Labels hide when the toolbar does not fit (icons stay); the window can never be narrower than
 * the toolbar with its labels hidden, so no button is ever cut off.
 */
function fitToolbar() {
  const toolbar = root.querySelector('#toolbar');
  const left = root.querySelector('.toolbar-left');
  const right = root.querySelector('.toolbar-right');
  if (!toolbar || !left || !right) return;
  requestAnimationFrame(() => {
    toolbar.classList.remove('compact');
    const style = getComputedStyle(toolbar);
    const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 26;
    const full = left.scrollWidth + right.scrollWidth + pad;
    if (full > toolbar.clientWidth) toolbar.classList.add('compact');
    const compactWidth = toolbar.classList.contains('compact') ? left.scrollWidth + right.scrollWidth + pad : (() => { toolbar.classList.add('compact'); const w = left.scrollWidth + right.scrollWidth + pad; toolbar.classList.remove('compact'); return w; })();
    const menus = [...root.querySelectorAll('.app-brand, .menubar-item, .window-controls')].reduce((sum, el) => sum + el.offsetWidth + 2, 48);
    const width = Math.ceil(Math.max(menus, compactWidth, PANEL_MIN.left + PANEL_MIN.right + 360));
    if (Math.abs(width - state.minWidth) < 1) return;
    state.minWidth = width;
    document.documentElement.style.setProperty('--min-width', `${width}px`);
    native.setMinimumSize(width, 640).catch(() => {});
  });
}

// ───────────────────────── left panel (photo)

function renderLeft() {
  const panel = root.querySelector('#left-panel');
  if (!panel) return;
  const scroll = panel.scrollTop;
  panel.innerHTML = leftPanelHtml(appApi);
  panel.scrollTop = scroll;
  renderLeftMarks();
  renderToolbarState();
}

function renderLeftMarks() {
  const svg = root.querySelector('#source-marks');
  const d = state.doc;
  if (!svg || !d) return;
  svg.setAttribute('viewBox', `0 0 ${d.photo.width} ${d.photo.height}`);
  svg.innerHTML = marksSvg(d.features, d.photo.width, d.photo.height, d.autoCrop ? d.crop : null);
  svg.classList.toggle('hidden', !state.settings.showLandmarks);
}

/** Dragging a face point on the photo. */
function startHandleDrag(event, handle) {
  const d = state.doc;
  const svg = root.querySelector('#source-marks');
  if (!d || !svg) return;
  event.preventDefault();
  const rect = svg.getBoundingClientRect();
  const scale = d.photo.width / rect.width;
  const before = snapshot();
  const start = clone(d.features);
  const which = handle.dataset.handle;
  const origin = { x: event.clientX, y: event.clientY };
  const point = (id, f) => ({ face: { x: f.face.cx, y: f.face.cy }, eyeL: f.eyes[0], eyeR: f.eyes[1], nose: f.nose, mouth: f.mouth, chin: f.chin, forehead: f.forehead })[id];
  const p0 = point(which, start);
  pointerDrag(event, {
    threshold: 1,
    cursor: 'grabbing',
    move: (dx, dy, e) => {
      const x = Math.max(0, Math.min(d.photo.width, p0.x + (e.clientX - origin.x) * scale));
      const y = Math.max(0, Math.min(d.photo.height, p0.y + (e.clientY - origin.y) * scale));
      d.features = moveFeature(start, which, x, y);
      renderLeftMarks();
    },
    end: (e, moved) => {
      if (!moved) return;
      d.history.push(before, t('op.movePoint', { name: t(`face.point.${which}`) }));
      d.dirty = true;
      renderLeft();
      afterChange('all');
    },
  });
}

// ───────────────────────── centre (gallery / large view)

function renderTabs() {
  const tabs = root.querySelector('#tabs');
  if (!tabs) return;
  if (!state.doc || state.showStart) { tabs.innerHTML = ''; return; }
  const count = items().length;
  const tab = (view, glyph, label, enabled = true) => `<button class="tab ${state.view === view ? 'active' : ''}" data-command="${view}" ${enabled ? '' : 'disabled'} title="${escapeHtml(commandTip(view))}">${icon(glyph)}<span class="tab-name">${escapeHtml(label)}</span></button>`;
  tabs.innerHTML = `<div class="tab-strip"><div class="tab-list">${tab('gallery', 'gallery', t('view.galleryCount', { count }))}${tab('single', 'viewSingle', selectedItem() ? t('view.singleName', { name: itemName(selectedItem()) }) : t('action.single'), hasItem())}</div></div>
    <span class="grow"></span>
    <span class="tab-tools">
      <button class="small-button" data-command="addStyleMenu" title="${escapeHtml(commandTip('addStyleMenu'))}">${icon('plus')}<span>${escapeHtml(t('action.addStyle'))}</span></button>
      <button class="small-button" data-command="varyAll" title="${escapeHtml(commandTip('varyAll'))}">${icon('regenerate')}<span>${escapeHtml(t('action.varyAll'))}</span></button>
      <button class="small-button" data-command="columnsMenu" title="${escapeHtml(commandTip('columnsMenu'))}">${icon('gallery')}<span>${escapeHtml(state.settings.galleryColumns ? t('action.columnsN', { n: state.settings.galleryColumns }) : t('action.columnsAuto'))}</span></button>
    </span>`;
}

function renderCenter() {
  const host = root.querySelector('#view-host');
  const startHost = root.querySelector('#start-page');
  const onStart = state.showStart;
  startHost.hidden = !onStart;
  host.hidden = onStart;
  renderTabs();
  if (onStart) { host.innerHTML = ''; renderStartPage(); return; }
  stopStartPage();
  if (!state.doc) {
    host.innerHTML = `<div class="gallery-empty">${icon('photo', 'icon big')}<p>${escapeHtml(t('view.noPhoto'))}</p>
      <div class="button-row"><button class="button primary" data-command="open">${icon('folderOpen')}<span>${escapeHtml(t('action.open'))}</span></button><button class="button" data-command="camera">${icon('camera')}<span>${escapeHtml(t('action.camera'))}</span></button><button class="button" data-command="sampleMenu">${icon('samples')}<span>${escapeHtml(t('action.samples'))}</span></button></div></div>`;
    renderToolbarState();
    return;
  }
  if (state.view === 'single' && selectedItem()) {
    host.innerHTML = `<div class="single-view ${state.compare ? 'comparing' : ''}" id="single-view">
      <button class="nav-arrow left" data-command="prev" title="${escapeHtml(commandTip('prev'))}" aria-label="${escapeHtml(t('action.prev'))}">${icon('chevronLeft')}</button>
      <div class="single-stage" id="single-stage"><div class="single-canvas" id="single-canvas"></div></div>
      <button class="nav-arrow right" data-command="next" title="${escapeHtml(commandTip('next'))}" aria-label="${escapeHtml(t('action.next'))}">${icon('chevronRight')}</button>
      <div class="film-bar">
        <button class="film-nav" data-film="-1" title="${escapeHtml(t('tip.filmLeft'))}" aria-label="${escapeHtml(t('tip.filmLeft'))}">${icon('chevronLeft')}</button>
        <div class="filmstrip" id="filmstrip"></div>
        <button class="film-nav" data-film="1" title="${escapeHtml(t('tip.filmRight'))}" aria-label="${escapeHtml(t('tip.filmRight'))}">${icon('chevronRight')}</button>
      </div>
    </div>`;
    renderSingle();
    renderFilmstrip();
  } else {
    state.view = 'gallery';
    host.innerHTML = `<div class="gallery-wrap"><div class="gallery" id="gallery" role="listbox" aria-label="${escapeHtml(t('view.gallery'))}"></div>
      <button class="strip-nav left" data-strip="-1" title="${escapeHtml(t('tip.filmLeft'))}" aria-label="${escapeHtml(t('tip.filmLeft'))}">${icon('chevronLeft')}</button>
      <button class="strip-nav right" data-strip="1" title="${escapeHtml(t('tip.filmRight'))}" aria-label="${escapeHtml(t('tip.filmRight'))}">${icon('chevronRight')}</button></div>`;
    const gallery = host.querySelector('#gallery');
    gallery.addEventListener('scroll', frameThrottle(updateStripNav), { passive: true });
    renderGallery();
  }
  renderToolbarState();
}

const LAYOUT_ICONS = { grid: 'layoutGrid', large: 'layoutLarge', compact: 'layoutCompact', list: 'layoutList', strip: 'layoutStrip' };

/** Columns of the gallery: the chosen number (grid, large) or what the layout and the width give. */
function galleryColumns(width) {
  const layout = state.settings.galleryLayout;
  if (layout === 'list' || layout === 'strip') return 1;
  if (layout === 'compact') return Math.max(3, Math.round(width / 150));
  const fixed = state.settings.galleryColumns;
  if (fixed) return layout === 'large' ? Math.max(1, Math.ceil(fixed / 2)) : fixed;
  return layout === 'large' ? Math.max(1, Math.min(4, Math.round(width / 440))) : Math.max(2, Math.min(6, Math.round(width / 260)));
}

function setLayout(id) {
  updateSettings({ galleryLayout: id }, { quiet: true });
  renderToolbar();
  if (state.view !== 'gallery') setView('gallery'); else renderGallery();
  renderToolbarState();
  notify('info', t('notice.layout', { name: t(`layout.${id}`) }));
}

function renderGallery() {
  if (state.view === 'single') { renderFilmstrip(); renderTabs(); return; }
  const gallery = root.querySelector('#gallery');
  if (!gallery || !state.doc) return;
  const list = items();
  if (!list.length) {
    gallery.innerHTML = `<div class="gallery-empty">${icon('generate', 'icon big')}<p>${escapeHtml(t('view.empty'))}</p><button class="button primary" data-command="generate">${icon('generate')}<span>${escapeHtml(t('action.generate'))}</span></button></div>`;
    renderTabs();
    return;
  }
  for (const id of GALLERY_LAYOUTS) gallery.classList.toggle(`layout-${id}`, state.settings.galleryLayout === id);
  const cols = galleryColumns(gallery.clientWidth || 1000);
  gallery.style.setProperty('--cols', String(cols));
  setStripWidth(gallery);
  gallery.style.setProperty('--aspect', `${Math.round(state.doc.region?.w ?? state.doc.photo.width)} / ${Math.round(state.doc.region?.h ?? state.doc.photo.height)}`);
  gallery.innerHTML = list.map((item, index) => {
    const result = state.results.get(item.id);
    return galleryCardHtml(item, { selected: item.id === state.doc.selected, busy: Boolean(result?.busy) || !result?.canvas, ms: result?.ms, index, showNames: state.settings.showNames });
  }).join('');
  for (const item of list) placeCardCanvas(item.id);
  renderTabs();
  requestAnimationFrame(updateStripNav);
}

/** Puts a caricature's canvas into its card (a copy: the large view uses the original). */
function placeCardCanvas(id) {
  const result = state.results.get(id);
  const card = root.querySelector(`.cari-card[data-item="${CSS.escape(id)}"]`);
  if (card) {
    card.classList.toggle('busy', Boolean(result?.busy) || !result?.canvas);
    const thumb = card.querySelector('.cari-thumb');
    const existing = thumb.querySelector('img');
    if (result?.canvas) {
      const img = existing ?? document.createElement('img');
      img.alt = '';
      img.draggable = false;
      if (img.dataset.stamp !== String(result.ms) + result.canvas.width) {
        img.src = result.canvas.toDataURL('image/jpeg', 0.9);
        img.dataset.stamp = String(result.ms) + result.canvas.width;
      }
      if (!existing) thumb.append(img);
      const ms = card.querySelector('.cari-ms');
      if (ms) ms.textContent = result.ms ? `${result.ms} ms` : '';
    }
  }
  const film = root.querySelector(`.film-item[data-item="${CSS.escape(id)}"]`);
  if (film && result?.canvas) {
    const img = film.querySelector('img') ?? film.appendChild(document.createElement('img'));
    img.src = result.canvas.toDataURL('image/jpeg', 0.7);
  }
  renderStatus();
}

function markCardBusy(id, busy) {
  root.querySelector(`.cari-card[data-item="${CSS.escape(id)}"]`)?.classList.toggle('busy', busy);
}

function renderFilmstrip() {
  const strip = root.querySelector('#filmstrip');
  if (!strip) return;
  strip.innerHTML = items().map((item, i) => `<button class="film-item ${item.id === state.doc.selected ? 'selected' : ''}" data-item="${escapeHtml(item.id)}" title="${escapeHtml(`${i + 1}. ${itemName(item)}`)}"></button>`).join('');
  for (const item of items()) {
    const result = state.results.get(item.id);
    if (result?.canvas) {
      const img = document.createElement('img');
      img.src = result.canvas.toDataURL('image/jpeg', 0.7);
      img.alt = '';
      strip.querySelector(`.film-item[data-item="${CSS.escape(item.id)}"]`)?.append(img);
    }
  }
  strip.querySelector('.film-item.selected')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  if (!strip.dataset.bound) { strip.dataset.bound = '1'; strip.addEventListener('scroll', frameThrottle(updateFilmNav), { passive: true }); }
  requestAnimationFrame(updateFilmNav);
}

/** The strip layout's ‹ › buttons: off at the ends. */
function updateStripNav() {
  const g = root.querySelector('#gallery');
  if (!g) return;
  const [left, right] = root.querySelectorAll('.strip-nav');
  if (left) left.disabled = g.scrollLeft <= 1;
  if (right) right.disabled = g.scrollLeft + g.clientWidth >= g.scrollWidth - 1;
}

/** The film strip moves a page left or right; its buttons are off at the ends. */
function scrollFilm(direction) {
  const strip = root.querySelector('#filmstrip');
  if (!strip) return;
  strip.scrollBy({ left: direction * Math.max(120, strip.clientWidth * 0.8), behavior: 'smooth' });
  setTimeout(updateFilmNav, 350);
}

function updateFilmNav() {
  const strip = root.querySelector('#filmstrip');
  if (!strip) return;
  const [left, right] = root.querySelectorAll('.film-nav');
  if (left) left.disabled = strip.scrollLeft <= 1;
  if (right) right.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
}

function renderSingle() {
  const holder = root.querySelector('#single-canvas');
  const item = selectedItem();
  if (!holder || !item) return;
  for (const film of root.querySelectorAll('.film-item')) film.classList.toggle('selected', film.dataset.item === item.id);
  const result = state.results.get(item.id);
  root.querySelector('#single-view')?.classList.toggle('comparing', state.compare);
  if (!result?.canvas) { holder.innerHTML = `<div class="single-wait"><span class="cari-spinner"></span><span>${escapeHtml(t('view.drawing'))}</span></div>`; return; }
  const zoom = effectiveZoom() / 100;
  const w = Math.round(result.canvas.width * zoom);
  const h = Math.round(result.canvas.height * zoom);
  holder.style.width = `${w}px`;
  holder.style.height = `${h}px`;
  holder.innerHTML = '';
  const shown = document.createElement('canvas');
  shown.width = result.canvas.width;
  shown.height = result.canvas.height;
  shown.getContext('2d').drawImage(result.canvas, 0, 0);
  shown.className = 'single-result';
  holder.append(shown);
  if (state.compare) {
    const original = document.createElement('img');
    original.src = state.doc.regionUrl ?? state.doc.photo.data;
    original.className = 'single-original';
    original.alt = t('view.original');
    original.style.clipPath = `inset(0 ${100 - state.comparePos}% 0 0)`;
    const bar = document.createElement('div');
    bar.className = 'compare-bar';
    bar.style.left = `${state.comparePos}%`;
    bar.title = t('tip.compareBar');
    bar.innerHTML = `<span>${icon('compare')}</span><b class="compare-label left">${escapeHtml(t('view.original'))}</b><b class="compare-label right">${escapeHtml(t('view.caricature'))}</b>`;
    holder.append(original, bar);
  }
  renderStatus();
}

// ───────────────────────── right panel (properties)

function renderRight() {
  const panel = root.querySelector('#right-panel');
  if (!panel) return;
  const focused = document.activeElement;
  if (focused && panel.contains(focused) && focused.matches('input[type="text"]:not(.stepper-value)')) return; // typing a name or caption
  const scroll = panel.scrollTop;
  panel.innerHTML = rightPanelHtml(appApi);
  panel.scrollTop = scroll;
  renderToolbarState();
}

// ───────────────────────── status bar

function renderStatus() {
  const bar = root.querySelector('#statusbar');
  if (!bar) return;
  const s = state.settings;
  const notice = state.notice;
  const d = state.doc;
  const out = [];
  out.push(`<span class="status-notice ${notice?.kind ?? ''}" title="${escapeHtml(notice?.text ?? t('status.ready'))}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(notice?.text ?? t('status.ready'))}</span></span>`);
  if (d && !state.showStart) {
    const busy = [...state.results.values()].filter((r) => r.busy).length;
    if (state.analysing) out.push(`<span class="status-item busy" title="${escapeHtml(t('status.analysing'))}"><span class="cari-spinner small"></span><span>${escapeHtml(t('status.analysing'))}</span></span>`);
    else if (busy) out.push(`<span class="status-item busy" title="${escapeHtml(t('status.drawingTip'))}"><span class="cari-spinner small"></span><span>${escapeHtml(t('status.drawing', { count: busy }))}</span></span>`);
    out.push(`<span class="status-item" title="${escapeHtml(d.photo.name)}">${icon('photo')}<span>${escapeHtml(`${d.photo.width} × ${d.photo.height}`)}</span></span>`);
    out.push(`<span class="status-item" title="${escapeHtml(t('panel.faceMethod'))}">${icon('faceFind')}<span>${escapeHtml(t(`face.method.${d.features?.method ?? 'default'}`))}</span></span>`);
    out.push(`<span class="status-item" title="${escapeHtml(t('status.countTip'))}">${icon('gallery')}<span>${escapeHtml(t('status.count', { count: items().length }))}</span></span>`);
    out.push(`<span class="status-item ${d.dirty ? 'modified' : 'saved'}" title="${escapeHtml(d.path ?? t('status.unsavedFile'))}">${icon(d.dirty ? 'edit' : 'save')}<span>${escapeHtml(d.dirty ? t('status.modified') : t('status.saved'))}</span></span>`);
    if (state.view === 'single' && selectedItem()) out.push(`<button class="status-item" data-command="zoomFit" title="${escapeHtml(commandTip('zoomFit'))}">${icon('zoomIn')}<span>${effectiveZoom()}%</span></button>`);
  }
  out.push(`<span class="status-item" title="${escapeHtml(t('status.theme', { name: themeName(s.theme, getLanguage()) }))}">${icon('palette')}<span>${escapeHtml(themeName(s.theme, getLanguage()))}</span></span>`);
  if (s.statusClock) out.push(`<span class="status-item clock" title="${escapeHtml(t('status.clock'))}">${icon('clock')}<span id="status-clock">${escapeHtml(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span></span>`);
  bar.innerHTML = out.join('');
}

function renderAll() {
  root.classList.toggle('no-status', !state.settings.showStatusBar);
  root.classList.toggle('no-left', !state.settings.showLeftPanel);
  root.classList.toggle('no-right', !state.settings.showRightPanel);
  root.classList.toggle('on-start', state.showStart);
  root.style.setProperty('--left-width', `${state.settings.leftWidth}px`);
  root.style.setProperty('--right-width', `${state.settings.rightWidth}px`);
  root.style.setProperty('--zoom', String(state.settings.zoom / 100));
  renderMenubar();
  if (toolbarLanguage !== getLanguage()) renderToolbar(); else renderToolbarState();
  renderLeft();
  renderCenter();
  renderRight();
  renderStatus();
  updateBackgroundState();
}

// ───────────────────────── start page

let startCards = null;

function renderStartPage() {
  const host = root.querySelector('#start-page');
  const scrollTop = host.querySelector('.start-scroll')?.scrollTop ?? 0;
  startCards?.destroy();
  host.innerHTML = startPageHtml(appApi);
  startCards = startBoard(host.querySelector('.start-board'), {
    saved: state.settings.startLayout,
    reduced: Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    onSave: (layout) => { state.settings.startLayout = layout; storeSettings(globalThis.localStorage, state.settings); },
  });
  host.querySelector('.start-scroll').scrollTop = scrollTop;
  const canvas = host.querySelector('.start-bg');
  startBackground?.destroy();
  startBackground = new AnimatedBackground(canvas, { colors: backgroundColors, speed: () => state.settings.animationSpeed / 100, kind: state.settings.animation, vivid: true });
  if (state.settings.backgroundKind === 'animated') startBackground.start();
  else startBackground.draw();
  canvas.classList.toggle('static', state.settings.backgroundKind !== 'animated');
  host.querySelector('.start-scroll').style.setProperty('--start-image', state.backgroundUrl && state.settings.backgroundKind === 'image' ? `url("${state.backgroundUrl}")` : 'none');
  host.classList.toggle('with-image', Boolean(state.backgroundUrl) && state.settings.backgroundKind === 'image');
}

function stopStartPage() {
  startCards?.destroy();
  startCards = null;
  startBackground?.destroy();
  startBackground = null;
  const host = root.querySelector('#start-page');
  if (host) host.innerHTML = '';
}

function showStartPage(show = true) {
  state.showStart = show;
  renderAll();
}

function toggleDefaultStyle(id) {
  const set = new Set(state.settings.styleSet);
  if (set.has(id)) { if (set.size > 1) set.delete(id); } else set.add(id);
  updateSettings({ styleSet: STYLES.map((s) => s.id).filter((s) => set.has(s)) });
}

async function onStartAction(target) {
  const value = target.dataset.value;
  switch (target.dataset.start) {
    case 'open': return openWithDialog();
    case 'camera': return openCamera();
    case 'paste': return pastePhoto();
    case 'continue': return showStartPage(false);
    case 'styles': return openStyleSet();
    case 'toggle-style': return toggleDefaultStyle(value);
    case 'open-recent': return openRecent(value);
    case 'remove-recent': state.recent = removeRecent(state.recent, value); storeRecent(globalThis.localStorage, state.recent); return renderStartPage();
    case 'clear-recent': state.recent = []; storeRecent(globalThis.localStorage, []); notify('success', t('notice.recentCleared')); return renderStartPage();
    case 'open-folder': return openWithDialog(value);
    case 'remove-folder': state.recentDirs = removeRecent(state.recentDirs, value); storeRecentDirs(globalThis.localStorage, state.recentDirs); return renderStartPage();
    case 'clear-folders': state.recentDirs = []; storeRecentDirs(globalThis.localStorage, []); return renderStartPage();
    case 'sample': return openSample(value);
    case 'arrange': return startCards?.arrange();
    case 'pick-theme': return updateSettings({ theme: value });
    case 'theme-settings': return popups.open('settings', { tab: 'appearance' });
    case 'start-settings': return popups.open('settings', { tab: 'start' });
    case 'settings': return run('settings');
    case 'language': return run('language');
    case 'about': return run('about');
    case 'exit': return run('exit');
    case 'guide': return openDocWindow('guide');
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
  const onStart = state.showStart;
  const animated = s.backgroundKind === 'animated' && !onStart && !s.animationOnStartOnly && s.backgroundOpacity > 0;
  layer.classList.toggle('animated', animated);
  layer.classList.toggle('image', s.backgroundKind === 'image' && Boolean(state.backgroundUrl));
  layer.style.setProperty('--bg-opacity', String(s.backgroundOpacity / 100));
  const image = layer.querySelector('.image-bg');
  const fit = s.backgroundFit;
  image.style.backgroundImage = state.backgroundUrl && s.backgroundKind === 'image' ? `url("${state.backgroundUrl}")` : 'none';
  image.style.backgroundSize = { cover: 'cover', contain: 'contain', tile: 'auto', center: 'auto', stretch: '100% 100%' }[fit];
  image.style.backgroundRepeat = fit === 'tile' ? 'repeat' : 'no-repeat';
  if (animated) appBackground.start(); else appBackground.stop();
  if (onStart && startBackground) {
    if (s.backgroundKind === 'animated') startBackground.start(); else { startBackground.stop(); startBackground.draw(); }
  }
}

let startBackgroundChangedAt = Date.now();
const randomAnimation = (current) => { const others = ANIMATIONS.filter((kind) => kind !== current); return others[Math.floor(Math.random() * others.length)]; };

function tickStartBackground() {
  const s = state.settings;
  const showing = state.showStart && s.backgroundKind === 'animated' && s.animationInterval > 0 && !document.hidden;
  if (!showing) { startBackgroundChangedAt = Date.now(); return; }
  if (Date.now() - startBackgroundChangedAt >= s.animationInterval * 1000) {
    startBackgroundChangedAt = Date.now();
    const canvas = root.querySelector('#start-page .start-bg');
    canvas?.classList.add('fading');
    setTimeout(() => { updateSettings({ animation: randomAnimation(state.settings.animation) }, { quiet: true }); startBackground?.setKind(state.settings.animation); root.querySelector('#start-page .start-bg')?.classList.remove('fading'); }, 450);
  }
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
  if (state.showStart) renderStartPage();
}

async function chooseBackground() {
  try {
    if (desktop) {
      const path = await native.chooseImage(state.settings.lastDirectory);
      if (!path) return;
      const stored = await withProgress('progress.background', baseName(path), (op) => native.importBackground(path, op));
      updateSettings({ backgroundImage: stored, backgroundName: baseName(path), backgroundKind: 'image' });
    } else {
      const [file] = await native.pickWithInput('image/*');
      if (!file) return;
      await native.storeWebBackground(file);
      updateSettings({ backgroundImage: `web:${file.name}:${Date.now()}`, backgroundName: file.name, backgroundKind: 'image' });
    }
    await loadBackground();
    notify('success', t('notice.background'));
  } catch (error) {
    showError('error.background', error);
  }
}

async function removeBackground() {
  await native.clearBackground();
  state.backgroundUrl = null;
  updateSettings({ backgroundImage: null, backgroundName: '', backgroundKind: state.settings.backgroundKind === 'image' ? 'animated' : state.settings.backgroundKind });
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
  }
  if (s.backgroundImage !== previous.backgroundImage) loadBackground();
  if (s.theme !== previous.theme && previous.theme) notify('info', t('notice.theme', { name: themeName(s.theme, getLanguage()) }));
  if (previous.workSize && s.workSize !== previous.workSize) reworkAll();
  if (previous.useFaceModel !== undefined && (s.useFaceModel !== previous.useFaceModel || s.usePersonMask !== previous.usePersonMask) && state.doc) refindFace();
  renderAll();
  fitToolbar();
}

function randomTheme() {
  const ids = [...LIGHT_THEMES, ...DARK_THEMES].map((theme) => theme.id).filter((id) => id !== state.settings.theme);
  updateSettings({ theme: ids[Math.floor(Math.random() * ids.length)] });
}

async function openThemePicker(anchor) {
  const element = root.querySelector('.split-button [data-command="themeMenu"]')?.closest('.split-button') ?? root.querySelector('[data-command="themeMenu"]');
  const result = await popups.open('theme', { current: state.settings.theme }, { anchor: anchor ?? anchorBelow(element) });
  if (result?.theme) updateSettings({ theme: result.theme });
}

async function openStyleSet() {
  const result = await popups.open('styles', { set: state.settings.styleSet, hasDoc: hasDoc() });
  if (!result?.set) return;
  updateSettings({ styleSet: result.set });
  if (result.generate && state.doc) await generateSet();
}

// ───────────────────────── confirmation & exit

async function ask(params) {
  const result = await popups.open('confirm', params);
  return result?.choice ?? 'cancel';
}

async function requestExit() {
  if (desktop) return appWindow.close();
  return undefined;
}

async function confirmExit() {
  if (!state.doc?.dirty) return true;
  const choice = await ask({
    kind: 'exit', icon: 'save', title: t('confirm.exitTitle'), message: t('confirm.exitMessage'), items: [docName()],
    buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }],
  });
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
  return ids.map((id) => (id === '-' ? { separator: true } : {
    id, label: t(commands[id].label), icon: commands[id].icon, shortcut: commands[id].key ? keyLabel(commands[id].key) : '', disabled: !commandEnabled(id), checked: commands[id].checked?.(),
  }));
}

async function showMenu(menu, anchor, name = 'context', context = {}) {
  state.openMenu = name;
  renderMenubar();
  const header = context.header ?? (MENUS[name] ? { icon: MENU_ICONS[name], title: t(`menu.${name}`) } : { icon: 'photo', title: 'MyPhotoCut' });
  const result = await popups.open('menu', { items: menu, name, header }, { anchor });
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

function styleMenu(anchor) {
  const handlers = Object.fromEntries(STYLES.map((s) => [`custom:style:${s.id}`, () => addStyle(s.id)]));
  return showMenu(STYLES.map((s) => ({ id: `custom:style:${s.id}`, label: t(`style.${s.id}`), icon: s.icon })), anchor, 'context', { handlers, header: { icon: 'plus', title: t('action.addStyle') } });
}

function effectMenu(anchor) {
  const list = effectMenuItems();
  const handlers = Object.fromEntries(list.filter((x) => x.id).map((x) => [x.id, () => addEffect(x.id.slice('custom:fx:'.length))]));
  return showMenu(list, anchor, 'context', { handlers, header: { icon: 'addEffect', title: t('action.addEffect') } });
}

function sampleMenu(anchor) {
  const handlers = Object.fromEntries(SAMPLE_PHOTOS.map((s) => [`custom:sample:${s.id}`, () => openSample(s.id)]));
  return showMenu(SAMPLE_PHOTOS.map((s) => ({ id: `custom:sample:${s.id}`, label: s[lang()], icon: 'photo' })), anchor, 'context', { handlers, header: { icon: 'samples', title: t('action.samples') } });
}

function cardMenu(event, id) {
  select(id, { reveal: false });
  const point = toScreen(event.clientX, event.clientY);
  showMenu(menuItems(['single', 'compare', '-', 'vary', 'duplicate', 'rename', '-', 'addEffectMenu', 'effectsCopy', 'effectsPaste', '-', 'exportImage', 'copyImage', 'print', '-', 'delete']), { x: point.x + 1, y: point.y + 1, flipY: point.y }, 'context', { header: { icon: 'gallery', title: itemName(selectedItem()) } });
}

// ───────────────────────── document windows (user's guide)

async function openDocWindow(kind) {
  const info = DOC_KINDS[kind];
  if (!info) return undefined;
  popups.hideMenu();
  const url = `${location.pathname}?viewer=${kind}&lang=${getLanguage() === 'en' ? 'en' : 'ko'}`;
  if (!desktop) {
    const opened = globalThis.open(url, `myphotocut-${docLabel(kind)}`);
    opened?.focus?.();
    return undefined;
  }
  const dark = resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme).dark;
  try {
    await native.invoke('open_doc_window', { kind, title: docWindowTitle(t(info.title)), width: info.width, height: info.height, dark });
  } catch (error) {
    showError('error.docWindow', error);
  }
  return undefined;
}

// ───────────────────────── drag & drop

async function handleDroppedPaths(paths) {
  const path = paths.find((p) => isOpenableName(p));
  if (!path) { if (paths.length) notify('error', t('notice.dropUnsupported')); return; }
  await openPath(path);
}

async function handleDroppedFiles(files) {
  const file = files.find((f) => isOpenableName(f.name) || f.type.startsWith('image/'));
  if (!file) { if (files.length) notify('error', t('notice.dropUnsupported')); return; }
  if (!(await confirmReplace())) return;
  try {
    await openContent(file.name, isProjectName(file.name) ? await file.text() : new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    showError('error.open', error, file.name);
  }
}

function setDropActive(active) {
  state.dropActive = active;
  root.classList.toggle('drop-active', active);
}

// ───────────────────────── events

function bindEvents() {
  root.addEventListener('click', (event) => {
    const target = event.target;
    const menu = target.closest('[data-menu]');
    if (menu) {
      const name = menu.dataset.menu;
      if (state.lastMenuClose.name === name && Date.now() - state.lastMenuClose.at < 300) return undefined;
      return openMenubarMenu(name);
    }
    const win = target.closest('[data-window]');
    if (win) return windowButton(win.dataset.window);
    if (target.closest('[data-home]')) return showStartPage(!state.showStart);
    const start = target.closest('[data-start]');
    if (start && !start.disabled) return onStartAction(start);
    const cardAction = target.closest('[data-card-action]');
    if (cardAction) {
      const id = cardAction.closest('[data-item]').dataset.item;
      select(id, { reveal: false });
      const action = cardAction.dataset.cardAction;
      if (action === 'open') return setView('single');
      if (action === 'vary') return varySelected(id);
      if (action === 'duplicate') return duplicateItem(id);
      if (action === 'export') return openExport('selected');
      if (action === 'delete') return deleteItem(id);
      return undefined;
    }
    const stripNav = target.closest('[data-strip]');
    if (stripNav && !stripNav.disabled) { const g = root.querySelector('#gallery'); g?.scrollBy({ left: Number(stripNav.dataset.strip) * Math.max(200, g.clientWidth * 0.8), behavior: 'smooth' }); return setTimeout(updateStripNav, 350); }
    const filmNav = target.closest('[data-film]');
    if (filmNav && !filmNav.disabled) return scrollFilm(Number(filmNav.dataset.film));
    const film = target.closest('.film-item');
    if (film) return select(film.dataset.item);
    const card = target.closest('.cari-card');
    if (card) return select(card.dataset.item, { reveal: false });
    const addStyleBtn = target.closest('[data-add-style]');
    if (addStyleBtn) return addStyle(addStyleBtn.dataset.addStyle);
    const optionSet = target.closest('[data-option-set]');
    if (optionSet) { setItemValue('option', optionSet.dataset.optionSet, optionSet.dataset.value, t(`option.${optionSet.dataset.optionSet}`)); return renderRight(); }
    const fxAction = target.closest('[data-fx-action]');
    if (fxAction && !fxAction.disabled) return effectAction(fxAction.dataset.fxAction, Number(fxAction.dataset.index));
    const command = target.closest('[data-command]');
    if (command && !command.disabled) {
      const id = command.dataset.command;
      const anchor = ['themeMenu', 'exportMenu', 'addEffectMenu', 'addStyleMenu', 'columnsMenu', 'sampleMenu', 'layoutMenu'].includes(id) ? anchorBelow(command.closest('.split-button') ?? command) : undefined;
      return run(id, { anchor });
    }
    return undefined;
  });

  root.addEventListener('dblclick', (event) => {
    const card = event.target.closest('.cari-card');
    if (card && !event.target.closest('button')) { select(card.dataset.item, { reveal: false }); setView('single'); }
    if (event.target.closest('.single-result')) setView('gallery');
  });

  root.addEventListener('contextmenu', (event) => {
    if (event.target.closest('input, textarea')) return;
    event.preventDefault();
    const card = event.target.closest('.cari-card, .film-item');
    if (card) return cardMenu(event, card.dataset.item);
    if (event.target.closest('#single-canvas') && selectedItem()) return cardMenu(event, selectedItem().id);
    if (event.target.closest('#source-view') && state.doc) {
      const point = toScreen(event.clientX, event.clientY);
      return showMenu(menuItems(['faceFind', 'faceReset', 'landmarks', 'cropFace', '-', 'generate', 'styleSet', '-', 'open', 'camera']), { x: point.x + 1, y: point.y + 1, flipY: point.y }, 'context', { header: { icon: 'original', title: t('panel.photo') } });
    }
    return undefined;
  });

  root.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-handle]');
    if (handle && event.button === 0) return startHandleDrag(event, handle);
    const bar = event.target.closest('.compare-bar, .single-view.comparing .single-canvas');
    if (bar && event.button === 0 && state.compare) {
      const holder = root.querySelector('#single-canvas');
      const rect = holder.getBoundingClientRect();
      const update = (clientX) => {
        state.comparePos = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
        const original = holder.querySelector('.single-original');
        const line = holder.querySelector('.compare-bar');
        if (original) original.style.clipPath = `inset(0 ${100 - state.comparePos}% 0 0)`;
        if (line) line.style.left = `${state.comparePos}%`;
      };
      update(event.clientX);
      pointerDrag(event, { threshold: 0, move: (dx, dy, e) => update(e.clientX) });
    }
    return undefined;
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches('[data-item-style]')) return setStyle(target.value);
    if (target.matches('[data-item-name]')) { renameItem(target.value); target.blur(); return renderRight(); }
    if (target.dataset.fxColor) { const [i, key] = target.dataset.fxColor.split(':'); return setEffectParam(Number(i), key, target.value, { merge: false }); }
    if (target.dataset.fxChoice) { const [i, key] = target.dataset.fxChoice.split(':'); setEffectParam(Number(i), key, target.value, { merge: false }); return renderRight(); }
    if (target.dataset.fxText) { const [i, key] = target.dataset.fxText.split(':'); setEffectParam(Number(i), key, target.value, { merge: false }); target.blur(); return renderRight(); }
    if (target.id === 'zoom-value') { const v = parseFloat(target.value); return setZoom(Number.isFinite(v) ? v : 0); }
    if ('startToggle' in target.dataset) return updateSettings({ showStartPage: target.checked }, { quiet: true });
    if ('startRandom' in target.dataset) return updateSettings({ animationRandom: target.checked }, { quiet: true });
    if ('startInterval' in target.dataset) return updateSettings({ animationInterval: Number(target.value) }, { quiet: true });
    return undefined;
  });

  root.addEventListener('input', (event) => {
    const target = event.target;
    // A colour picker being dragged: preview the colour now, one Undo step for the drag.
    if (target.dataset.fxColor) { const [i, key] = target.dataset.fxColor.split(':'); setEffectParam(Number(i), key, target.value); const code = target.parentElement?.querySelector('code'); if (code) code.textContent = target.value; }
    if ('startSpeed' in target.dataset) { updateSettings({ animationSpeed: Number(target.value) }, { quiet: true }); target.nextElementSibling.textContent = `${target.value}%`; }
    if ('startOpacity' in target.dataset) {
      updateSettings({ startCardOpacity: Number(target.value) }, { quiet: true });
      target.nextElementSibling.textContent = `${target.value}%`;
      root.querySelector('.start-inner')?.style.setProperty('--start-card-alpha', `${target.value}%`);
    }
  });

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.matches('[data-item-name], [data-fx-text]')) event.target.dispatchEvent(new Event('change', { bubbles: true }));
  });

  bindSteppers(root, (key, value) => {
    const [scope, name, extra] = key.split(':');
    if (scope === 'warp') return setItemValue('warp', name, value / 100, t(`warp.${name}`));
    if (scope === 'option') return setItemValue('option', name, value, t(`option.${name}`));
    if (scope === 'fx') return setEffectParam(Number(name), extra, value);
    return undefined;
  });

  root.addEventListener('wheel', (event) => {
    if (!event.target.closest('#single-stage')) return;
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    setZoom(zoomStep(effectiveZoom(), event.deltaY < 0 ? 1 : -1));
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
        const width = Math.max(minimum, Math.min(600, startWidth + (side === 'left' ? dx : -dx)));
        root.style.setProperty(side === 'left' ? '--left-width' : '--right-width', `${width}px`);
        state.settings[key] = width;
      },
      end: (e, moved) => { if (moved) { updateSettings({ [key]: state.settings[key] }, { quiet: true }); relayoutGallery(); } },
    });
  }));

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

  window.addEventListener('resize', frameThrottle(() => {
    fitToolbar();
    relayoutGallery();
    if (state.view === 'single' && !state.zoom) renderSingle();
    if (desktop && state.minWidth && window.innerWidth < state.minWidth - 1) native.setMinimumSize(state.minWidth, 640).catch(() => {});
  }));

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('paste', (event) => {
    if (event.target.closest?.('input, textarea')) return;
    const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    blobToDataUrl(file).then((url) => openDataUrl(url, `${t('doc.pastedName')}.png`));
  });

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      const previous = state.settings;
      state.settings = loadSettings(globalThis.localStorage);
      applySettings(previous);
    } else if (event.key === RECENT_KEY || event.key === RECENT_DIRS_KEY) {
      state.recent = loadRecent(globalThis.localStorage);
      state.recentDirs = loadRecentDirs(globalThis.localStorage);
      if (state.showStart) renderStartPage();
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
      handleDroppedFiles([...(event.dataTransfer?.files ?? [])]);
    });
    window.addEventListener('beforeunload', (event) => {
      if (state.doc?.dirty) { event.preventDefault(); event.returnValue = ''; }
    });
  }

  setInterval(() => {
    const clock = root.querySelector('#status-clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, 15000);
}

/** Strip layout: each card as wide as its picture is at the strip's height. */
function setStripWidth(gallery) {
  const r = state.doc?.region ?? state.doc?.photo;
  if (!r) return;
  const thumbHeight = Math.max(120, gallery.clientHeight - 28 - 36);
  const w = r.w ?? r.width;
  const h = r.h ?? r.height;
  gallery.style.setProperty('--strip-w', `${Math.round((thumbHeight * w) / h)}px`);
}

const relayoutGallery = frameThrottle(() => {
  const gallery = root.querySelector('#gallery');
  if (gallery) setStripWidth(gallery);
  if (gallery) gallery.style.setProperty('--cols', String(galleryColumns(gallery.clientWidth || 1000)));
});

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  const editing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = event.ctrlKey || event.metaKey;
  if (mod && !event.altKey) {
    if (editing && ['x', 'c', 'v', 'z', 'y', 'a'].includes(key)) return;
    if (key === 'z' && event.shiftKey) { event.preventDefault(); run('redo'); return; }
    const k = key === '+' ? '=' : key === '_' ? '-' : key;
    const shortcut = SHORTCUTS.find(([sk, shift]) => sk === k && shift === event.shiftKey) ?? SHORTCUTS.find(([sk]) => sk === k && ['=', '-', '0', '1', '2'].includes(k));
    if (shortcut) { event.preventDefault(); event.stopPropagation(); run(shortcut[2]); }
    return;
  }
  if (key === 'f1') { event.preventDefault(); run('about'); return; }
  if (key === 'f5') { event.preventDefault(); run('generate'); return; }
  if (editing) {
    if (key === 'escape') event.target.blur();
    return;
  }
  if (!state.doc || state.showStart) return;
  if (key === 'f2') { event.preventDefault(); run('rename'); return; }
  if (key === 'delete') { event.preventDefault(); run('delete'); return; }
  if (key === 'arrowright' || key === 'arrowdown') { event.preventDefault(); step(1); return; }
  if (key === 'arrowleft' || key === 'arrowup') { event.preventDefault(); step(-1); return; }
  if (key === 'enter') { event.preventDefault(); setView('single'); return; }
  if (key === 'escape') { event.preventDefault(); if (state.compare) { state.compare = false; renderSingle(); renderToolbarState(); } else setView('gallery'); }
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
  popups.on('show-start', () => showStartPage(true));
  popups.on('open-styles', () => openStyleSet());
  popups.on('print-request', async (data) => {
    try {
      popups.post('print', { type: 'print-images', scope: data.scope, images: await printImages(data.scope) });
    } catch (error) {
      showError('error.print', error);
    }
  });
  popups.on('printed', (data) => notify('success', t('notice.printed', { printer: data.printer || '-', pages: data.pages ?? 0 })));
  popups.on('raise-test-panic', () => native.invoke('raise_test_panic').catch((error) => showError('error.unexpected', error)));
}

// ───────────────────────── start-up

async function restoreSession() {
  if (!desktop || !state.settings.restoreSession) return;
  try {
    const last = JSON.parse(globalThis.localStorage?.getItem(SESSION_KEY) ?? 'null');
    if (last?.path) await openPath(last.path, { quiet: true });
  } catch { /* the file is gone: start empty */ }
}

function persistSession() {
  try { globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify({ path: state.doc?.path ?? null })); } catch { /* storage blocked */ }
}

const appApi = {
  state,
  doc,
  selectedItem,
  selectedIndex,
  hasPhoto: hasDoc,
  settings: () => state.settings,
  version: () => state.info?.version ?? VERSION,
};

async function start() {
  pool = new RenderPool();
  pool.onBusy = () => { if (!pool.busy) renderStatus(); };
  renderShell();
  bindEvents();
  bindPopupActions();
  await popups.init();
  state.info = await native.appInfo().catch(() => null);
  if (state.settings.animationRandom) updateSettings({ animation: randomAnimation(state.settings.animation) }, { quiet: true });
  setInterval(tickStartBackground, 1000);
  native.setBackendLanguage(state.settings.language);
  applySettings({});
  await loadBackground();

  if (desktop) {
    appWindow.onCloseRequested(async (event) => {
      if (state.quitting) return;
      event.preventDefault();
      if (await confirmExit()) {
        persistSession();
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

  trackMaximized();
  const files = await native.startupFiles().catch(() => []);
  for (const path of files) await openPath(path);
  if (!files.length) await restoreSession();
  state.showStart = !state.doc;
  renderAll();
  if (desktop) {
    await appWindow.show();
    await appWindow.setFocus();
    setTimeout(() => popups.prewarm('menu'), 400);
  }
  if (state.settings.showWelcome && !state.doc && !globalThis.__MYPHOTOCUT_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome')) setTimeout(openWelcome, 600);
}

async function openWelcome() {
  const result = await popups.open('welcome', {});
  if (result?.choice === 'sample') openSample(SAMPLE_PHOTOS[Math.floor(Math.random() * SAMPLE_PHOTOS.length)].id);
  else if (result?.choice === 'open') openWithDialog();
  else if (result?.choice === 'camera') openCamera();
}

// Test hook: the GUI checks drive the app through this (no effect on normal use).
window.__myphotocut = {
  state,
  t,
  commands,
  popups,
  run,
  menus: { MENUS, enabled: (id) => commandEnabled(id) },
  pool: () => pool,
  actions: {
    openSample, openDataUrl, openContent, openPath, saveDoc, closePhoto, select, setView, setZoom, addStyle, duplicateItem, varySelected, deleteItem, generateSet, varyAll,
    setItemValue, setStyle, renameItem, warpPreset, addEffect, effectAction, setEffectParam, effectsToAll, refindFace, resetFace, undo, redo, updateSettings, showStartPage,
    exportCanvas, buildSheet, toggleCrop, setLayout, openPrint, printImages, openMenubarMenu, showError, notify, projectData, serialize: () => serializeProject(projectData()),
    /** Resolves when no caricature is being drawn. */
    idle: () => new Promise((resolve) => { const check = () => (pool.busy === 0 && !state.analysing ? resolve(true) : setTimeout(check, 100)); check(); }),
  },
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => {
    if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {});
  });

