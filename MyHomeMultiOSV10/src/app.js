// MyHomeMaker main window: a graphical website builder. The menu bar row is the title bar
// (icon, name, version, the open site; window buttons on the right), then the toolbar, then
// the Blocks panel | the pages as tabs over the canvas | the Site panel (pages and blocks, and
// the Content / Style / Page / Site editors), and the status bar. Popups (settings, menus,
// designs, publishing …) are OS windows of their own (desktop) or frames (web, tutorial).
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import APP_ICON from '../assets/icon-256.png';
import * as S from './domain/site.js';
import { BLOCK_GROUPS, BLOCKS, PAGE_BLOCK_TYPES, blockDef, blockLabel, normalizeStyle } from './domain/blocks.js';
import { DESIGN_IDS, DESIGNS, designById } from './domain/designs.js';
import { ART_KINDS, art } from './domain/art.js';
import { buildTemplate, TEMPLATES } from './domain/templates.js';
import { buildSample, SAMPLE_GROUPS, SAMPLES } from './domain/samples.js';
import { pageFile } from './domain/render.js';
import { filesSize, publishChecks, siteFiles, singlePageHtml } from './domain/publish.js';
import { SiteDocument, baseName, directoryOf, extensionOf, fileSafe, isImageFileName, isSiteFileName, isTemplateFileName, stripExtension, withExtension } from './domain/document.js';
import { addRecent, loadRecent, loadRecentDirs, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import {
  ANIMATIONS, CANVAS_ZOOM, loadSettings, PANEL_MIN, RECENT_DIRS_KEY, RECENT_KEY, SESSION_KEY, STORAGE_KEY, storeSettings, ZOOM, zoomStep,
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
import { startBoard } from './ui/startboard.js';
import { STEPS as TUTORIAL_STEPS, Tutorial } from './ui/tutorial.js';
import { contentHtml, EDITOR_TABS, pageHtml as pageEditorHtml, pagesDatalist, siteHtml, styleHtml } from './ui/inspector.js';
import { bindSteppers } from './stepper.js';
import { DEVICES, SiteCanvas } from './views/canvas.js';
import { bytesToBase64, zip } from './export/files.js';
import { DOC_KINDS, docLabel, docWindowTitle } from './domain/helpdocs.js';

const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const clone = (value) => JSON.parse(JSON.stringify(value));

const state = {
  settings: loadSettings(globalThis.localStorage),
  recent: loadRecent(globalThis.localStorage),
  recentDirs: loadRecentDirs(globalThis.localStorage),
  docs: [],
  active: null,
  /** The selected block (id) on the current page, or the header / footer. */
  selected: null,
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
  view: null,
  preview: false,
  rightTab: 'content',
  collapsedEditors: new Set(),
  collapsedItems: new Set(),
  collapsedTree: new Set(),
  collapsedToolbox: new Set(),
  toolboxQuery: '',
  editingField: null,
  dynamicMenus: new Map(),
};

const activeDoc = () => state.docs.find((doc) => doc.id === state.active) ?? null;
const site = () => activeDoc()?.site ?? null;
const currentPage = () => activeDoc()?.page ?? null;
const docName = (doc) => (doc.path ? baseName(doc.path) : doc.name ?? doc.site.name);
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
  const text = native.errorText(error);
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
    app: info ? `${info.name} ${info.version} (${info.web ? 'web' : `${info.os}/${info.arch}`}, ${info.commit})` : `MyHomeMaker ${VERSION}`,
  });
}

window.addEventListener('error', (event) => showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''));
window.addEventListener('unhandledrejection', (event) => showError('error.unexpected', event.reason));

// ───────────────────────── the open site

/** One site at a time: a new or opened site replaces the current one (the caller asked first). */
function addDoc(doc) {
  state.docs.splice(0, state.docs.length, doc);
  doc.view.device = state.settings.defaultDevice;
  activate(doc.id);
  persistSession();
  return doc;
}

function newSite(templateId = 'blank', { name = '', designId = null } = {}) {
  const built = buildTemplate(templateId, lang());
  if (designId && DESIGN_IDS.includes(designId)) built.design = { id: designId, overrides: {} };
  else if (templateId === 'blank') built.design = { id: state.settings.defaultDesign, overrides: {} };
  if (name) { built.name = name; built.meta.title = name; built.layout.header.props.brand = name; }
  else if (templateId === 'blank') { state.untitled += 1; built.name = t('tabs.untitled', { n: state.untitled }); }
  const doc = addDoc(new SiteDocument(built, { name: built.name, template: true }));
  doc.markSaved(null);
  doc.fromTemplate = true;
  notify('success', t(templateId === 'blank' ? 'notice.newSite' : 'notice.fromTemplate', { name: built.name }));
  return doc;
}

/** Before another site replaces the current one: Save / Don't save / Cancel when it has changes. */
async function confirmReplace() {
  const doc = activeDoc();
  if (!doc?.dirty) return true;
  const choice = await ask({
    icon: 'save', title: t('confirm.replaceTitle'), message: t('confirm.replaceMessage', { name: docName(doc) }),
    buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }],
  });
  if (choice === 'save') return saveDoc(doc);
  return choice === 'discard';
}

/** File › New: the template window (templates and samples, a name and a design). */
async function newSiteAsk(templateId = null) {
  if (!(await confirmReplace())) return null;
  if (templateId) return newSite(templateId);
  const result = await popups.open('template', { design: state.settings.defaultDesign });
  if (!result) return null;
  if (result.sample) return openSampleBuiltin(result.sample, result.name);
  return newSite(result.template ?? 'blank', { name: String(result.name ?? '').trim(), designId: result.design });
}

async function openSampleAsk(id = SAMPLES[0].id) {
  if (!(await confirmReplace())) return null;
  return openSampleBuiltin(id);
}

/** A sample as a new site (saved only when the user saves it). */
function openSampleBuiltin(id = SAMPLES[0].id, name = '') {
  const built = buildSample(id, lang());
  if (name) { built.name = name; built.meta.title = name; built.layout.header.props.brand = name; }
  const doc = addDoc(new SiteDocument(built, { name: built.name, template: true }));
  doc.markSaved(null);
  doc.fromTemplate = true;
  notify('success', t('notice.sample', { name: built.name }));
  return doc;
}

function activate(id) {
  state.view?.finishEdit?.(true);
  state.active = id;
  state.selected = null;
  state.showStart = false;
  state.preview = false;
  mountView();
  renderAll();
  if (state.settings.autoFit) requestAnimationFrame(() => fitWidth({ quiet: true }));
}

/** Applies a change to the site as one undo step and redraws. mutate(site, page, doc). */
function change(labelKey, mutate, { redraw = true } = {}) {
  const doc = activeDoc();
  if (!doc) return undefined;
  const result = doc.apply(t(labelKey), (value) => mutate(value, S.pageById(value, doc.view.pageId) ?? value.pages[0], doc));
  afterChange({ redraw });
  return result;
}

function afterChange({ redraw = true } = {}) {
  const doc = activeDoc();
  if (doc && state.selected && !S.findBlock(doc.site, state.selected)) state.selected = null;
  if (redraw) state.view?.render();
  renderTabs();
  renderTitleProject();
  renderToolbarState();
  renderRight();
  renderStatus();
}

function persistSession() {
  if (state.instance && !state.instance.first) return;
  try {
    globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify({ files: state.docs.filter((doc) => doc.path).map((doc) => doc.path) }));
  } catch { /* ignore */ }
}

// ───────────────────────── selection

const selectedId = () => state.selected;
function selectedBlock() {
  const s = site();
  return s && state.selected ? S.findBlock(s, state.selected)?.block ?? null : null;
}
const hasDoc = () => Boolean(activeDoc()) && !state.showStart;
const hasBlock = () => hasDoc() && Boolean(selectedBlock());
const hasPageBlock = () => hasBlock() && !blockDef(selectedBlock().type)?.global;

function select(id, { from = '' } = {}) {
  const changed = state.selected !== id;
  state.selected = id;
  state.view?.updateOverlay();
  if (id && from !== 'canvas') state.view?.reveal(id);
  if (id && state.rightTab === 'page' || id && state.rightTab === 'site') state.rightTab = 'content';
  if (changed) { renderRight(); renderToolbarState(); renderStatus(); }
}

/** The next / previous block of the page (header and footer at the ends). */
function selectStep(direction) {
  const s = site();
  const page = currentPage();
  if (!s || !page) return;
  const ids = [s.layout.header.id, ...page.blocks.map((b) => b.id), s.layout.footer.id];
  const at = ids.indexOf(state.selected);
  select(ids[at < 0 ? (direction > 0 ? 0 : ids.length - 1) : Math.max(0, Math.min(ids.length - 1, at + direction))]);
}

// ───────────────────────── pages

function openPage(id) {
  const doc = activeDoc();
  if (!doc || !S.pageById(doc.site, id)) return;
  state.view?.finishEdit?.(true);
  if (doc.view.pageId !== id) {
    doc.view.scroll[doc.view.pageId] = state.view?.scroll.scrollTop ?? 0;
    doc.view.pageId = id;
    state.selected = null;
  }
  if (state.showStart) { state.showStart = false; mountView(); renderAll(); } else { state.view?.render(); afterChange({ redraw: false }); }
  if (state.view) state.view.scroll.scrollTop = doc.view.scroll[id] ?? 0;
  scrollActiveTabIntoView();
}

async function addPageAsk() {
  const s = site();
  if (!s) return;
  const result = await popups.open('prompt', { icon: 'addPage', title: t('action.addPage'), label: t('page.name'), value: t('page.newName', { n: s.pages.length + 1 }), choices: PAGE_STARTS.map((id) => [id, t(`pageStart.${id}`)]), choice: 'blank' });
  const name = String(result?.value ?? '').trim();
  if (!result || !name) return;
  const page = change('op.addPage', (value) => S.addPage(value, { name, L: value.meta.language, blocks: pageStartBlocks(result.choice, value) }));
  if (page) openPage(page.id);
}

/** What a new page starts with. */
const PAGE_STARTS = ['blank', 'about', 'services', 'gallery', 'contact', 'pricing', 'blog'];
function pageStartBlocks(kind, s) {
  const L = s.meta.language;
  const b = (type, props = {}, style = {}) => S.createBlock(type, { L, design: s.design, props, style });
  switch (kind) {
    case 'about': return [b('heading', { title: t('pageStart.about'), subtitle: '' }, { padTop: 72 }), b('mediaText'), b('timeline'), b('team')];
    case 'services': return [b('heading', { title: t('pageStart.services'), subtitle: '' }, { padTop: 72 }), b('services', { title: '', subtitle: '' }, { bg: '' }), b('steps'), b('cta')];
    case 'gallery': return [b('heading', { title: t('pageStart.gallery'), subtitle: '' }, { padTop: 72 }), b('gallery', { title: '' })];
    case 'contact': return [b('contact'), b('faq')];
    case 'pricing': return [b('heading', { title: t('pageStart.pricing'), subtitle: '' }, { padTop: 72 }), b('pricing', { title: '', subtitle: '' }), b('faq')];
    case 'blog': return [b('heading', { title: t('pageStart.blog'), subtitle: '' }, { padTop: 72 }), b('blog', { title: '' }), b('newsletter')];
    default: return [b('heading', { level: 'h1' }, { padTop: 80 }), b('text')];
  }
}

function duplicatePage() {
  const page = currentPage();
  if (!page) return;
  const copy = change('op.duplicatePage', (value) => S.duplicatePage(value, page.id, value.meta.language));
  if (copy) openPage(copy.id);
}

async function deletePage(id = currentPage()?.id) {
  const s = site();
  const page = s && S.pageById(s, id);
  if (!page || s.pages.length <= 1) return;
  if (!(await confirmDelete([page.name], 'page'))) return;
  const index = s.pages.indexOf(page);
  change('op.deletePage', (value) => S.removePage(value, id));
  const next = site().pages[Math.max(0, index - 1)];
  if (next) openPage(next.id);
}

async function renamePage(id = currentPage()?.id) {
  const page = site() && S.pageById(site(), id);
  if (!page) return;
  const result = await popups.open('prompt', { icon: 'pageProps', title: t('action.renamePage'), label: t('page.name'), value: page.name });
  const name = String(result?.value ?? '').trim();
  if (name && name !== page.name) change('op.renamePage', (value) => { S.pageById(value, id).name = name; });
}

function movePage(direction) {
  const page = currentPage();
  if (page) change('op.movePage', (value) => S.movePage(value, page.id, direction));
}

function pageStep(direction) {
  const s = site();
  const page = currentPage();
  if (!s || s.pages.length < 2) return;
  const at = s.pages.indexOf(page);
  openPage(s.pages[(at + direction + s.pages.length) % s.pages.length].id);
}

// ───────────────────────── blocks

/** Where a new block goes: after the selected block of this page, else at the end. */
function insertIndex() {
  const page = currentPage();
  const found = state.selected ? page?.blocks.findIndex((b) => b.id === state.selected) : -1;
  return found >= 0 ? found + 1 : page?.blocks.length ?? 0;
}

function insertBlock(type, index = insertIndex()) {
  if (!hasDoc() || !PAGE_BLOCK_TYPES.includes(type)) return null;
  const block = change('op.addBlock', (value, page) => S.insertBlocks(page, [S.createBlock(type, { L: value.meta.language, design: value.design })], index)[0]);
  if (block) { select(block.id); state.rightTab = 'content'; renderRight(); notify('success', t('notice.blockAdded', { name: blockLabel(type, lang()) })); }
  return block;
}

/** The block picker as a menu (toolbar "Add block", the + under a block, an empty page). */
function addBlockMenu(anchor, index = insertIndex()) {
  const handlers = {};
  const items = BLOCK_GROUPS.filter((g) => g.id !== 'site').map((group) => {
    const key = `blocks:${group.id}`;
    const leaves = PAGE_BLOCK_TYPES.filter((type) => BLOCKS[type].group === group.id).map((type) => {
      handlers[`custom:block:${type}`] = () => insertBlock(type, index);
      return { id: `custom:block:${type}`, label: blockLabel(type, lang()), icon: BLOCKS[type].icon };
    });
    state.dynamicMenus.set(key, { items: leaves, handlers, header: { icon: group.icon, title: group[lang()] } });
    return { id: `submenu:${key}`, label: group[lang()], icon: group.icon, submenu: true };
  });
  return showMenu(items, anchor ?? anchorFor('addBlock'), 'context', { handlers, header: { icon: 'addBlock', title: t('action.addBlock') } });
}

function deleteBlock(id = state.selected) {
  const found = site() && S.findBlock(site(), id);
  if (!found?.list) return;
  const next = found.list[found.index + 1]?.id ?? found.list[found.index - 1]?.id ?? null;
  change('op.deleteBlock', (value) => S.removeBlocks(value, [id]));
  select(next);
  notify('info', t('notice.blockDeleted', { name: blockLabel(found.block.type, lang()) }));
}

function duplicateBlock(id = state.selected) {
  const found = site() && S.findBlock(site(), id);
  if (!found?.list) return;
  const copy = change('op.duplicateBlock', (value) => { const f = S.findBlock(value, id); const c = S.copyBlock(f.block); f.list.splice(f.index + 1, 0, c); return c; });
  if (copy) select(copy.id);
}

function moveBlock(direction, id = state.selected) {
  if (!id) return;
  const moved = change('op.moveBlock', (value) => S.moveBlock(value, id, direction));
  if (moved) state.view?.reveal(id);
}

function moveBlockTo(id, index) {
  const page = currentPage();
  if (!page) return;
  const from = page.blocks.findIndex((b) => b.id === id);
  if (from < 0 || from === index) return;
  change('op.moveBlock', (value, p) => S.moveBlockTo(value, id, p, index));
  select(id);
}

function toggleHidden(id = state.selected) {
  const block = id && site() && S.findBlock(site(), id)?.block;
  if (!block) return;
  change('op.style', (value) => { const b = S.findBlock(value, id).block; b.style = normalizeStyle({ ...b.style, hidden: !b.style?.hidden }, blockDef(b.type)); });
  notify('info', t(block.style?.hidden ? 'notice.blockShown' : 'notice.blockHidden'));
}

/** Copies the selected block (the app's clipboard, and the system clipboard as JSON text). */
async function copyBlock({ cut = false } = {}) {
  const block = selectedBlock();
  if (!block || blockDef(block.type)?.global) return;
  state.clipboard = { blocks: [clone(block)] };
  try { await native.clipboardWrite(JSON.stringify({ myhomemakerBlocks: [block] })); } catch { /* the app clipboard still has it */ }
  if (cut) deleteBlock(block.id);
  notify('success', t(cut ? 'notice.cut' : 'notice.copied'));
}

/** Pastes blocks (after the selected one): from the system clipboard when it holds MyHomeMaker blocks, else as text. */
async function pasteBlocks() {
  if (!hasDoc()) return;
  let blocks = null;
  let text = '';
  try { text = await native.clipboardRead(); } catch { /* blocked */ }
  try { const data = JSON.parse(text); if (Array.isArray(data?.myhomemakerBlocks)) blocks = data.myhomemakerBlocks; } catch { /* plain text */ }
  if (!blocks && state.clipboard && (!text || text.includes('myhomemakerBlocks'))) blocks = state.clipboard.blocks;
  const index = insertIndex();
  if (blocks?.length) {
    const added = change('op.paste', (value, page) => S.insertBlocks(page, blocks.filter((b) => PAGE_BLOCK_TYPES.includes(b?.type)).map((b) => ({ ...S.copyBlock(b), style: normalizeStyle(b.style, blockDef(b.type)) })), index));
    if (added?.length) select(added.at(-1).id);
    return;
  }
  if (text.trim()) {
    const block = change('op.paste', (value, page) => S.insertBlocks(page, [S.createBlock('text', { L: value.meta.language, design: value.design, props: { body: text.trim() } })], index)[0]);
    if (block) select(block.id);
  }
}

/** The field definition behind a dotted path of a block ("items.2.title" → the items field's "title"). */
function fieldOf(blockId, path) {
  const block = site() && S.findBlock(site(), blockId)?.block;
  const def = block && blockDef(block.type);
  if (!def) return null;
  const [head, index, sub] = String(path).split('.');
  const field = def.fields.find((f) => f.key === head);
  if (field?.kind === 'items' && sub) return field.item.find((x) => x.key === sub) ?? null;
  return field ?? null;
}

/** Text typed on the canvas. */
function commitText(blockId, path, text) {
  change('op.editText', (value) => { const found = S.findBlock(value, blockId); if (found) S.setPath(found.block.props, path, text); });
}

/** A field of the Content tab changed. */
function setProp(blockId, path, raw, kind) {
  const value = kind === 'number' ? Number(raw) : kind === 'toggle' ? Boolean(raw) : raw;
  if (blockId === '@site') return setSiteField(path.replace(/^@site\./, ''), value);
  if (String(path).startsWith('@style.')) return setStyle(blockId, { [path.slice(7)]: value });
  const found = site() && S.findBlock(site(), blockId);
  if (!found || S.getPath(found.block.props, path) === value) return undefined;
  return change('op.edit', (s) => { S.setPath(S.findBlock(s, blockId).block.props, path, value); });
}

function itemAction(kind, blockId, spec) {
  const [key, index, step] = String(spec).split(':');
  const i = Number(index);
  const def = blockDef(site() && S.findBlock(site(), blockId)?.block.type);
  const field = def?.fields.find((f) => f.key === key);
  if (!field) return;
  change('op.items', (s) => {
    const props = S.findBlock(s, blockId).block.props;
    props[key] = Array.isArray(props[key]) ? props[key] : [];
    const list = props[key];
    if (kind === 'add') list.push(field.add());
    else if (kind === 'delete') list.splice(i, 1);
    else if (kind === 'copy') list.splice(i + 1, 0, clone(list[i]));
    else if (kind === 'move') { const to = i + Number(step); if (to >= 0 && to < list.length) list.splice(to, 0, list.splice(i, 1)[0]); }
  });
}

function setStyle(blockId, patch) {
  const found = site() && S.findBlock(site(), blockId);
  if (!found) return;
  change('op.style', (s) => { const b = S.findBlock(s, blockId).block; b.style = normalizeStyle({ ...b.style, ...patch }, blockDef(b.type)); });
}

function setPageField(key, value) {
  const page = currentPage();
  if (!page) return;
  change('op.page', (s, p) => {
    if (key === 'slug') p.slug = S.uniqueSlug(s, value || p.name, p.id);
    else if (key === 'nav') p.nav = Boolean(value);
    else p[key] = String(value ?? '');
    S.fixSlugs(s);
  });
}

function setSiteField(key, value) {
  change('op.site', (s) => {
    if (key === 'language') s.meta.language = value === 'en' ? 'en' : 'ko';
    else s.meta[key] = String(value ?? '');
    if (key === 'title') s.name = s.meta.title || s.name;
  });
}

function setDesign(patch, { reset = false } = {}) {
  change('op.design', (s) => {
    if (patch.id) s.design = { id: patch.id, overrides: reset ? {} : { ...(s.design.overrides ?? {}) } };
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'id') continue;
      if (value === null || value === '') delete s.design.overrides[key]; else s.design.overrides[key] = value;
    }
  });
}

async function pickDesign() {
  const s = site();
  if (!s) return;
  const result = await popups.open('design', { current: s.design.id, hasOverrides: Object.keys(s.design.overrides ?? {}).length > 0 });
  if (result?.design && DESIGN_IDS.includes(result.design)) {
    setDesign({ id: result.design }, { reset: result.reset !== false });
    notify('success', t('notice.design', { name: designById(result.design)[lang()] }));
  }
}

function randomDesign() {
  const s = site();
  if (!s) return;
  const others = DESIGNS.filter((d) => d.id !== s.design.id);
  const next = others[Math.floor(Math.random() * others.length)];
  setDesign({ id: next.id }, { reset: true });
  notify('info', t('notice.design', { name: next[lang()] }));
}

/** Lets the user choose a picture file: its data: URL, or null. */
async function chooseImageDataUrl() {
  if (desktop) {
    const path = await native.chooseImage(state.settings.lastDirectory);
    if (!path) return null;
    const ext = extensionOf(path);
    const mime = ext === 'svg' ? 'svg+xml' : ext === 'jpg' ? 'jpeg' : ext === 'ico' ? 'x-icon' : ext;
    rememberDirectory(directoryOf(path));
    return `data:image/${mime};base64,${await withProgress('progress.image', baseName(path), (op) => native.readBase64File(path, op))}`;
  }
  const [file] = await native.pickWithInput('image/*');
  return file ? fileDataUrl(file) : null;
}

const fileDataUrl = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(file); });

/** A large photo is made smaller (longest side 1920 px) so the site stays quick. SVG and GIF stay as they are. */
async function shrinkPicture(src, max = 1920) {
  if (!/^data:image\/(png|jpe?g|webp|bmp)/i.test(src)) return src;
  const image = new Image();
  image.src = src;
  await image.decode();
  const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
  if (scale >= 1 && src.length < 1_500_000) return src;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return /png/i.test(src) ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.86);
}

async function chooseImageFor(blockId, path) {
  try {
    const src = await chooseImageDataUrl();
    if (src) setProp(blockId, path, await shrinkPicture(src), 'image');
  } catch (error) { showError('error.picture', error); }
}

function artMenu(blockId, path, anchor) {
  const d = designById(site()?.design.id);
  const handlers = {};
  const items = ART_KINDS.map((kind, i) => { handlers[`custom:art:${kind}`] = () => setProp(blockId, path, art(kind, d.primary, d.accent, Date.now() % 997 + i), 'image'); return { id: `custom:art:${kind}`, label: t(`art.${kind}`), icon: 'sparkles' }; });
  return showMenu(items, anchor, 'context', { handlers, header: { icon: 'sparkles', title: t('field.artImage') } });
}

/** A double click on formatted text (or a block): the Content tab with that field ready to type in. */
function focusField(blockId, path) {
  select(blockId);
  state.rightTab = 'content';
  if (!state.settings.showRightPanel) updateSettings({ showRightPanel: true });
  renderRight();
  if (!path) return;
  requestAnimationFrame(() => {
    const field = root.querySelector(`#editors [data-prop="${CSS.escape(path)}"]`);
    field?.scrollIntoView({ block: 'center' });
    field?.focus();
  });
}

// ───────────────────────── view: device, zoom, preview

const zoomPercent = () => activeDoc()?.view.zoom ?? 100;
function setZoom(percent) {
  const doc = activeDoc();
  if (!doc) return;
  doc.view.zoom = Math.max(CANVAS_ZOOM.min, Math.min(CANVAS_ZOOM.max, Math.round(percent)));
  state.view?.layout();
  renderToolbarState();
  renderStatus();
}
const zoomBy = (direction) => setZoom(zoomStep(zoomPercent(), direction));
function fitWidth({ quiet = false } = {}) {
  if (!state.view) return;
  setZoom(state.view.fitZoom());
  if (!quiet) notify('info', t('notice.zoom', { zoom: zoomPercent() }));
}

function setDevice(device) {
  const doc = activeDoc();
  if (!doc || !DEVICES[device]) return;
  doc.view.device = device;
  state.view?.layout();
  if (state.settings.autoFit) fitWidth({ quiet: true });
  renderToolbarState();
  renderStatus();
  notify('info', t('notice.device', { name: t(`device.${device}`), width: DEVICES[device] }));
}

function togglePreview() {
  state.preview = !state.preview;
  state.selected = null;
  state.view?.render();
  renderAll();
  notify('info', t(state.preview ? 'notice.previewOn' : 'notice.previewOff'));
}

// ───────────────────────── canvas mount

function mountView() {
  const host = root.querySelector('#view-host');
  const start = root.querySelector('#start-page');
  const showStart = state.showStart || !activeDoc();
  host.hidden = showStart;
  start.hidden = !showStart;
  if (showStart) { state.view?.destroy(); state.view = null; renderStartPage(); return; }
  if (!state.view) state.view = new SiteCanvas(appApi, host);
  state.view.render();
}

// ───────────────────────── commands

const toggle = (key) => updateSettings({ [key]: !state.settings[key] });
const canUndo = () => Boolean(activeDoc()?.history.canUndo) && !state.showStart;
const canRedo = () => Boolean(activeDoc()?.history.canRedo) && !state.showStart;

const commands = {
  // file
  new: { icon: 'fileNew', label: 'action.new', key: 'Ctrl+N', run: () => newSiteAsk() },
  newFromTemplate: { icon: 'templateNew', label: 'action.newFromTemplate', run: (context) => templateMenu(context?.anchor) },
  openSample: { icon: 'samples', label: 'action.openSample', run: (context) => sampleMenu(context?.anchor) },
  open: { icon: 'folderOpen', label: 'action.open', key: 'Ctrl+O', run: () => openWithDialog() },
  startPage: { icon: 'home', label: 'action.startPage', key: 'Ctrl+Shift+H', checked: () => state.showStart || !activeDoc(), run: () => showStartPage(!state.showStart || !activeDoc()) },
  save: { icon: 'save', label: 'action.save', key: 'Ctrl+S', enabled: () => Boolean(activeDoc()), run: () => saveDoc(activeDoc()) },
  saveAs: { icon: 'saveAs', label: 'action.saveAs', key: 'Ctrl+Shift+S', enabled: () => Boolean(activeDoc()), run: () => saveDoc(activeDoc(), { saveAs: true }) },
  saveTemplate: { icon: 'template', label: 'action.saveTemplate', enabled: () => Boolean(activeDoc()), run: () => saveTemplate() },
  recent: { icon: 'recent', label: 'action.recent', key: 'Ctrl+R', run: () => popups.open('recent', {}) },
  recentFolders: { icon: 'recentFolder', label: 'action.recentFolders', run: (context) => recentFoldersMenu(context?.anchor) },
  clearRecent: { icon: 'clearHistory', label: 'action.clearRecent', enabled: () => state.recent.length > 0 || state.recentDirs.length > 0, run: () => clearRecentAll() },
  publish: { icon: 'publish', label: 'action.publish', key: 'Ctrl+Shift+P', enabled: () => Boolean(activeDoc()), run: () => openPublish() },
  publishMenu: { icon: 'chevronDown', label: 'action.publishMenu', enabled: () => Boolean(activeDoc()), run: (context) => showMenu(menuItems(SUBMENUS.exportTo.items), context?.anchor ?? anchorFor('publishMenu'), 'context', { header: { icon: 'publish', title: t('submenu.exportTo') } }) },
  publishFolder: { icon: 'publishFolder', label: 'action.publishFolder', enabled: () => desktop && Boolean(activeDoc()), run: () => publishSite('folder') },
  publishZip: { icon: 'publishZip', label: 'action.publishZip', enabled: () => Boolean(activeDoc()), run: () => publishSite('zip') },
  exportPage: { icon: 'htmlPage', label: 'action.exportPage', enabled: hasDoc, run: () => publishSite('html') },
  copyPageHtml: { icon: 'copy', label: 'action.copyPageHtml', enabled: hasDoc, run: () => copyPageHtml() },
  previewBrowser: { icon: 'previewBrowser', label: 'action.previewBrowser', key: 'F5', enabled: hasDoc, run: () => previewInBrowser() },
  siteProps: { icon: 'siteProps', label: 'action.siteProps', enabled: () => Boolean(activeDoc()), run: () => showEditorTab('site') },
  closeSite: { icon: 'closeTab', label: 'action.closeSite', key: 'Ctrl+W', enabled: () => Boolean(activeDoc()), run: () => closeDoc(activeDoc()) },
  exit: { icon: 'exit', label: 'action.exit', key: isMac ? 'Ctrl+Q' : 'Alt+F4', run: () => requestExit() },
  // edit
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: canUndo, run: () => undo() },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: canRedo, run: () => redo() },
  cut: { icon: 'cut', label: 'action.cut', key: 'Ctrl+X', enabled: hasPageBlock, run: () => copyBlock({ cut: true }) },
  copy: { icon: 'copy', label: 'action.copy', key: 'Ctrl+C', enabled: hasPageBlock, run: () => copyBlock() },
  paste: { icon: 'paste', label: 'action.paste', key: 'Ctrl+V', enabled: hasDoc, run: () => pasteBlocks() },
  duplicate: { icon: 'duplicate', label: 'action.duplicate', key: 'Ctrl+D', enabled: hasPageBlock, run: () => duplicateBlock() },
  delete: { icon: 'trash', label: 'action.delete', key: 'Delete', enabled: hasPageBlock, run: () => deleteBlock() },
  moveUp: { icon: 'arrowUp', label: 'action.moveUp', key: 'Ctrl+Up', enabled: () => hasPageBlock() && currentPage().blocks[0]?.id !== state.selected, run: () => moveBlock(-1) },
  moveDown: { icon: 'arrowDown', label: 'action.moveDown', key: 'Ctrl+Down', enabled: () => hasPageBlock() && currentPage().blocks.at(-1)?.id !== state.selected, run: () => moveBlock(1) },
  toggleHidden: { icon: 'showHidden', label: 'action.toggleHidden', key: 'Ctrl+H', enabled: hasBlock, checked: () => Boolean(selectedBlock()?.style?.hidden), run: () => toggleHidden() },
  selectNext: { icon: 'chevronDown', label: 'action.selectNext', key: 'Alt+Down', enabled: hasDoc, run: () => selectStep(1) },
  selectPrev: { icon: 'chevronUp', label: 'action.selectPrev', key: 'Alt+Up', enabled: hasDoc, run: () => selectStep(-1) },
  clearSelection: { icon: 'deselect', label: 'action.clearSelection', key: 'Esc', enabled: hasBlock, run: () => select(null) },
  editContent: { icon: 'edit', label: 'action.editContent', key: 'Enter', enabled: hasBlock, run: () => focusField(state.selected, null) },
  // insert
  addBlock: { icon: 'addBlock', label: 'action.addBlock', key: 'Ctrl+Shift+A', enabled: hasDoc, run: (context) => addBlockMenu(context?.anchor) },
  ...Object.fromEntries(PAGE_BLOCK_TYPES.map((type) => [`block:${type}`, { icon: BLOCKS[type].icon, label: `block.${type}`, enabled: hasDoc, run: () => insertBlock(type) }])),
  editHeader: { icon: 'blkNavbar', label: 'action.editHeader', enabled: hasDoc, run: () => focusField(site().layout.header.id, null) },
  editFooter: { icon: 'blkFooter', label: 'action.editFooter', enabled: hasDoc, run: () => focusField(site().layout.footer.id, null) },
  // pages
  addPage: { icon: 'addPage', label: 'action.addPage', key: 'Ctrl+Shift+N', enabled: () => Boolean(activeDoc()), run: () => addPageAsk() },
  duplicatePage: { icon: 'pageDuplicate', label: 'action.duplicatePage', enabled: hasDoc, run: () => duplicatePage() },
  renamePage: { icon: 'pageRename', label: 'action.renamePage', key: 'F2', enabled: hasDoc, run: () => renamePage() },
  deletePage: { icon: 'pageDelete', label: 'action.deletePage', enabled: () => hasDoc() && site().pages.length > 1, run: () => deletePage() },
  pageLeft: { icon: 'chevronLeft', label: 'action.pageLeft', enabled: () => hasDoc() && site().pages[0] !== currentPage(), run: () => movePage(-1) },
  pageRight: { icon: 'chevronRight', label: 'action.pageRight', enabled: () => hasDoc() && site().pages.at(-1) !== currentPage(), run: () => movePage(1) },
  nextPage: { icon: 'pageNext', label: 'action.nextPage', key: 'Ctrl+PageDown', enabled: () => hasDoc() && site().pages.length > 1, run: () => pageStep(1) },
  prevPage: { icon: 'pagePrev', label: 'action.prevPage', key: 'Ctrl+PageUp', enabled: () => hasDoc() && site().pages.length > 1, run: () => pageStep(-1) },
  pageProps: { icon: 'pageProps', label: 'action.pageProps', enabled: hasDoc, run: () => showEditorTab('page') },
  // view
  ...Object.fromEntries(Object.keys(DEVICES).map((id) => [`device:${id}`, { icon: `dev${id[0].toUpperCase()}${id.slice(1)}`, label: `device.${id}`, enabled: hasDoc, checked: () => hasDoc() && activeDoc().view.device === id, run: () => setDevice(id) }])),
  zoomIn: { icon: 'zoomIn', label: 'action.zoomIn', key: 'Ctrl+=', enabled: () => hasDoc() && zoomPercent() < CANVAS_ZOOM.max, run: () => zoomBy(1) },
  zoomOut: { icon: 'zoomOut', label: 'action.zoomOut', key: 'Ctrl+-', enabled: () => hasDoc() && zoomPercent() > CANVAS_ZOOM.min, run: () => zoomBy(-1) },
  zoomReset: { icon: 'zoomReset', label: 'action.zoomReset', key: 'Ctrl+0', enabled: hasDoc, run: () => setZoom(100) },
  zoomFit: { icon: 'zoomFit', label: 'action.zoomFit', key: 'Ctrl+Shift+W', enabled: hasDoc, run: () => fitWidth() },
  previewMode: { icon: 'eye', label: 'action.previewMode', key: 'Ctrl+E', enabled: hasDoc, checked: () => state.preview, run: () => togglePreview() },
  leftPanel: { icon: 'panelLeft', label: 'action.blocksPanel', key: 'Ctrl+Shift+1', checked: () => state.settings.showLeftPanel, run: () => toggle('showLeftPanel') },
  rightPanel: { icon: 'panelRight', label: 'action.sitePanel', key: 'Ctrl+Shift+2', checked: () => state.settings.showRightPanel, run: () => toggle('showRightPanel') },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => state.settings.showStatusBar, run: () => toggle('showStatusBar') },
  theme: { icon: 'palette', label: 'action.themeRandom', run: () => updateSettings({ theme: randomThemeId(state.settings.theme) }) },
  themeMenu: { icon: 'chevronDown', label: 'action.themeChoose', run: (context) => openThemePicker(context?.anchor) },
  language: { icon: 'globe', label: 'action.language', key: 'Ctrl+Shift+L', run: () => updateSettings({ language: getLanguage() === 'ko' ? 'en' : 'ko' }) },
  shuffleBackground: { icon: 'dice', label: 'action.shuffleBackground', key: 'Ctrl+Shift+B', run: () => shuffleBackground() },
  backgroundImage: { icon: 'imageBg', label: 'action.backgroundImage', run: () => chooseBackground() },
  clearBackground: { icon: 'imageClear', label: 'action.clearBackground', enabled: () => Boolean(state.settings.backgroundImage) || state.settings.backgroundKind !== 'none', run: () => removeBackground() },
  // design
  designPicker: { icon: 'designPicker', label: 'action.designPicker', key: 'Ctrl+Shift+D', enabled: () => Boolean(activeDoc()), run: () => pickDesign() },
  randomDesign: { icon: 'dice', label: 'action.randomDesign', enabled: () => Boolean(activeDoc()), run: () => randomDesign() },
  resetDesign: { icon: 'refresh', label: 'action.resetDesign', enabled: () => Boolean(activeDoc()) && Object.keys(site().design.overrides ?? {}).length > 0, run: () => setDesign({ id: site().design.id }, { reset: true }) },
  // tools
  checkSite: { icon: 'checkSite', label: 'action.checkSite', enabled: () => Boolean(activeDoc()), run: () => checkSite() },
  siteStats: { icon: 'blkStats', label: 'action.siteStats', enabled: () => Boolean(activeDoc()), run: () => showStats() },
  settings: { icon: 'gear', label: 'action.settings', key: 'Ctrl+,', run: () => popups.open('settings', { tab: 'general' }) },
  // help
  tutorial: { icon: 'tutorial', label: 'action.tutorial', key: 'F11', run: () => startTutorial() },
  userGuide: { icon: 'userGuide', label: 'action.userGuide', run: () => openDocWindow('guide') },
  tutorialDoc: { icon: 'tutorialDoc', label: 'action.tutorialDoc', run: () => openDocWindow('tutorial') },
  shortcuts: { icon: 'keyboard', label: 'action.shortcuts', run: () => popups.open('settings', { tab: 'shortcuts' }) },
  about: { icon: 'info', label: 'action.about', key: 'F1', run: () => popups.open('about') },
  welcome: { icon: 'bulb', label: 'action.welcome', run: () => openWelcome() },
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
  if (!command || !commandEnabled(id)) return undefined;
  try {
    return await command.run(context);
  } catch (error) {
    return showError('error.command', error, t(command.label));
  }
}

function undo() {
  state.view?.finishEdit?.(true);
  const label = activeDoc()?.undo();
  if (label != null) afterHistory(t('notice.undone', { label }));
}

function redo() {
  state.view?.finishEdit?.(true);
  const label = activeDoc()?.redo();
  if (label != null) afterHistory(t('notice.redone', { label }));
}

function afterHistory(text) {
  afterChange();
  notify('info', text);
}

function showEditorTab(tab) {
  state.rightTab = tab;
  if (!state.settings.showRightPanel) updateSettings({ showRightPanel: true });
  renderRight();
}

// ───────────────────────── layout

const SUBMENUS = {
  exportTo: { icon: 'publish', items: ['publish', '-', 'publishFolder', 'publishZip', 'exportPage', 'copyPageHtml', '-', 'previewBrowser'] },
  zoom: { icon: 'zoomIn', items: ['zoomIn', 'zoomOut', 'zoomReset', 'zoomFit'] },
  device: { icon: 'devDesktop', items: ['device:desktop', 'device:tablet', 'device:mobile'] },
  appearance: { icon: 'palette', items: ['theme', 'themeMenu', 'language', '-', 'shuffleBackground', 'backgroundImage', 'clearBackground'] },
  panels: { icon: 'panelLeft', items: ['leftPanel', 'rightPanel', 'statusBar'] },
  ...Object.fromEntries(BLOCK_GROUPS.filter((g) => g.id !== 'site').map((g) => [`insert:${g.id}`, { icon: g.icon, items: PAGE_BLOCK_TYPES.filter((type) => BLOCKS[type].group === g.id).map((type) => `block:${type}`) }])),
};
const sub = (key) => ({ sub: key });
const MENUS = {
  file: ['new', 'newFromTemplate', 'openSample', 'open', 'startPage', 'recent', 'recentFolders', 'clearRecent', '-', 'save', 'saveAs', 'saveTemplate', '-', 'previewBrowser', sub('exportTo'), '-', 'siteProps', '-', 'closeSite', '-', 'exit'],
  edit: ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'duplicate', 'delete', '-', 'moveUp', 'moveDown', 'toggleHidden', '-', 'selectPrev', 'selectNext', 'clearSelection', 'editContent'],
  insert: ['addBlock', '-', ...BLOCK_GROUPS.filter((g) => g.id !== 'site').map((g) => sub(`insert:${g.id}`)), '-', 'editHeader', 'editFooter'],
  page: ['addPage', 'duplicatePage', 'renamePage', 'deletePage', '-', 'pageLeft', 'pageRight', '-', 'prevPage', 'nextPage', '-', 'pageProps'],
  view: [sub('device'), sub('zoom'), '-', 'previewMode', '-', sub('panels'), '-', sub('appearance')],
  design: ['designPicker', 'randomDesign', 'resetDesign', '-', 'siteProps'],
  tools: ['checkSite', 'siteStats', '-', 'previewBrowser', 'publish', '-', 'settings'],
  help: ['welcome', 'tutorial', 'tutorialDoc', 'userGuide', 'shortcuts', '-', 'settings', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', insert: 'addBlock', page: 'pageItem', view: 'eye', design: 'palette', tools: 'gear', help: 'question' };

const TOOLBAR = [
  ['new', 'open', 'save', 'publishSplit', 'previewBrowser'],
  ['undo', 'redo'],
  ['cut', 'copy', 'paste', 'delete'],
  ['addBlock', 'addPage'],
  ['moveUp', 'moveDown', 'duplicate', 'toggleHidden'],
  ['device:desktop', 'device:tablet', 'device:mobile', 'zoom', 'zoomFit'],
  ['previewMode', 'designPicker', 'checkSite'],
  ['leftPanel', 'rightPanel'],
];
/** Right end of the toolbar: tutorial, theme (random + dropdown), language, settings, about. */
const TOOLBAR_RIGHT = ['tutorial', 'themeSplit', 'language', 'settings', 'about'];

function renderShell() {
  root.innerHTML = `
    <div class="app-bg" aria-hidden="true"><canvas class="anim-bg"></canvas><div class="image-bg"></div></div>
    <nav id="menubar" role="menubar"></nav>
    <div id="toolbar" role="toolbar"></div>
    <main id="workspace">
      <aside id="left-panel" class="side-panel" aria-label="${escapeHtml(t('panel.blocks'))}"></aside>
      <div class="splitter vertical panel-split" data-split="left" title="${escapeHtml(t('tip.panelSplitter'))}" role="separator" aria-orientation="vertical"></div>
      <section id="center">
        <div id="tabs"></div>
        <div id="center-body">
          <div id="view-host" class="view-host"></div>
          <div id="start-page" hidden></div>
          <div class="drop-overlay" aria-hidden="true"><div>${icon('drop')}<span></span></div></div>
        </div>
      </section>
      <div class="splitter vertical panel-split" data-split="right" title="${escapeHtml(t('tip.panelSplitter'))}" role="separator" aria-orientation="vertical"></div>
      <aside id="right-panel" class="side-panel" aria-label="${escapeHtml(t('panel.site'))}"></aside>
    </main>
    <footer id="statusbar" role="status"></footer>
    ${desktop ? `<div class="resize-grip" data-resize-grip title="${escapeHtml(t('tip.resize'))}" aria-label="${escapeHtml(t('tip.resize'))}" role="separator">${icon('grip')}</div>` : `<div class="resize-grip static" title="${escapeHtml(t('tip.resize'))}" aria-hidden="true">${icon('grip')}</div>`}
    <div id="tutorial-layer"></div>
    <div id="datalists" hidden></div>
    <div class="block-ghost" hidden></div>`;
}

function renderMenubar() {
  const menubar = root.querySelector('#menubar');
  const onStart = state.showStart || !activeDoc();
  const home = `<button class="menubar-item menubar-home ${onStart ? 'current' : ''}" data-home title="${escapeHtml(t('tip.home'))}" aria-label="${escapeHtml(t('menu.home'))}" aria-pressed="${onStart}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button><span class="menubar-sep" aria-hidden="true"></span>`;
  const brand = `<div class="app-brand" data-window-drag title="${escapeHtml(`MyHomeMaker v${VERSION}`)}"><img class="app-brand-icon" src="${APP_ICON}" alt="" data-window-drag /><span class="app-brand-name" data-window-drag>MyHomeMaker</span><span class="app-brand-version" data-window-drag>v${escapeHtml(VERSION)}</span><span class="app-brand-project" data-window-drag><span class="app-brand-project-name" data-window-drag></span><span class="app-brand-dirty" data-window-drag>●</span></span></div>`;
  const button = (id, glyph, key) => `<button class="window-button ${id === 'close' ? 'close' : ''}" data-window="${id}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(glyph)}</button>`;
  const controls = desktop ? `<div class="window-controls">${button('minimize', 'winMinimize', 'window.minimize')}${state.maximized ? button('maximize', 'winRestore', 'window.restore') : button('maximize', 'winMaximize', 'window.maximize')}${button('close', 'winClose', 'window.close')}</div>` : '';
  menubar.innerHTML = brand + home + Object.keys(MENUS).map((name) => `
    <button class="menubar-item ${state.openMenu === name ? 'open' : ''}" data-menu="${name}" role="menuitem" aria-haspopup="true" title="${escapeHtml(t(`menu.${name}`))}">${icon(MENU_ICONS[name])}<span>${escapeHtml(t(`menu.${name}`))}</span></button>`).join('')
    + `<div class="menubar-drag" data-window-drag></div>${controls}`;
  renderTitleProject();
}

/** The open site in the title bar: a fixed width, … when longer, ● for unsaved changes. */
function renderTitleProject() {
  const box = root.querySelector('.app-brand-project');
  if (!box) return;
  const doc = state.showStart ? null : activeDoc();
  box.classList.toggle('empty', !doc);
  box.classList.toggle('dirty', Boolean(doc?.dirty));
  box.querySelector('.app-brand-project-name').textContent = doc ? docName(doc) : '';
  box.title = doc ? `${doc.path ?? docName(doc)}${doc.dirty ? ` (${t('status.modified')})` : ''}` : '';
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
  // The menu (popup.js) only closes on losing the focus when this window got it through a click or a key.
  const mark = (key) => { try { globalThis.localStorage?.setItem(key, String(Date.now())); } catch { /* private mode */ } };
  for (const type of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(type, () => mark('myhomemaker.main.input'), { capture: true, passive: true });
  window.addEventListener('focus', () => mark('myhomemaker.main.focus'));
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
  const labeled = (id) => `<button class="tool-button tool-labeled" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(commands[id].label))}">${icon(commands[id].icon)}<span>${escapeHtml(t(`toolbar.${id}`))}</span></button>`;
  const button = (id) => {
    if (id === 'zoom') {
      return `<span class="stepper toolbar-zoom" title="${escapeHtml(t('tip.zoomValue'))}">
        <button class="tool-button stepper-button-tool" data-command="zoomOut" title="${escapeHtml(commandTip('zoomOut'))}" aria-label="${escapeHtml(t('action.zoomOut'))}">${icon('minus')}</button>
        <input class="stepper-value" id="zoom-value" type="text" inputmode="decimal" value="${zoomPercent()}%" title="${escapeHtml(t('tip.zoomValue'))}" aria-label="${escapeHtml(t('tip.zoomValue'))}" />
        <button class="tool-button stepper-button-tool" data-command="zoomIn" title="${escapeHtml(commandTip('zoomIn'))}" aria-label="${escapeHtml(t('action.zoomIn'))}">${icon('plus')}</button>
      </span>`;
    }
    if (id === 'addBlock' || id === 'publish' || id === 'previewMode') return labeled(id);
    if (id === 'publishSplit') return `<span class="split-button">${labeled('publish')}<button class="tool-button split-arrow" data-command="publishMenu" title="${escapeHtml(commandTip('publishMenu'))}" aria-label="${escapeHtml(t('action.publishMenu'))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
    if (id === 'themeSplit') return `<span class="split-button">${plain('theme')}<button class="tool-button split-arrow" data-command="themeMenu" title="${escapeHtml(commandTip('themeMenu'))}" aria-label="${escapeHtml(t('action.themeChoose'))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
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
  for (const element of root.querySelectorAll('#toolbar [data-command]')) {
    const id = element.dataset.command;
    element.disabled = !commandEnabled(id);
    element.title = commandTip(id);
    const checked = commands[id]?.checked?.();
    element.classList.toggle('active', Boolean(checked));
    if (checked !== undefined) element.setAttribute('aria-pressed', String(Boolean(checked)));
  }
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
    const menus = [...root.querySelectorAll('.app-brand, .menubar-item, .window-controls')].reduce((sum, el) => sum + el.offsetWidth + 2, 48);
    const width = Math.ceil(Math.max(menus, left.scrollWidth + right.scrollWidth + 24 + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2));
    if (Math.abs(width - state.minWidth) < 1) return;
    state.minWidth = width;
    document.documentElement.style.setProperty('--min-width', `${width}px`);
    native.setMinimumSize(width, 640).catch(() => {});
  });
}

// ───────────────────────── page tabs

function renderTabs() {
  renderTitleProject();
  const tabs = root.querySelector('#tabs');
  const doc = activeDoc();
  tabs.hidden = !doc || state.showStart;
  if (tabs.hidden) { tabs.innerHTML = ''; return; }
  const scroll = tabs.querySelector('.tab-strip')?.scrollLeft ?? 0;
  const current = doc.page?.id;
  tabs.innerHTML = `
    <div class="tab-strip"><div class="tab-list" role="tablist" aria-label="${escapeHtml(t('tabs.pages'))}">
      ${doc.site.pages.map((p, i) => `<div class="tab ${p.id === current ? 'active' : ''} ${p.nav === false ? 'off-nav' : ''}" role="tab" aria-selected="${p.id === current}" data-page-tab="${escapeHtml(p.id)}" title="${escapeHtml(`${p.name} — ${pageFile(p)}`)}">${icon(i === 0 ? 'pageHome' : 'pageItem')}<span class="tab-name">${escapeHtml(p.name || '—')}</span></div>`).join('')}
    </div></div>
    <button class="tab-add" data-command="addPage" title="${escapeHtml(commandTip('addPage'))}" aria-label="${escapeHtml(t('action.addPage'))}">${icon('plus')}</button>
    <div class="tab-nav">
      <button class="tab-scroll" data-tab-scroll="-1" title="${escapeHtml(t('tabs.left'))}" aria-label="${escapeHtml(t('tabs.left'))}">${icon('chevronLeft')}</button>
      <button class="tab-scroll" data-tab-scroll="1" title="${escapeHtml(t('tabs.right'))}" aria-label="${escapeHtml(t('tabs.right'))}">${icon('chevronRight')}</button>
    </div>`;
  tabs.querySelector('.tab-strip').scrollLeft = scroll;
  updateTabNav();
  if (current !== renderTabs.shown) { renderTabs.shown = current; scrollActiveTabIntoView(); }
}

function updateTabNav() {
  const tabs = root.querySelector('#tabs');
  const strip = tabs?.querySelector('.tab-strip');
  if (!strip) return;
  tabs.classList.toggle('overflow', strip.scrollWidth > strip.clientWidth + 1);
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
  if (tab.offsetLeft < strip.scrollLeft) strip.scrollLeft = tab.offsetLeft;
  else if (tab.offsetLeft + tab.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = tab.offsetLeft + tab.offsetWidth - strip.clientWidth;
  updateTabNav();
}

// ───────────────────────── left panel (Blocks)

function renderBlocksPanel() {
  const panel = root.querySelector('#left-panel');
  if (!panel) return;
  const L = lang();
  const compact = state.settings.toolboxCompact;
  if (!state.settings.showLeftPanel) {
    panel.innerHTML = `<div class="panel-rail">
      <button class="rail-button expand" data-command="leftPanel" title="${escapeHtml(t('panel.expandLeft'))}" aria-label="${escapeHtml(t('panel.expandLeft'))}">${icon('chevronRight')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button>
      <div class="rail-title" title="${escapeHtml(t('panel.blocks'))}">${icon('toolbox')}<span>${escapeHtml(t('panel.blocksShort'))}</span></div>
      ${['hero', 'heading', 'text', 'image', 'features', 'gallery', 'contact'].map((type) => `<button class="rail-button block-item" data-block-type="${type}" title="${escapeHtml(blockLabel(type, L))}">${icon(BLOCKS[type].icon)}</button>`).join('')}
    </div>`;
    return;
  }
  const query = state.toolboxQuery.trim().toLowerCase();
  const body = BLOCK_GROUPS.filter((g) => g.id !== 'site').map((group) => {
    const all = PAGE_BLOCK_TYPES.filter((type) => BLOCKS[type].group === group.id);
    const list = query ? all.filter((type) => `${BLOCKS[type].ko} ${BLOCKS[type].en} ${type}`.toLowerCase().includes(query)) : all;
    if (!list.length) return '';
    const collapsed = !query && state.collapsedToolbox.has(group.id);
    return `<section class="tool-section ${collapsed ? 'collapsed' : ''}"><header><button class="stencil-toggle" data-toolbox-toggle="${group.id}" aria-expanded="${!collapsed}" title="${escapeHtml(group[L])}">${icon(collapsed ? 'caretRight' : 'caretDown', 'icon tiny')}${icon(group.icon)}<span>${escapeHtml(group[L])}</span><span class="count">${list.length}</span></button></header>
      ${collapsed ? '' : `<div class="tool-list block-list ${compact ? 'compact' : ''}">${list.map((type) => `<button class="tool-item block-item" data-block-type="${type}" title="${escapeHtml(`${blockLabel(type, L)} — ${t('blocks.tip')}`)}">${icon(BLOCKS[type].icon)}${compact ? '' : `<span>${escapeHtml(blockLabel(type, L))}</span>`}</button>`).join('')}</div>`}</section>`;
  }).join('');
  const s = site();
  const globals = s && !state.showStart ? `<section class="tool-section"><header><span class="stencil-toggle static">${icon('blkNavbar')}<span>${escapeHtml(BLOCK_GROUPS.find((g) => g.id === 'site')[L])}</span></span></header>
    <div class="tool-list block-list ${compact ? 'compact' : ''}"><button class="tool-item" data-command="editHeader" title="${escapeHtml(t('action.editHeader'))}">${icon('blkNavbar')}${compact ? '' : `<span>${escapeHtml(t('action.editHeader'))}</span>`}</button><button class="tool-item" data-command="editFooter" title="${escapeHtml(t('action.editFooter'))}">${icon('blkFooter')}${compact ? '' : `<span>${escapeHtml(t('action.editFooter'))}</span>`}</button></div></section>` : '';
  panel.innerHTML = `
    <div class="panel-header">${icon('toolbox')}<span>${escapeHtml(t('panel.blocks'))}</span>
      <button class="icon-button ${compact ? 'active' : ''}" data-toolbox-compact title="${escapeHtml(t('blocks.compact'))}" aria-pressed="${compact}">${icon('gridView')}</button>
      <button class="icon-button" data-command="leftPanel" title="${escapeHtml(t('panel.collapseLeft'))}" aria-label="${escapeHtml(t('panel.collapseLeft'))}">${icon('chevronLeft')}</button></div>
    <div class="shapes-tools">
      <label class="search-box" title="${escapeHtml(t('blocks.searchTip'))}">${icon('search')}<input id="toolbox-search" type="search" value="${escapeHtml(state.toolboxQuery)}" placeholder="${escapeHtml(t('blocks.search'))}" aria-label="${escapeHtml(t('blocks.searchTip'))}" /></label>
      <p class="panel-hint small">${icon('info')}<span>${escapeHtml(t('blocks.hint'))}</span></p>
    </div>
    <div class="stencils toolbox">${body || `<p class="panel-hint">${escapeHtml(t('blocks.none'))}</p>`}${query ? '' : globals}</div>`;
}

// ───────────────────────── right panel (Site tree + editors)

function treeHtml() {
  const s = site();
  if (!s) return '';
  const L = lang();
  const current = currentPage()?.id;
  const node = (id, glyph, label, { depth = 0, selected = false, page = '', caret = null, hidden = false, file = '' } = {}) => `<div class="tree-row ${selected ? 'selected' : ''} ${hidden ? 'faded' : ''}" style="padding-left:${6 + depth * 16}px" ${page ? `data-tree-page="${escapeHtml(page)}"` : `data-tree-block="${escapeHtml(id)}"`} title="${escapeHtml(label)}">${caret === null ? '<span class="tree-caret"></span>' : `<button class="tree-caret" data-tree-toggle="${escapeHtml(page)}" aria-label="${escapeHtml(t('tree.toggle'))}">${icon(caret ? 'caretRight' : 'caretDown', 'icon tiny')}</button>`}${icon(glyph)}<span class="tree-name">${escapeHtml(label)}</span>${file ? `<span class="tree-file">${escapeHtml(file)}</span>` : ''}</div>`;
  const rows = [node(s.layout.header.id, 'blkNavbar', blockLabel('navbar', L), { selected: state.selected === s.layout.header.id })];
  s.pages.forEach((page, i) => {
    const collapsed = state.collapsedTree.has(page.id) || (page.id !== current && !state.collapsedTree.has(`open:${page.id}`));
    rows.push(node(page.id, i === 0 ? 'pageHome' : 'pageItem', page.name, { page: page.id, selected: page.id === current && !state.selected, caret: page.blocks.length ? collapsed : null, file: pageFile(page) }));
    if (!collapsed) for (const block of page.blocks) rows.push(node(block.id, BLOCKS[block.type]?.icon ?? 'blkText', blockTitle(block), { depth: 1, selected: state.selected === block.id, hidden: block.style?.hidden }));
  });
  rows.push(node(s.layout.footer.id, 'blkFooter', blockLabel('footer', L), { selected: state.selected === s.layout.footer.id }));
  return `<div class="site-tree" role="tree">${rows.join('')}</div>`;
}

/** "Hero banner · Show your story": the kind and the first line of its title. */
function blockTitle(block) {
  const p = block.props ?? {};
  const text = String(p.title ?? p.brand ?? p.text ?? p.label ?? p.body ?? '').split('\n')[0].replace(/[*#[\]`]/g, '').trim();
  return `${blockLabel(block.type, lang())}${text ? ` · ${text.slice(0, 28)}` : ''}`;
}

function renderRight() {
  const panel = root.querySelector('#right-panel');
  if (!panel) return;
  if (!state.settings.showRightPanel) {
    panel.innerHTML = `<div class="panel-rail">
      <button class="rail-button expand" data-command="rightPanel" title="${escapeHtml(t('panel.expandRight'))}" aria-label="${escapeHtml(t('panel.expandRight'))}">${icon('chevronLeft')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button>
      <div class="rail-title">${icon('pagesTree')}<span>${escapeHtml(t('panel.siteShort'))}</span></div></div>`;
    return;
  }
  if (!panel.querySelector('#site-tree')) {
    panel.innerHTML = `
      <div class="panel-header">${icon('pagesTree')}<span>${escapeHtml(t('panel.site'))}</span>
        <button class="icon-button" data-command="addPage" title="${escapeHtml(t('action.addPage'))}">${icon('addPage')}</button>
        <button class="icon-button" data-command="addBlock" title="${escapeHtml(t('action.addBlock'))}">${icon('addBlock')}</button>
        <button class="icon-button" data-command="rightPanel" title="${escapeHtml(t('panel.collapseRight'))}" aria-label="${escapeHtml(t('panel.collapseRight'))}">${icon('chevronRight')}</button></div>
      <div id="site-tree" class="explorer"></div>
      <div class="splitter horizontal" data-split="explorer" title="${escapeHtml(t('tip.panelSplitter'))}" role="separator" aria-orientation="horizontal"></div>
      <div id="editor-tabs" class="editor-tabs" role="tablist"></div>
      <div id="editors" class="editors"></div>`;
    bindExplorerSplitter(panel.querySelector('[data-split="explorer"]'));
  }
  panel.style.setProperty('--explorer-height', `${state.settings.explorerHeight}%`);
  const tree = panel.querySelector('#site-tree');
  const scroll = tree.scrollTop;
  tree.innerHTML = activeDoc() && !state.showStart ? treeHtml() : `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('editors.noSite'))}</span></p>`;
  tree.scrollTop = scroll;
  tree.querySelector('.tree-row.selected')?.scrollIntoView({ block: 'nearest' });
  renderEditors();
}

function renderEditors() {
  const host = root.querySelector('#editors');
  const tabsHost = root.querySelector('#editor-tabs');
  if (!host || !tabsHost) return;
  const focused = document.activeElement;
  if (focused && host.contains(focused) && focused.matches('input[type="text"], textarea, input[type="search"]')) {
    clearTimeout(renderEditors.timer);
    renderEditors.timer = setTimeout(() => { if (!host.contains(document.activeElement)) renderEditors(); }, 400);
    return;
  }
  tabsHost.innerHTML = EDITOR_TABS.map(([id, glyph]) => `<button class="editor-tab ${state.rightTab === id ? 'active' : ''}" data-editor-tab="${id}" role="tab" aria-selected="${state.rightTab === id}" title="${escapeHtml(t(`editors.${id}`))}">${icon(glyph)}<span>${escapeHtml(t(`editors.${id}`))}</span></button>`).join('');
  const doc = activeDoc();
  if (!doc || state.showStart) { host.innerHTML = `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('editors.noSite'))}</span></p>`; return; }
  root.querySelector('#datalists').innerHTML = pagesDatalist(doc.site);
  const scroll = host.scrollTop;
  const block = selectedBlock();
  const html = {
    content: () => contentHtml(appApi, block),
    style: () => styleHtml(appApi, block),
    page: () => pageEditorHtml(appApi, doc.site, doc.page),
    site: () => siteHtml(appApi, doc.site),
  }[state.rightTab]?.() ?? '';
  host.innerHTML = `<div class="editor-body">${html}</div>`;
  host.scrollTop = scroll;
}

function bindExplorerSplitter(splitter) {
  splitter.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const panel = root.querySelector('#right-panel');
    const rect = panel.getBoundingClientRect();
    pointerDrag(event, {
      cursor: 'row-resize',
      move: (dx, dy, e) => {
        const pct = Math.max(15, Math.min(80, ((e.clientY - rect.top) / rect.height) * 100));
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
  const doc = activeDoc();
  const s = state.settings;
  const notice = state.notice;
  const items = [];
  items.push(`<span class="status-notice ${notice?.kind ?? ''}" title="${escapeHtml(notice?.text ?? t('status.ready'))}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(notice?.text ?? t('status.ready'))}</span></span>`);
  if (doc && !state.showStart) {
    const stats = S.siteStats(doc.site);
    items.push(`<span class="status-item" title="${escapeHtml(t('status.pageTip'))}">${icon('pageItem')}<span>${escapeHtml(`${doc.page.name} · ${pageFile(doc.page)}`)}</span></span>`);
    items.push(`<span class="status-item" title="${escapeHtml(t('status.siteTip'))}">${icon('pagesTree')}<span>${escapeHtml(t('status.counts', { pages: stats.pages, blocks: stats.blocks }))}</span></span>`);
    items.push(`<span class="status-item ${doc.dirty ? 'modified' : 'saved'}" title="${escapeHtml(doc.path ?? t('status.unsavedFile'))}">${icon(doc.dirty ? 'edit' : 'save')}<span>${escapeHtml(doc.dirty ? t('status.modified') : t('status.saved'))}</span></span>`);
    const block = selectedBlock();
    if (block) items.push(`<span class="status-item" title="${escapeHtml(t('status.blockTip'))}">${icon(BLOCKS[block.type].icon)}<span>${escapeHtml(blockLabel(block.type, lang()))}</span></span>`);
    if (state.editingField) items.push(`<span class="status-item warn" title="${escapeHtml(t('status.editingTip'))}">${icon('textTool')}<span>${escapeHtml(t('status.editing', { field: state.editingField }))}</span></span>`);
    if (state.preview) items.push(`<button class="status-item warn" data-command="previewMode" title="${escapeHtml(commandTip('previewMode'))}">${icon('eye')}<span>${escapeHtml(t('status.preview'))}</span></button>`);
    items.push(`<span class="status-item" title="${escapeHtml(t('status.deviceTip'))}">${icon(`dev${doc.view.device[0].toUpperCase()}${doc.view.device.slice(1)}`)}<span>${escapeHtml(`${t(`device.${doc.view.device}`)} ${DEVICES[doc.view.device]}px`)}</span></span>`);
    items.push(`<span class="status-item" title="${escapeHtml(t('status.designTip'))}">${icon('designPicker')}<span>${escapeHtml(designById(doc.site.design.id)[lang()])}</span></span>`);
  }
  items.push(`<span class="status-item" title="${escapeHtml(t('status.theme', { name: themeName(s.theme, getLanguage()) }))}">${icon('palette')}<span>${escapeHtml(themeName(s.theme, getLanguage()))}</span></span>`);
  items.push(`<span class="status-item" title="${escapeHtml(t('status.language'))}">${icon('globe')}<span>${escapeHtml(t('status.language'))}</span></span>`);
  if (doc && !state.showStart) {
    const z = zoomPercent();
    const steps = CANVAS_ZOOM.steps;
    items.push(`<label class="status-item zoom-slider" title="${escapeHtml(t('status.zoomTip'))}">${icon('zoomIn')}<input type="range" id="zoom-slider" min="0" max="${steps.length - 1}" step="1" value="${Math.max(0, steps.findIndex((v) => v >= z))}" aria-label="${escapeHtml(t('status.zoomTip'))}" /><span id="status-zoom">${z}%</span></label>`);
    items.push(`<button class="status-item" data-command="zoomFit" title="${escapeHtml(commandTip('zoomFit'))}">${icon('zoomFit')}</button>`);
  }
  if (s.statusClock) items.push(`<span class="status-item clock" title="${escapeHtml(t('status.clock'))}">${icon('clock')}<span id="status-clock">${escapeHtml(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span></span>`);
  bar.innerHTML = items.join('');
}

function editingChanged(field) {
  state.editingField = field;
  renderStatus();
}

function renderAll() {
  root.classList.toggle('no-status', !state.settings.showStatusBar);
  root.classList.toggle('no-left', !state.settings.showLeftPanel);
  root.classList.toggle('no-right', !state.settings.showRightPanel);
  root.classList.toggle('previewing', state.preview);
  root.style.setProperty('--left-width', `${state.settings.leftWidth}px`);
  root.style.setProperty('--right-width', `${state.settings.rightWidth}px`);
  root.style.setProperty('--zoom', String(state.settings.zoom / 100));
  renderMenubar();
  if (toolbarLanguage !== getLanguage()) renderToolbar(); else renderToolbarState();
  renderTabs();
  renderBlocksPanel();
  if (!state.showStart && activeDoc() && !state.view) mountView();
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

function showStartPage(show = true) {
  state.view?.finishEdit?.();
  state.showStart = show;
  if (show) { state.view?.destroy(); state.view = null; }
  mountView();
  renderAll();
}

async function onStartAction(target) {
  const value = target.dataset.value;
  switch (target.dataset.start) {
    case 'new': return newSiteAsk();
    case 'template': return newSiteAsk(value);
    case 'open': return openWithDialog();
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
    case 'animation': updateSettings({ animation: value, backgroundKind: 'animated' }); return notify('info', t('notice.animation', { name: t(`animation.${value}`) }));
    case 'shuffle': return shuffleBackground();
    case 'background-image': return chooseBackground();
    default: return undefined;
  }
}

function templateMenu(anchor) {
  const handlers = Object.fromEntries(TEMPLATES.map(([id]) => [`custom:${id}`, () => newSiteAsk(id)]));
  return showMenu(TEMPLATES.map(([id, , glyph]) => ({ id: `custom:${id}`, label: t(`template.${id}`), icon: glyph })), anchor ?? anchorBelow(root.querySelector('[data-menu="file"]')), 'context', { handlers, header: { icon: 'templateNew', title: t('action.newFromTemplate') } });
}

function sampleMenu(anchor) {
  const handlers = {};
  const L = lang();
  const items = SAMPLE_GROUPS.map((group) => {
    const key = `samples:${group.id}`;
    const leaves = SAMPLES.filter((s) => s.group === group.id).map((s) => { handlers[`custom:sample:${s.id}`] = () => openSampleAsk(s.id); return { id: `custom:sample:${s.id}`, label: s[L][0], icon: s.icon }; });
    state.dynamicMenus.set(key, { items: leaves, handlers, header: { icon: group.icon, title: group[L] } });
    return { id: `submenu:${key}`, label: group[L], icon: group.icon, submenu: true };
  });
  return showMenu(items, anchor ?? anchorBelow(root.querySelector('[data-menu="file"]')), 'context', { handlers, header: { icon: 'samples', title: t('action.openSample') } });
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
  const showStart = state.showStart || !activeDoc();
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
    startBackground?.setKind(next);
    root.querySelector('#start-page .start-bg')?.classList.remove('fading');
  }, 450);
  return undefined;
}

function tickStartBackground() {
  const s = state.settings;
  const showing = (state.showStart || !activeDoc()) && s.backgroundKind === 'animated' && s.animationInterval > 0 && !document.hidden && !tutorial?.state().active;
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
  if (state.showStart || !activeDoc()) renderStartPage();
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
    if (state.showStart || !activeDoc()) renderStartPage();
    state.view?.render();
  }
  if (s.backgroundImage !== previous.backgroundImage) loadBackground();
  if (s.theme !== previous.theme && previous.theme) notify('info', t('notice.theme', { name: themeName(s.theme, getLanguage()) }));
  if ((state.showStart || !activeDoc()) && ['theme', 'customTheme', 'startShowRecent', 'startShowFolders', 'startShowSamples', 'startShowBackground', 'startShowTutorialBanner', 'startRecentCount', 'animation', 'backgroundKind'].some((key) => s[key] !== previous[key])) renderStartPage();
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
  const op = `op-${S.newId()}`;
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

async function openPath(path, { quiet = false } = {}) {
  const name = baseName(path);
  const existing = findOpenDoc(path);
  if (existing) { if (!quiet) notify('info', t('notice.alreadyOpen', { name })); return existing; }
  if (!(await confirmReplace())) return null;
  try {
    const content = await withProgress('progress.open', name, (op) => native.readTextFile(path, op));
    const template = isTemplateFileName(name);
    const doc = addDoc(new SiteDocument(S.parseSite(content), { path: template ? null : path, name: template ? stripExtension(name) : null, template }));
    rememberRecent({ path, title: doc.site.name });
    if (!quiet) notify('success', t('notice.opened', { name }));
    return doc;
  } catch (error) {
    showError('error.open', error, path);
    return null;
  }
}

async function openContent(name, content, handle = null) {
  if (!(await confirmReplace())) return null;
  try {
    const template = isTemplateFileName(name);
    const doc = addDoc(new SiteDocument(S.parseSite(content), { name: template ? stripExtension(name) : name, handle: template ? null : handle, template }));
    rememberRecent({ path: name, title: doc.site.name, web: true });
    notify('success', t('notice.opened', { name }));
    return doc;
  } catch (error) {
    showError('error.open', error, name);
    return null;
  }
}

async function openWithDialog(directory = null) {
  try {
    if (desktop) {
      const paths = await native.chooseSitesToOpen(directory ?? state.settings.lastDirectory);
      if (paths[0]) await openPath(paths[0]);
    } else {
      const files = await native.pickSiteFilesWeb();
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
    if (choice === 'remove') { state.recent = removeRecent(state.recent, path); storeRecent(globalThis.localStorage, state.recent); renderAll(); if (state.showStart) renderStartPage(); }
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
  if (state.showStart) renderStartPage();
}

async function recentFoldersMenu(anchor) {
  const items = state.recentDirs.length
    ? state.recentDirs.map((item, index) => ({ id: `custom:dir:${index}`, label: item.path, icon: 'folder' }))
    : [{ id: 'none', label: t('recent.noFolders'), icon: 'info', disabled: true }];
  const handlers = Object.fromEntries(state.recentDirs.map((item, index) => [`custom:dir:${index}`, () => openWithDialog(item.path)]));
  return showMenu(items, anchor ?? anchorBelow(root.querySelector('[data-menu="file"]')), 'context', { handlers, header: { icon: 'recentFolder', title: t('action.recentFolders') } });
}

const safeName = (doc) => fileSafe(doc.path ? stripExtension(baseName(doc.path)) : doc.site.name || 'site');

/** Saves the site (.myhome). New sites, templates and samples ask for a file name. */
async function saveDoc(doc, { saveAs = false } = {}) {
  if (!doc) return false;
  state.view?.finishEdit?.(true);
  const text = doc.text();
  const suggested = `${safeName(doc)}.myhome`;
  try {
    if (desktop) {
      let path = doc.path;
      if (!path || saveAs || extensionOf(path) !== 'myhome') {
        const dir = doc.path ? directoryOf(doc.path) : state.settings.lastDirectory;
        path = await native.chooseSavePath(dir ? `${dir}/${suggested}` : suggested, ['myhome']);
        if (!path) return false;
        path = withExtension(path, 'myhome');
      }
      await withProgress('progress.save', baseName(path), (op) => native.writeTextFile(path, text, op));
      doc.markSaved(path);
      doc.name = null;
      rememberRecent({ path, title: doc.site.name });
    } else {
      const saved = await native.saveFileWeb(text, { name: suggested, handle: doc.handle, saveAs: saveAs || !doc.handle });
      if (!saved) return false;
      doc.handle = saved.handle;
      doc.name = saved.name;
      doc.markSaved(null);
      if (saved.handle) native.storeWebHandle(saved.name, saved.handle);
      rememberRecent({ path: saved.name, title: doc.site.name, web: true });
    }
    persistSession();
    renderAll();
    notify('success', t('notice.saved', { name: docName(doc) }));
    return true;
  } catch (error) {
    showError('error.save', error, doc.path ?? docName(doc));
    return false;
  }
}

/** The site as a template (.mhomt): File › New can start from it later (open it once). */
async function saveTemplate() {
  const doc = activeDoc();
  if (!doc) return;
  const name = `${safeName(doc)}.mhomt`;
  await saveExport(name, 'mhomt', doc.text());
}

const MIMES = { mhomt: 'application/json', html: 'text/html', zip: 'application/zip' };

/** Saves exported content (text or bytes) with the save dialog (desktop) or a download (web). */
async function saveExport(name, type, content) {
  try {
    if (desktop) {
      const dir = state.settings.lastPublishDirectory ?? state.settings.lastDirectory;
      let path = await native.chooseSavePath(dir ? `${dir}/${name}` : name, [type]);
      if (!path) return null;
      path = withExtension(path, type);
      if (typeof content === 'string') await withProgress('progress.export', baseName(path), (op) => native.writeTextFile(path, content, op));
      else await withProgress('progress.export', baseName(path), (op) => native.writeBase64File(path, bytesToBase64(content), op));
      updateSettings({ lastPublishDirectory: directoryOf(path) }, { quiet: true });
      notify('success', t('notice.exported', { name: baseName(path) }));
      return path;
    }
    const blob = new Blob([content], { type: MIMES[type] ?? 'application/octet-stream' });
    const saved = await native.saveFileWeb(blob, { name, saveAs: true, mime: MIMES[type] ?? 'application/octet-stream' });
    if (saved) notify('success', t('notice.exported', { name: saved.name }));
    return saved?.name ?? null;
  } catch (error) {
    showError('error.export', error, name);
    return null;
  }
}

// ───────────────────────── publishing

/** Publish…: the window with the choices (folder, ZIP, one page), the checks and the size. */
async function openPublish() {
  const doc = activeDoc();
  if (!doc) return;
  state.view?.finishEdit?.(true);
  const files = siteFiles(doc.site, { extractImages: true });
  const checks = publishChecks(doc.site).map((c) => t(c.key, c.params));
  const result = await popups.open('publish', {
    name: doc.site.name, pages: doc.site.pages.map((p) => [p.name, pageFile(p)]), files: files.length, size: filesSize(files), checks, desktop,
    format: desktop ? 'folder' : 'zip', extract: state.settings.publishExtractImages, folder: state.settings.lastPublishDirectory ?? '',
  });
  if (!result?.format) return;
  updateSettings({ publishExtractImages: result.extract !== false }, { quiet: true });
  await publishSite(result.format, { extract: result.extract !== false });
}

async function publishSite(format, { extract = state.settings.publishExtractImages } = {}) {
  const doc = activeDoc();
  if (!doc) return;
  state.view?.finishEdit?.(true);
  const name = safeName(doc);
  try {
    if (format === 'html') {
      const page = doc.page;
      await saveExport(`${page.slug === 'index' ? name : `${name}-${page.slug}`}.html`, 'html', singlePageHtml(doc.site, page));
      return;
    }
    const files = siteFiles(doc.site, { extractImages: extract });
    if (format === 'zip') {
      const archive = zip(files.map((file) => ({ name: `${name}/${file.path}`, data: file.data })));
      await saveExport(`${name}.zip`, 'zip', archive);
      return;
    }
    // A folder (desktop): the files written into it (a folder named after the site inside the chosen one).
    const parent = await native.chooseFolder(state.settings.lastPublishDirectory ?? state.settings.lastDirectory);
    if (!parent) return;
    const target = `${parent.replace(/[\\/]+$/, '')}${parent.includes('\\') ? '\\' : '/'}${name}`;
    const written = await withProgress('progress.publish', target, (op) => native.writeSiteFiles(target, files, op));
    updateSettings({ lastPublishDirectory: parent }, { quiet: true });
    notify('success', t('notice.published', { count: written ?? files.length, folder: target }));
    const choice = await ask({ icon: 'publish', title: t('publish.doneTitle'), message: t('publish.doneMessage', { folder: target, count: files.length }), buttons: [{ id: 'close', label: t('common.close') }, { id: 'folder', label: t('publish.openFolder'), icon: 'folderOpen' }, { id: 'browser', label: t('publish.openBrowser'), icon: 'previewBrowser', primary: true }] });
    if (choice === 'folder') native.openExternal(target).catch((error) => showError('error.open', error, target));
    if (choice === 'browser') native.openExternal(`${target}${target.includes('\\') ? '\\' : '/'}index.html`).catch((error) => showError('error.open', error, target));
  } catch (error) {
    showError('error.publish', error, name);
  }
}

/** Preview in the browser: the whole site in a temporary folder (desktop), or the page in a new tab (web). */
async function previewInBrowser() {
  const doc = activeDoc();
  if (!doc) return;
  state.view?.finishEdit?.(true);
  try {
    if (desktop) {
      const files = siteFiles(doc.site, { extractImages: true });
      await native.previewSite(files, pageFile(doc.page));
      notify('success', t('notice.previewOpened'));
      return;
    }
    const url = URL.createObjectURL(new Blob([singlePageHtml(doc.site, doc.page)], { type: 'text/html' }));
    globalThis.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    showError('error.preview', error);
  }
}

async function copyPageHtml() {
  const doc = activeDoc();
  if (!doc) return;
  try {
    await native.clipboardWrite(singlePageHtml(doc.site, doc.page));
    notify('success', t('notice.htmlCopied'));
  } catch (error) { showError('error.copy', error); }
}

/** Tools › Check the site: what to fix before publishing. */
async function checkSite() {
  const doc = activeDoc();
  const checks = publishChecks(doc.site);
  if (!checks.length) { notify('success', t('check.ok')); return ask({ icon: 'checkSite', title: t('action.checkSite'), message: t('check.ok'), buttons: [{ id: 'ok', label: t('common.ok'), primary: true }] }); }
  return ask({ icon: 'warning', title: t('action.checkSite'), message: t('check.found', { count: checks.length }), items: checks.map((c) => t(c.key, c.params)), buttons: [{ id: 'ok', label: t('common.ok'), primary: true }] });
}

async function showStats() {
  const doc = activeDoc();
  const stats = S.siteStats(doc.site);
  const files = siteFiles(doc.site);
  const size = filesSize(files);
  const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
  return ask({ icon: 'blkStats', title: t('action.siteStats'), message: t('stats.message', { pages: stats.pages, blocks: stats.blocks, images: stats.images, files: files.length, size: kb(size) }), items: doc.site.pages.map((p) => `${p.name} — ${pageFile(p)} · ${t('stats.blocks', { count: p.blocks.length })}`), buttons: [{ id: 'ok', label: t('common.ok'), primary: true }] });
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
  if (choice === 'save') { for (const doc of dirty) if (!(await saveDoc(doc))) return false; return true; }
  return choice === 'discard';
}

async function closeDoc(doc, { force = false } = {}) {
  if (!doc) return true;
  if (doc.dirty && !force) {
    const choice = await ask({
      icon: 'save', title: t('confirm.closeTitle'), message: t('confirm.closeMessage', { name: docName(doc) }),
      buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }],
    });
    if (choice === 'cancel') return false;
    if (choice === 'save' && !(await saveDoc(doc))) return false;
  }
  state.docs.splice(state.docs.indexOf(doc), 1);
  if (state.active === doc.id) {
    state.active = state.docs[0]?.id ?? null;
    state.selected = null;
    state.showStart = !state.docs.length;
    state.view?.destroy();
    state.view = null;
    mountView();
  }
  persistSession();
  renderAll();
  return true;
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
  const header = context.header ?? (MENUS[name] ? { icon: MENU_ICONS[name], title: t(`menu.${name}`) } : { icon: 'siteProject', title: 'MyHomeMaker' });
  context = { ...context, handlers: { ...context.handlers } };
  items = withChildren(items, context.handlers);
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

/** Context menus: a block, the canvas, a page tab, a tree row, the start page, panels … */
function contextMenu(event, kind, payload = {}) {
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  if (kind === 'block') {
    const found = site() && S.findBlock(site(), payload.id);
    if (!found) return undefined;
    const global = blockDef(found.block.type)?.global;
    const handlers = { 'custom:content': () => focusField(payload.id, null), 'custom:style': () => { select(payload.id); showEditorTab('style'); }, 'custom:addAfter': () => addBlockMenu(anchor, found.index + 1), 'custom:addBefore': () => addBlockMenu(anchor, found.index) };
    const items = [{ id: 'custom:content', label: t('canvas.editContent'), icon: 'edit', shortcut: 'Enter' }, { id: 'custom:style', label: t('canvas.editStyle'), icon: 'formatShape' }, { separator: true }];
    if (!global) items.push({ id: 'custom:addBefore', label: t('canvas.addBefore'), icon: 'arrowUp' }, { id: 'custom:addAfter', label: t('canvas.addAfter'), icon: 'addBlock' }, { separator: true }, ...menuItems(['cut', 'copy', 'paste', 'duplicate', '-', 'moveUp', 'moveDown', 'toggleHidden', '-', 'delete']));
    else items.push(...menuItems(['toggleHidden']));
    return showMenu(items, anchor, 'context', { handlers, header: { icon: BLOCKS[found.block.type].icon, title: blockTitle(found.block) } });
  }
  if (kind === 'canvas') return showMenu(menuItems(['addBlock', 'paste', '-', 'device:desktop', 'device:tablet', 'device:mobile', 'zoomFit', '-', 'previewMode', 'previewBrowser', '-', 'designPicker', 'pageProps']), anchor, 'context', { header: { icon: 'pageItem', title: currentPage()?.name ?? '' } });
  if (kind === 'page') {
    const page = S.pageById(site(), payload.id);
    return showMenu(menuItems(['renamePage', 'duplicatePage', 'deletePage', '-', 'pageLeft', 'pageRight', '-', 'pageProps', 'addPage']), anchor, 'context', { header: { icon: 'pageItem', title: page?.name ?? '' } });
  }
  if (kind === 'start') return showMenu(menuItems(['new', 'open', 'recent', '-', 'shuffleBackground', 'backgroundImage', '-', 'tutorial', 'about']), anchor, 'context', { header: { icon: 'home', title: t('action.startPage') } });
  if (kind === 'status') return showMenu(menuItems(['statusBar', '-', 'zoomIn', 'zoomOut', 'zoomReset', 'zoomFit', '-', 'theme', 'language']), anchor, 'context', { header: { icon: 'statusBar', title: t('action.statusBar') } });
  if (kind === 'panel') return showMenu(menuItems(['leftPanel', 'rightPanel', 'statusBar', '-', 'settings']), anchor, 'context', { header: { icon: 'panelLeft', title: t('submenu.panels') } });
  return showMenu(menuItems(['new', 'open', 'save', '-', 'undo', 'redo', '-', 'settings', 'about']), anchor, 'context', { header: { icon: 'siteProject', title: 'MyHomeMaker' } });
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

// ───────────────────────── document windows (user's guide, tutorial document)

async function openDocWindow(kind) {
  const info = DOC_KINDS[kind];
  if (!info) return undefined;
  popups.hideMenu();
  const url = `${location.pathname}?viewer=${kind}&lang=${getLanguage() === 'en' ? 'en' : 'ko'}`;
  if (popups.inline) return openDocFrame(kind, url);
  if (!desktop) {
    globalThis.open(url, `myhomemaker-${docLabel(kind)}`)?.focus?.();
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

function openDocFrame(kind, url) {
  const key = docLabel(kind);
  let frame = popups.frames.get(key);
  if (!frame) {
    frame = document.createElement('div');
    frame.className = `web-popup web-popup-doc web-popup-${key}`;
    frame.dataset.kind = key;
    frame.innerHTML = `<iframe title="${escapeHtml(key)}" src="${escapeHtml(url)}"></iframe>`;
    document.body.append(frame);
    popups.frames.set(key, frame);
  }
  return frame;
}

function closeDocFrames() {
  for (const kind of Object.keys(DOC_KINDS)) if (popups.frames.has(docLabel(kind))) popups.close(docLabel(kind));
}

// ───────────────────────── external drag & drop (files from the system)

async function handleDroppedPaths(paths) {
  for (const path of paths) {
    const name = baseName(path);
    try {
      if (isSiteFileName(name)) await openPath(path);
      else if (isImageFileName(name) && hasBlock()) await dropPictureOnSelection(path);
      else if (isImageFileName(name)) await setBackgroundFromPath(path);
      else notify('error', t('notice.unsupportedDrop', { name }));
    } catch (error) {
      showError('error.drop', error, path);
    }
  }
}

async function dropPictureOnSelection(pathOrFile) {
  const block = selectedBlock();
  const field = blockDef(block.type).fields.find((f) => f.kind === 'image');
  const src = typeof pathOrFile === 'string'
    ? `data:image/${extensionOf(pathOrFile) === 'svg' ? 'svg+xml' : extensionOf(pathOrFile) === 'jpg' ? 'jpeg' : extensionOf(pathOrFile)};base64,${await native.readBase64File(pathOrFile, `op-${S.newId()}`)}`
    : await fileDataUrl(pathOrFile);
  if (field) setProp(block.id, field.key, await shrinkPicture(src), 'image');
  else setStyle(block.id, { bgImage: await shrinkPicture(src), overlay: 35 });
}

async function handleDroppedFiles(files) {
  for (const file of files) {
    try {
      if (isSiteFileName(file.name)) await openContent(file.name, await file.text());
      else if ((isImageFileName(file.name) || file.type.startsWith('image/')) && hasBlock()) await dropPictureOnSelection(file);
      else if (isImageFileName(file.name) || file.type.startsWith('image/')) await setBackgroundFromFile(file);
      else notify('error', t('notice.unsupportedDrop', { name: file.name }));
    } catch (error) {
      showError('error.drop', error, file.name);
    }
  }
}

function setDropActive(active) {
  state.dropActive = active;
  const overlay = root.querySelector('.drop-overlay');
  overlay.classList.toggle('visible', active);
  overlay.querySelector('span').textContent = t('drop.hint');
}

// ───────────────────────── events

/** A block from the Blocks panel: a click adds it after the selected block, a drag puts it where it is dropped. */
function blockPointerDown(event, item) {
  const type = item.dataset.blockType;
  if (!hasDoc()) return;
  const start = { x: event.clientX, y: event.clientY };
  const ghost = root.querySelector('.block-ghost');
  let dragging = false;
  let target = null;
  const move = (e) => {
    if (!dragging) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
      dragging = true;
      ghost.hidden = false;
      ghost.innerHTML = `${icon(BLOCKS[type].icon)}<span>${escapeHtml(blockLabel(type, lang()))}</span>`;
    }
    ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 10}px)`;
    const p = state.view?.toFrame(e.clientX, e.clientY);
    target = p ? state.view.dropIndexAt(p.y) : null;
    ghost.classList.toggle('over', Boolean(target));
    state.view?.showDrop(target, t('canvas.dropHere'));
    if (target) state.view.autoScroll(e.clientY);
  };
  let finished = false;
  const up = (e) => {
    if (finished) return;
    finished = true;
    stopFrame();
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', up, true);
    ghost.hidden = true;
    state.view?.showDrop(null);
    // Without a drag the click that follows inserts the block (the same as Enter or a click from a script).
    if (!dragging) return;
    const swallow = (c) => { c.stopPropagation(); c.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, true), 0);
    if (e.type === 'pointerup' && target) insertBlock(type, target.index);
  };
  // Over the canvas the pointer is in the page's frame: its events come back from there.
  try { item.setPointerCapture?.(event.pointerId); } catch { /* a synthetic event */ }
  const stopFrame = state.view?.forwardPointer({ move, up }) ?? (() => {});
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
}

function blockAction(action, anchorElement) {
  const id = state.selected;
  if (!id) return undefined;
  switch (action) {
    case 'up': return moveBlock(-1, id);
    case 'down': return moveBlock(1, id);
    case 'duplicate': return duplicateBlock(id);
    case 'delete': return deleteBlock(id);
    case 'hide': return toggleHidden(id);
    case 'content': return focusField(id, null);
    case 'style': return showEditorTab('style');
    case 'add-after': { const page = currentPage(); const index = page.blocks.findIndex((b) => b.id === id); return addBlockMenu(anchorBelow(anchorElement), index + 1); }
    default: return undefined;
  }
}

function bindEvents() {
  root.addEventListener('click', (event) => {
    const target = event.target;
    const menu = target.closest('[data-menu]');
    if (menu) {
      const name = menu.dataset.menu;
      if (state.lastMenuClose.name === name && Date.now() - state.lastMenuClose.at < 300) return undefined;
      return openMenubarMenu(name);
    }
    if (target.closest('[data-home]')) return showStartPage(!state.showStart || !activeDoc());
    const start = target.closest('[data-start]');
    if (start && !start.disabled) return onStartAction(start);
    const command = target.closest('[data-command]');
    if (command && !command.disabled) {
      const id = command.dataset.command;
      const anchor = ['themeMenu', 'publishMenu', 'recentFolders', 'addBlock', 'newFromTemplate', 'openSample'].includes(id) ? anchorBelow(command.closest('.split-button') ?? command) : undefined;
      return run(id, { anchor });
    }
    const blockItem = target.closest('.block-item[data-block-type]');
    if (blockItem) { if (!hasDoc()) return notify('info', t('blocks.noSite')); return insertBlock(blockItem.dataset.blockType); }
    const blockActionButton = target.closest('[data-block-action]');
    if (blockActionButton) return blockAction(blockActionButton.dataset.blockAction, blockActionButton);
    const tbToggle = target.closest('[data-toolbox-toggle]');
    if (tbToggle) { const id = tbToggle.dataset.toolboxToggle; if (state.collapsedToolbox.has(id)) state.collapsedToolbox.delete(id); else state.collapsedToolbox.add(id); return renderBlocksPanel(); }
    if (target.closest('[data-toolbox-compact]')) { updateSettings({ toolboxCompact: !state.settings.toolboxCompact }, { quiet: true }); return renderBlocksPanel(); }
    const editorTab = target.closest('[data-editor-tab]');
    if (editorTab) { state.rightTab = editorTab.dataset.editorTab; return renderEditors(); }
    const editorToggle = target.closest('[data-editor-toggle]');
    if (editorToggle) { const id = editorToggle.dataset.editorToggle; if (state.collapsedEditors.has(id)) state.collapsedEditors.delete(id); else state.collapsedEditors.add(id); return renderEditors(); }
    const itemToggle = target.closest('[data-item-toggle]');
    if (itemToggle) { const key = itemToggle.dataset.itemToggle; if (state.collapsedItems.has(key)) state.collapsedItems.delete(key); else state.collapsedItems.add(key); return renderEditors(); }
    for (const kind of ['add', 'delete', 'copy', 'move']) {
      const el = target.closest(`[data-item-${kind}]`);
      if (el && !el.disabled) return itemAction(kind, el.dataset.block, el.dataset[`item${kind[0].toUpperCase()}${kind.slice(1)}`]);
    }
    const imageChoose = target.closest('[data-image-choose]');
    if (imageChoose) return chooseImageFor(imageChoose.dataset.block, imageChoose.dataset.imageChoose);
    const imageArt = target.closest('[data-image-art]');
    if (imageArt) return artMenu(imageArt.dataset.block, imageArt.dataset.imageArt, anchorBelow(imageArt));
    const imageClear = target.closest('[data-image-clear]');
    if (imageClear) return setProp(imageClear.dataset.block, imageClear.dataset.imageClear, '', 'image');
    const styleSet = target.closest('[data-style-set]');
    if (styleSet) return setStyle(styleSet.dataset.block, { [styleSet.dataset.styleSet]: styleSet.dataset.value });
    const styleClear = target.closest('[data-style-clear]');
    if (styleClear) return setStyle(styleClear.dataset.block, { [styleClear.dataset.styleClear]: '' });
    const styleReset = target.closest('[data-style-reset]');
    if (styleReset) return change('op.style', (s) => { const b = S.findBlock(s, styleReset.dataset.styleReset).block; b.style = normalizeStyle(blockDef(b.type).style, blockDef(b.type)); });
    const designClear = target.closest('[data-design-clear]');
    if (designClear) return setDesign({ [designClear.dataset.designClear]: null });
    if (target.closest('[data-design-reset]')) return setDesign({ id: site().design.id }, { reset: true });
    const treeToggle = target.closest('[data-tree-toggle]');
    if (treeToggle) {
      const id = treeToggle.dataset.treeToggle;
      const open = !(state.collapsedTree.has(id) || (id !== currentPage()?.id && !state.collapsedTree.has(`open:${id}`)));
      state.collapsedTree.delete(id); state.collapsedTree.delete(`open:${id}`);
      if (open) state.collapsedTree.add(id); else state.collapsedTree.add(`open:${id}`);
      return renderRight();
    }
    const treePage = target.closest('[data-tree-page]');
    if (treePage) { openPage(treePage.dataset.treePage); state.selected = null; state.view?.updateOverlay(); return renderRight(); }
    const treeBlock = target.closest('[data-tree-block]');
    if (treeBlock) {
      const found = S.findBlock(site(), treeBlock.dataset.treeBlock);
      if (found?.page && found.page.id !== currentPage()?.id) openPage(found.page.id);
      return select(treeBlock.dataset.treeBlock);
    }
    const windowControl = target.closest('[data-window]');
    if (windowControl) return windowButton(windowControl.dataset.window);
    const pageTab = target.closest('[data-page-tab]');
    if (pageTab) {
      const id = pageTab.dataset.pageTab;
      if (event.detail === 2 && id === currentPage()?.id) return renamePage(id);
      if (id !== currentPage()?.id || state.showStart) openPage(id);
      return scrollActiveTabIntoView();
    }
    const scroll = target.closest('[data-tab-scroll]');
    if (scroll) return scrollTabs(Number(scroll.dataset.tabScroll));
    return undefined;
  });

  root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const item = event.target.closest?.('.block-item[data-block-type]');
    if (item) { event.preventDefault(); blockPointerDown(event, item); return; }
    const drag = event.target.closest?.('[data-block-drag]');
    if (drag && state.view && !blockDef(selectedBlock()?.type)?.global) { event.preventDefault(); state.view.dragBlock(event, drag.dataset.blockDrag); }
  });

  root.addEventListener('contextmenu', (event) => {
    const editable = event.target.closest('input:not([type="range"]):not([type="checkbox"]):not([type="color"]), textarea');
    if (editable) { event.preventDefault(); return textContextMenu(editable, event); }
    if (event.defaultPrevented) return undefined;
    event.preventDefault();
    const pageTab = event.target.closest('[data-page-tab]');
    if (pageTab) { openPage(pageTab.dataset.pageTab); return contextMenu(event, 'page', { id: pageTab.dataset.pageTab }); }
    const treePage = event.target.closest('[data-tree-page]');
    if (treePage) { openPage(treePage.dataset.treePage); return contextMenu(event, 'page', { id: treePage.dataset.treePage }); }
    const treeBlock = event.target.closest('[data-tree-block]');
    if (treeBlock) { select(treeBlock.dataset.treeBlock); return contextMenu(event, 'block', { id: treeBlock.dataset.treeBlock }); }
    if (event.target.closest('.sel-bar')) return contextMenu(event, 'block', { id: state.selected });
    if (event.target.closest('#start-page')) return contextMenu(event, 'start');
    if (event.target.closest('#statusbar')) return contextMenu(event, 'status');
    if (event.target.closest('.canvas-scroll')) return contextMenu(event, 'canvas');
    if (event.target.closest('.side-panel, #toolbar, #menubar')) return contextMenu(event, 'panel');
    return contextMenu(event, 'default');
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target.dataset.prop) return setProp(target.dataset.block, target.dataset.prop, target.type === 'checkbox' ? target.checked : target.value, target.dataset.kind);
    if (target.dataset.style) {
      const key = target.dataset.style;
      return setStyle(target.dataset.block, { [key]: target.type === 'checkbox' ? target.checked : target.value });
    }
    if (target.dataset.pageField) return setPageField(target.dataset.pageField, target.type === 'checkbox' ? target.checked : target.value.trim());
    if (target.dataset.siteField) return setSiteField(target.dataset.siteField, target.value.trim());
    if (target.dataset.design) return setDesign({ [target.dataset.design]: target.value });
    if ('startToggle' in target.dataset) return updateSettings({ showStartPage: target.checked }, { quiet: true });
    if (target.id === 'zoom-value') return setZoom(parseFloat(target.value) || 100);
    if (target.id === 'zoom-slider') return setZoom(CANVAS_ZOOM.steps[Number(target.value)]);
    if ('startSpeed' in target.dataset) return updateSettings({ animationSpeed: Number(target.value) }, { quiet: true });
    if ('startOpacity' in target.dataset) return updateSettings({ startCardOpacity: Number(target.value) }, { quiet: true });
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
        renderBlocksPanel();
        const input = root.querySelector('#toolbox-search');
        input?.focus();
        input?.setSelectionRange(pos, pos);
      }, 150);
    }
    // Long text: the canvas follows while typing (one undo step per pause).
    if (target.matches?.('textarea[data-prop]')) {
      clearTimeout(bindEvents.typeTimer);
      bindEvents.typeTimer = setTimeout(() => setProp(target.dataset.block, target.dataset.prop, target.value, target.dataset.kind), 700);
    }
    if ('startSpeed' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}%`; state.settings.animationSpeed = Number(target.value); }
    if ('startOpacity' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}%`; root.querySelector('.start-inner')?.style.setProperty('--start-card-alpha', `${target.value}%`); }
  });

  bindSteppers(root, (key, value) => {
    const [scope, a, b] = key.split(':');
    if (scope === 'prop') return setProp(a, b, value, 'number');
    if (scope === 'style') return setStyle(a, { [b]: value });
    if (scope === 'design') return setDesign({ [a]: value });
    return undefined;
  });

  root.addEventListener('keydown', (event) => {
    if (event.target.id === 'zoom-value' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); zoomBy(event.key === 'ArrowUp' ? 1 : -1); } else if (event.target.id === 'zoom-value' && event.key === 'Enter') event.target.blur();
    else if (event.target.matches?.('#editors input[type="text"]') && event.key === 'Enter') { event.preventDefault(); event.target.dispatchEvent(new Event('change', { bubbles: true })); event.target.blur(); }
  });

  root.addEventListener('wheel', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.defaultPrevented) return;
    event.preventDefault();
    if (event.target.closest('.canvas-scroll')) { zoomBy(event.deltaY < 0 ? 1 : -1); return; }
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

  // The menu bar row is the title bar: its empty parts move the window, a double click maximizes.
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
    updateTabNav();
    if (desktop && state.minWidth && window.innerWidth < state.minWidth - 1) native.setMinimumSize(state.minWidth, 640).catch(() => {});
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
      if (state.showStart || !activeDoc()) renderStartPage();
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
    for (const doc of state.docs) if (doc.path && doc.dirty && now - (doc.autoSavedAt ?? 0) > minutes * 60000) { doc.autoSavedAt = now; saveDoc(doc); }
  }, 30000);
}

function setUiZoom(value) {
  updateSettings({ zoom: Math.max(ZOOM.min, Math.min(ZOOM.max, value)) });
}

/** Ctrl+key shortcuts: [key, shift, command]. */
const SHORTCUTS = [
  ['n', false, 'new'], ['o', false, 'open'], ['s', false, 'save'], ['s', true, 'saveAs'], ['w', false, 'closeSite'], ['r', false, 'recent'],
  ['z', false, 'undo'], ['y', false, 'redo'], ['z', true, 'redo'], ['x', false, 'cut'], ['c', false, 'copy'], ['v', false, 'paste'], ['d', false, 'duplicate'],
  ['arrowup', false, 'moveUp'], ['arrowdown', false, 'moveDown'], ['h', false, 'toggleHidden'], ['a', true, 'addBlock'], ['n', true, 'addPage'],
  ['=', false, 'zoomIn'], ['+', false, 'zoomIn'], ['-', false, 'zoomOut'], ['0', false, 'zoomReset'], ['w', true, 'zoomFit'], ['e', false, 'previewMode'],
  ['p', true, 'publish'], ['d', true, 'designPicker'], [',', false, 'settings'], ['l', true, 'language'], ['!', true, 'leftPanel'], ['1', true, 'leftPanel'],
  ['@', true, 'rightPanel'], ['2', true, 'rightPanel'], ['q', false, 'exit'], ['h', true, 'startPage'], ['b', true, 'shuffleBackground'],
  ['pageup', false, 'prevPage'], ['pagedown', false, 'nextPage'],
];

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  if (tutorial?.active && key === 'escape') { event.preventDefault(); tutorial.stop(); return; }
  const editing = event.target.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]');
  const mod = event.ctrlKey || event.metaKey;
  if (mod && !event.altKey) {
    if (editing && ['x', 'c', 'v', 'z', 'y', 'a', 'arrowup', 'arrowdown', 'h'].includes(key)) return;
    if (key === 'tab') { event.preventDefault(); pageStep(event.shiftKey ? -1 : 1); return; }
    const shortcut = SHORTCUTS.find(([k, shift]) => k === key && shift === event.shiftKey);
    if (shortcut) { event.preventDefault(); event.stopPropagation(); run(shortcut[2]); }
    return;
  }
  if (key === 'f1') { event.preventDefault(); run('about'); return; }
  if (key === 'f5') { event.preventDefault(); run('previewBrowser'); return; }
  if (key === 'f11') { event.preventDefault(); run('tutorial'); return; }
  if (editing) {
    if (key === 'escape') event.target.blur?.();
    return;
  }
  if (event.altKey && (key === 'arrowdown' || key === 'arrowup')) { event.preventDefault(); selectStep(key === 'arrowdown' ? 1 : -1); return; }
  if (key === 'f2') { event.preventDefault(); run('renamePage'); return; }
  if (key === 'delete' || key === 'backspace') { if (hasPageBlock()) { event.preventDefault(); run('delete'); } return; }
  if (key === 'escape') { if (state.preview) togglePreview(); else select(null); return; }
  if (key === 'enter' && hasBlock()) { event.preventDefault(); run('editContent'); return; }
  if (!state.showStart && hasDoc() && (key === 'arrowdown' || key === 'arrowup') && event.target.closest?.('#center, body')) { event.preventDefault(); selectStep(key === 'arrowdown' ? 1 : -1); }
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
  popups.on('raise-test-panic', () => native.invoke('raise_test_panic').catch((error) => showError('error.unexpected', error)));
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
  for (const [index, path] of files.entries()) if (exists[index]) { await openPath(path, { quiet: true }); break; }
}

/** What the canvas, the editors, the start page and the tutorial use. */
const appApi = {
  state,
  t,
  language: () => getLanguage(),
  version: () => (state.info?.version ?? VERSION),
  settings: () => state.settings,
  doc: () => activeDoc(),
  site: () => site(),
  page: () => currentPage(),
  selectedId,
  selectedBlock,
  select,
  run,
  commands,
  popups,
  notify,
  showError,
  change,
  contextMenu,
  commitText,
  fieldOf,
  focusField,
  chooseImageFor,
  openPage,
  moveBlockTo,
  insertBlock,
  zoomBy,
  setZoom,
  setDevice,
  editingChanged,
  onKeyDown,
  showStartPage,
  updateSettings,
  newSite,
  openSampleBuiltin,
  openMenubarMenu,
  shuffleBackground,
  renderAll,
  renderRight,
  renderToolbarState,
  anchorBelow,
  closeDoc,
  ask,
  openDocWindow,
  closeDocFrames,
  rememberScroll: (top) => { const doc = activeDoc(); if (doc) doc.view.scroll[doc.view.pageId] = top; },
  get view() { return state.view; },
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
  document.title = `MyHomeMaker v${state.info?.version ?? VERSION}`;
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
  trackMaximized();
  for (const path of await native.startupFiles().catch(() => [])) { await openPath(path); break; }
  state.showStart = !state.docs.length && state.settings.showStartPage;
  if (!state.docs.length && !state.settings.showStartPage) newSite('blank');
  mountView();
  renderAll();
  if (desktop) {
    await appWindow.show();
    await appWindow.setFocus();
    setTimeout(() => popups.prewarm('menu'), 400);
  }
  if (state.settings.showWelcome && !globalThis.__MYHOMEMAKER_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome')) setTimeout(openWelcome, 600);
}

/** The welcome popup (at start, and Help › Welcome): tutorial, sample, or later. */
async function openWelcome() {
  updateSettings({ tutorialOffered: true }, { quiet: true });
  const result = await popups.open('welcome', {});
  if (result?.choice === 'tutorial') startTutorial();
  else if (result?.choice === 'sample') openSampleAsk();
}

// Test hook: the E2E suites drive the app through this (no effect on normal use).
window.__myhomemaker = {
  state,
  t,
  commands,
  popups,
  run,
  menus: { MENUS, SUBMENUS, enabled: (id) => commandEnabled(id) },
  api: appApi,
  actions: {
    newSite, openPath, openContent, saveDoc, closeDoc, select, change, undo, redo, insertBlock, deleteBlock, duplicateBlock, moveBlock, moveBlockTo, toggleHidden,
    copyBlock, pasteBlocks, commitText, setProp, setStyle, setDesign, setPageField, setSiteField, itemAction, openPage, addPageAsk, duplicatePage, deletePage, movePage,
    setDevice, setZoom, fitWidth, togglePreview, publishSite, openPublish, previewInBrowser, checkSite, updateSettings, showStartPage, openSampleBuiltin, openSampleAsk,
    handleDroppedPaths, handleDroppedFiles, confirmExit, openRecent, showError, openMenubarMenu, contextMenu, toScreen, withProgress, startTutorial, shuffleBackground,
    openDocWindow, closeDocFrames, focusField, pickDesign, randomDesign, addBlockMenu,
  },
  domain: { S, BLOCKS, PAGE_BLOCK_TYPES, DESIGNS, TEMPLATES, SAMPLES, buildTemplate, buildSample, siteFiles, tutorialSteps: () => TUTORIAL_STEPS.length },
  tutorial: () => tutorial,
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => {
    if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {});
  });
