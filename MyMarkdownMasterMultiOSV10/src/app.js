// MyMarkdownMaster main window. The shell is MySketchBook's: the menu bar (also the title bar), the toolbar that
// folds into », side panels that collapse to rails, the bottom panel, the status bar, the start page of
// movable cards over a moving background, popups for settings / menus / confirmations.
//
// Inside: a vault (vault/storage.js — the Rust backend on the desktop, the browser's file system on the web),
// the Rust core (core/core.js: index, links, search, rendering, export), the centre's workspace of split
// panes and tabs (workspace/layout.js) holding note views (views/note-view.js: live / source / reading /
// split), canvases, the graph and media; the side panels (panels/panels.js), the palette (ui/palette.js)
// and the features (features.js).
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import APP_ICON from '../assets/icon-256.png';
import { ANIMATIONS, PANEL_MIN, RECENT_KEY, SESSION_KEY, STORAGE_KEY, VAULT_PREFS_KEY, loadSettings, storeSettings } from './domain/settings.js';
import { addRecent, removeRecent } from './domain/recent.js';
import { sampleFiles, sampleStart } from './domain/samples.js';
import { switchFlag } from './flags.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { PopupHost } from './platform/popups.js';
import { applyFont, applyTheme, customTheme, DARK_THEMES, LIGHT_THEMES, randomThemeId, resolveTheme, themeName } from './themes.js';
import { escapeHtml, frameThrottle, isMac, keyLabel, pointerDrag } from './ui/dom.js';
import { AnimatedBackground } from './ui/background.js';
import { startPageHtml } from './ui/startpage.js';
import { startBoard } from './ui/startboard.js';
import { Tutorial } from './ui/tutorial.js';
import { DOC_KINDS, docLabel, docWindowTitle } from './domain/helpdocs.js';
import { call as core, loadWasm } from './core/core.js';
import { Vault, webSupport } from './vault/storage.js';
import { VaultIndex, fileNameOf, folderOf, isNote, kindOf, nameOf, normalizePath } from './vault/index.js';
import { activeLeaf, activeTab, allTabs, bindSplitters, closeTab, deserialize, dropZone, emptyLayout, findLeaf, leafOfTab, moveTab, newTab, openTab, renderLayout, serialize, splitLeaf } from './workspace/layout.js';
import { NoteView } from './views/note-view.js';
import { createFeatures } from './features.js';
import { fuzzy, openSuggest, isOpen as paletteOpen, promptText, useWindows } from './ui/palette.js';
import * as P from './panels/panels.js';
import { createExplorer } from './panels/explorer.js';
import { createNoteEditor } from './editor/editor.js';
import { renderPreview, scrollToLine as previewScrollTo, topLine as previewTopLine, destroyPreview, rerenderDiagrams, setLineHighlight } from './render/preview.js';
import { startSlides, startReadingPresentation } from './render/presentation.js';
import { configurePlatform, printDirect, printDocument, printToPdfFile } from './lib/platform.js';
import './ai/ai.css';
import './app.css';
import { AI_ACTIONS } from './ai/actions.js';
import { createAiPanel } from './ai/panel.js';
import { isConfigured } from './ai/settings.js';

const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const lang = () => getLanguage();
const h = escapeHtml;

const loadJson = (key, fallback) => { try { return JSON.parse(globalThis.localStorage?.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; } };
const saveJson = (key, value) => { try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* full or private */ } };

const state = {
  settings: loadSettings(globalThis.localStorage),
  recentVaults: loadJson(RECENT_KEY, []),
  vault: null,
  layout: emptyLayout(),
  notice: null,
  info: null,
  openMenu: null,
  lastMenuClose: { name: null, at: 0 },
  quitting: false,
  dropActive: false,
  minWidth: 0,
  maximized: false,
  showStart: true,
  log: [],
  problems: [],
  styleIssues: [],
  stats: null,
  selection: null,
  search: { query: '', results: [], matchCase: false, explain: false, sort: 'relevance', collapsed: false },
  fileFilter: '',
  noteFilter: 'all',
  noteQuery: '',
  outlineFolded: [],
  unlinked: null,
  toolbarHidden: [],
  recording: false,
  backgroundUrl: null,
};

const index = new VaultIndex();
/** Open notes' texts: path → { text, saved, dirty, timer, loaded }. Shared by every tab showing the note. */
const docs = new Map();
/** Tab id → view instance ({ el, path, destroy(), … }). */
const views = new Map();
const settings = () => state.settings;
const hasVault = () => Boolean(state.vault);
const onStart = () => Boolean(state.showStart);

// ───────────────────────── notices & errors

let noticeTimer = 0;
function notify(kind, message, detail = '') {
  state.notice = { kind, text: message, at: Date.now() };
  state.log.unshift({ kind, text: message, detail, at: new Date() });
  if (state.log.length > 500) state.log.length = 500;
  if (settings().bottomTab === 'messages') renderBottom();
  renderStatus();
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { state.notice = null; renderStatus(); }, kind === 'error' ? 12000 : 6000);
}

function showError(titleKey, error, context = '') {
  const message = native.errorText(error);
  const detail = error?.stack && !String(error.stack).startsWith(message) ? error.stack : '';
  console.error(titleKey, error);
  notify('error', `${t(titleKey)}: ${message}`, [context, detail].filter(Boolean).join('\n'));
  const info = state.info;
  return popups.open('error', { title: t(titleKey), message, detail, context, time: new Date().toLocaleString(), app: info ? `${info.name} ${info.version} (${info.web ? 'web' : `${info.os}/${info.arch}`}, ${info.commit})` : `MyMarkdownMaster ${VERSION}` });
}

window.addEventListener('error', (event) => { if (/^ResizeObserver loop/.test(String(event.message ?? ''))) return; if (event.error || event.message) showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''); });
window.addEventListener('unhandledrejection', (event) => { if (/cancel|abort/i.test(String(event.reason?.message ?? event.reason))) return; showError('error.unexpected', event.reason); });

// ───────────────────────── per-vault preferences

function vaultPrefs() { const all = loadJson(VAULT_PREFS_KEY, {}); return all[state.vault?.id ?? ''] ?? {}; }
function setVaultPrefs(patch, { quiet = false } = {}) {
  if (!state.vault) return;
  const all = loadJson(VAULT_PREFS_KEY, {});
  all[state.vault.id] = { ...(all[state.vault.id] ?? {}), ...patch };
  saveJson(VAULT_PREFS_KEY, all);
  if (!quiet) renderPanels();
}

// ───────────────────────── the index (Rust core snapshot)

/** The core's index changed (a save, a rename, the watcher): fetch the snapshot and refresh the panels. */
async function indexChanged({ structure = false, rescan = false } = {}) {
  if (!state.vault) return;
  const snapshot = rescan ? await state.vault.rescan() : await core('snapshot');
  index.load(snapshot);
  if (structure) refreshProblems();
  renderPanels();
  for (const view of views.values()) { view.indexChanged?.(); if (structure) view.editor?.refresh?.({ images: false }); }
}

/** Typing: the core learns the text soon (links, tags, outline follow); the file is written by autosave. */
const coreTextTimers = new Map();
function coreText(path, text) {
  clearTimeout(coreTextTimers.get(path));
  coreTextTimers.set(path, setTimeout(async () => {
    coreTextTimers.delete(path);
    if (!state.vault) return;
    await core('setText', { path, text });
    await indexChanged();
    refreshWriting(path);
  }, 400));
}

// ───────────────────────── documents (open notes)

const doc = (path) => docs.get(path) ?? null;
const isDirty = (path) => Boolean(docs.get(path)?.dirty);
const anyDirty = () => [...docs.values()].some((d) => d.dirty);

async function loadDoc(path) {
  let d = docs.get(path);
  if (d?.loaded) return d;
  const text = await state.vault.read(path);
  d = { text, saved: text, dirty: false, timer: 0, loaded: true };
  docs.set(path, d);
  return d;
}

const readText = async (path) => (docs.get(path)?.loaded ? docs.get(path).text : state.vault.read(path));
async function writeText(path, text) { await state.vault.write(path, text); const d = docs.get(path); if (d) { d.text = text; d.saved = text; d.dirty = false; } }

/** The text of a note changed (typing in `from`, or a command). Every other view of it follows. */
function updateText(path, text, from = null) {
  const d = docs.get(path) ?? { text: '', saved: '', loaded: true };
  if (d.text === text) return;
  d.text = text;
  d.dirty = text !== d.saved;
  docs.set(path, d);
  for (const view of views.values()) if (view.path === path) view.textChanged?.(text, view === from);
  coreText(path, text);
  if (settings().autosave) { clearTimeout(d.timer); d.timer = setTimeout(() => saveDoc(path).catch((error) => showError('error.save', error, path)), settings().autosaveDelay); }
  renderTitleProject();
  renderToolbarState();
  markDirtyMarks(path);
}

/** Text written by the app elsewhere (link updates after a rename): open views follow without marking dirty. */
function externalText(path, text) {
  const d = docs.get(path);
  if (!d) return;
  d.text = text; d.saved = text; d.dirty = false;
  for (const view of views.values()) if (view.path === path) view.textChanged?.(text, false);
}

async function saveDoc(path) {
  const d = docs.get(path);
  if (!d || !d.dirty || !state.vault) return true;
  clearTimeout(d.timer);
  const text = d.text;
  await state.vault.write(path, text);
  d.saved = text;
  d.dirty = d.text !== text;
  for (const view of views.values()) if (view.path === path) view.updateHeader?.();
  renderTitleProject();
  renderToolbarState();
  markDirtyMarks(path);
  return true;
}

async function saveAll() { for (const path of [...docs.keys()]) await saveDoc(path); }

async function snapshotNow(path, force = false) {
  const d = docs.get(path);
  const text = d?.text ?? (await state.vault?.read(path).catch(() => null));
  if (text == null || !state.vault) return false;
  return state.vault.saveSnapshot(path, text, { interval: settings().recoveryInterval, keep: settings().recoveryKeep, force });
}

function markDirtyMarks(path) {
  root.querySelector(`.tree-file[data-tree-file="${CSS.escape(path)}"]`)?.classList.toggle('dirty', isDirty(path));
  for (const tab of allTabs(state.layout)) if (tab.path === path) {
    const el = root.querySelector(`.ws-tab[data-tab="${tab.id}"] .ws-tab-title`);
    if (el) el.classList.toggle('dirty', isDirty(path));
  }
}

// ───────────────────────── the vault: open, create, samples, recent

function rememberVault(vault) {
  if (vault.kind === 'folder') return; // a picked browser folder cannot be reopened by name
  state.recentVaults = addRecent(state.recentVaults, { path: vault.kind === 'desktop' ? vault.root : vault.name, title: vault.name, kind: vault.kind });
  saveJson(RECENT_KEY, state.recentVaults);
  if (desktop) updateSettings({ lastDirectory: vault.root }, { quiet: true });
}

async function closeVault({ keepStart = false, replacedBy = null } = {}) {
  if (!state.vault) return true;
  // Unsaved notes are saved before another vault opens (beforeSwitch); never after: the core and the backend
  // may already hold the next vault.
  if (!replacedBy && anyDirty()) await saveAll().catch((error) => showError('error.save', error));
  persistLayout();
  for (const view of views.values()) view.destroy?.();
  views.clear();
  docs.clear();
  aiPanel?.destroy(); aiPanel = null;
  localGraph?.destroy(); localGraph = null;
  // Typing waits a moment before the core hears it: those updates belong to this vault, not the next one.
  for (const timer of coreTextTimers.values()) clearTimeout(timer);
  coreTextTimers.clear();
  // A desktop vault opened in its place already holds the backend: closing must not take it away.
  state.vault.close({ backend: !(replacedBy?.kind === 'desktop' && state.vault.kind === 'desktop') });
  state.vault = null;
  index.load(null);
  state.layout = emptyLayout();
  state.showStart = true;
  lastActive = undefined;
  saveJson(SESSION_KEY, null);
  if (!keepStart) renderAll();
  return true;
}

/** Before another vault is opened: the open notes are saved while this vault is still the one in the core. */
async function beforeSwitch() {
  if (!state.vault) return;
  for (const [path, timer] of coreTextTimers) { clearTimeout(timer); coreTextTimers.delete(path); }
  await saveAll();
  persistLayout();
}

async function useVault(vault, { open = null } = {}) {
  await closeVault({ keepStart: true, replacedBy: vault });
  state.vault = vault;
  index.load(vault.snapshot ?? await core('snapshot'));
  rememberVault(vault);
  state.showStart = false;
  state.layout = deserialize(vaultPrefs().layout);
  for (const tab of allTabs(state.layout)) if (tab.path && !index.has(tab.path)) closeTab(state.layout, tab.id);
  await Promise.all(allTabs(state.layout).filter((x) => x.kind === 'note').map((x) => loadDoc(x.path).catch(() => null)));
  vault.onChange((change) => onVaultChange(change));
  saveJson(SESSION_KEY, { path: vault.kind === 'desktop' ? vault.root : vault.name, kind: vault.kind });
  renderAll();
  refreshProblems();
  if (open) await openFile(open, { focus: true });
  else if (settings().openDailyOnStart) await features.dailyNote(0);
  else if (!allTabs(state.layout).some((tab) => tab.kind !== 'empty')) { const first = index.notePaths()[0]; if (first) await openFile(first); }
  activeChanged(true);
  notify('success', t('vault.opened', { name: vault.name, n: index.notePaths().length }));
}

async function openVaultFolder(path = null) {
  try {
  await beforeSwitch();
    if (desktop) {
      const dir = path ?? await native.chooseFolder(settings().lastDirectory);
      if (!dir) return;
      const vault = await withProgress('progress.openVault', dir, () => Vault.openDesktop(dir));
      await useVault(vault);
    } else {
      if (!webSupport().folder) { notify('warning', t('vault.noFolderAccess')); await browserVaults(); return; }
      const handle = await globalThis.showDirectoryPicker({ mode: 'readwrite' }).catch(() => null);
      if (!handle) return;
      await loadWasm();
      const vault = await withProgress('progress.openVault', handle.name, (op, report) => Vault.openWeb(handle, 'folder', (f) => report({ fraction: f })));
      await useVault(vault);
    }
  } catch (error) { showError('error.openVault', error, path ?? ''); }
}

async function newVault() {
  await beforeSwitch();
  const name = await promptText({ title: t('vault.newTitle'), value: t('vault.newName'), glyph: 'folderAdd', validate: (v) => (!v ? t('name.empty') : /[\\/:*?"<>|]/.test(v) ? t('name.bad') : null) });
  if (!name) return;
  try {
    const welcome = t('vault.welcomeNote');
    if (desktop) {
      const parent = await native.chooseFolder(settings().lastDirectory);
      if (!parent) return;
      const dir = await Vault.createDesktop(parent, name, welcome);
      await useVault(await Vault.openDesktop(dir));
    } else {
      await loadWasm();
      const vault = await Vault.openWeb(await Vault.browserVaultHandle(name, true), 'browser');
      await vault.write(t('vault.welcomeFile'), welcome);
      await vault.rescan();
      await useVault(vault);
    }
  } catch (error) { showError('error.openVault', error, name); }
}

async function browserVaults() {
  if (!webSupport().browser) { notify('warning', t('vault.noBrowserStorage')); return; }
  await loadWasm();
  const names = await Vault.browserVaults();
  const item = await openSuggest({
    placeholder: t('vault.browserPick'), icon: 'database',
    items: (q) => names.map((n) => ({ id: n, label: n, icon: 'database', positions: fuzzy(q, n) })).filter((x) => x.positions),
    allowCreate: (q) => (q.trim() && !names.includes(q.trim()) ? { id: `new:${q.trim()}`, label: t('vault.browserCreate', { name: q.trim() }), icon: 'plus' } : null),
    emptyText: t('vault.browserEmpty'),
  });
  if (!item) return;
  await beforeSwitch();
  const name = item.id.startsWith('new:') ? item.id.slice(4) : item.id;
  const vault = await withProgress('progress.openVault', name, async (op, report) => Vault.openWeb(await Vault.browserVaultHandle(name, true), 'browser', (f) => report({ fraction: f })));
  await useVault(vault);
}

/** A sample vault: written fresh into the app's data folder (desktop) or the browser's storage, then opened. */
async function openSample(id) {
  try {
  await beforeSwitch();
    const files = sampleFiles(id, lang());
    const name = t(`sample.${id}`);
    let vault;
    if (desktop) vault = await Vault.openDesktop(await native.invoke('sample_vault_dir', { name }));
    else { await loadWasm(); vault = await Vault.openWeb(await Vault.browserVaultHandle(name, true), 'browser'); }
    for (const [path, text] of Object.entries(files)) {
      const folder = folderOf(path);
      if (folder) await vault.mkdir(folder).catch(() => {});
      await vault.write(path, text);
    }
    await vault.rescan();
    await useVault(vault, { open: sampleStart(id, lang()) });
  } catch (error) { showError('error.openVault', error, id); }
}

async function openRecent(path, kind = 'desktop') {
  await beforeSwitch();
  if (kind === 'browser') {
    try { await loadWasm(); await useVault(await Vault.openWeb(await Vault.browserVaultHandle(path, false), 'browser')); } catch (error) { showError('error.openVault', error, path); }
    return;
  }
  if (!desktop) return;
  const [exists] = await native.pathsExist([path]);
  if (!exists) {
    const choice = await ask({ icon: 'warning', title: t('recent.missingTitle'), message: t('recent.missingMessage'), items: [path], buttons: [{ id: 'keep', label: t('recent.keep') }, { id: 'remove', label: t('recent.remove'), icon: 'trash', danger: true, primary: true }] });
    if (choice === 'remove') forgetRecent(path);
    return;
  }
  await openVaultFolder(path);
}
function forgetRecent(path) { state.recentVaults = removeRecent(state.recentVaults, path); saveJson(RECENT_KEY, state.recentVaults); renderStartPage(); }
function clearRecentAll() { state.recentVaults = []; saveJson(RECENT_KEY, []); notify('success', t('notice.recentCleared')); renderStartPage(); }

/** The desktop watcher saw changes made outside the app. */
async function onVaultChange(change) {
  await indexChanged({ structure: Boolean(change?.structure) });
  for (const path of change?.paths ?? []) {
    const d = docs.get(path);
    if (!d || !index.has(path)) continue;
    const text = await state.vault.read(path).catch(() => null);
    if (text == null || text === d.text) continue;
    if (!d.dirty) externalText(path, text);
    else notify('warning', t('vault.changedOutside', { name: nameOf(path) }));
  }
  if (change?.structure) renderWorkspace();
}

// ───────────────────────── the workspace: tabs and views

const features = {};

function tabTitle(tab) {
  if (tab.kind === 'empty') return t('tab.new');
  if (tab.kind === 'graph') return t('graph.title');
  if (!tab.path) return t('tab.new');
  return isNote(tab.path) ? nameOf(tab.path) : fileNameOf(tab.path);
}
const TAB_ICONS = { empty: 'fileNew', graph: 'graphView' };
const tabIcon = (tab) => TAB_ICONS[tab.kind] ?? P.FILE_ICONS[kindOf(tab.path ?? '')] ?? 'file';

function viewFor(tab) {
  let view = views.get(tab.id);
  if (view && view.kind === tab.kind && view.path === tab.path) return view;
  view?.destroy?.();
  view = createView(tab);
  views.set(tab.id, view);
  return view;
}

function createView(tab) {
  if (tab.kind === 'note') { const v = new NoteView(tab, noteViewApi); v.kind = 'note'; return v; }
  const el = document.createElement('div');
  const base = { kind: tab.kind, path: tab.path, el, tab, destroy() { this.instance?.destroy?.(); el.remove(); } };
  if (tab.kind === 'canvas') {
    el.className = 'canvas-view-host';
    import('./views/canvas.js').then(({ createCanvasView }) => {
      base.instance = createCanvasView(el, {
        path: tab.path, kindOf,
        read: () => state.vault.read(base.path),
        write: (text) => state.vault.write(base.path, text).then(() => indexChanged()),
        onDirty: () => {},
        renderMarkdown: (text, element, sourcePath) => renderMarkdownInto(text, element, sourcePath ?? base.path),
        readNote: (path) => readText(path),
        resourceUrl: (path) => state.vault.resourceUrl(path),
        openFile: (path, opts) => openFile(path, opts),
        pickFile: () => pickVaultFile(),
        openExternal: (url) => native.openExternal(url),
        t, notify,
      });
    });
    return base;
  }
  if (tab.kind === 'graph') {
    el.className = 'graph-view-host';
    import('./views/graph.js').then(({ createGraphView }) => { base.instance = createGraphView(el, graphApi({ mode: 'global' })); });
    base.indexChanged = () => base.instance?.refresh();
    return base;
  }
  if (tab.kind === 'empty') {
    el.className = 'empty-view';
    const draw = () => { el.innerHTML = emptyTabHtml(); };
    draw();
    base.indexChanged = draw;
    return base;
  }
  el.className = 'media-view';
  const kind = kindOf(tab.path);
  state.vault.resourceUrl(tab.path).then((url) => {
    const name = h(fileNameOf(tab.path));
    const body = kind === 'image' ? `<img src="${h(url)}" alt="${name}" />` : kind === 'audio' ? `<audio controls src="${h(url)}"></audio>` : kind === 'video' ? `<video controls src="${h(url)}"></video>`
      : kind === 'pdf' ? `<iframe src="${h(url)}" title="${name}"></iframe>` : `<p class="panel-hint">${icon('info')}<span>${h(t('media.unsupported'))}</span></p><button class="button" data-command="openDefault">${icon('openFile')}<span>${h(t('file.openDefault'))}</span></button>`;
    el.innerHTML = `<div class="media-header">${icon(tabIcon(tab))}<b>${name}</b><span class="muted">${h(folderOf(tab.path))}</span></div><div class="media-body media-${kind}">${body}</div>`;
  }).catch((error) => { el.textContent = String(error); });
  return base;
}

function emptyTabHtml() {
  const recent = (vaultPrefs().recentFiles ?? []).filter((p) => index.has(p)).slice(0, 8);
  const actions = [['newNote', 'fileNew'], ['quickSwitcher', 'switcher'], ['dailyNote', 'calendar'], ['graphView', 'graphView'], ['newCanvas', 'canvasFile'], ['commandPalette', 'command'], ['closeTab', 'closeTab']];
  // The program's icon and name head the empty tab (also when no vault is open).
  return `<div class="empty-tab"><div class="empty-brand"><img src="${APP_ICON}" alt="" /><div><b>MyMarkdownMaster</b><span class="empty-version">v${h(state.info?.version ?? VERSION)}</span><small>${h(t('start.tagline'))}</small></div></div><h2>${icon('markdownFile')}<span>${h(t('tab.emptyTitle'))}</span></h2>
    <div class="empty-actions">${actions.map(([id, glyph]) => `<button class="start-tile" data-command="${id}">${icon(glyph)}<b>${h(t(commands[id].label))}</b><small>${h(commands[id].key ? keyLabel(commands[id].key) : '')}</small></button>`).join('')}</div>
    ${recent.length ? `<h3>${icon('recent')}<span>${h(t('tab.recentFiles'))}</span></h3><div class="empty-recent">${recent.map((p) => `<button class="start-link" data-open-path="${h(p)}">${P.fileIcon(p)}<span class="name">${h(nameOf(p))}</span><span class="path">${h(folderOf(p))}</span></button>`).join('')}</div>` : ''}</div>`;
}

/**
 * Opens a file. options: { newTab, split: 'row'|'column', mode, line (0-based), col, len, subpath, focus, leafId, create }.
 * An already open file is focused instead of opened twice (unless newTab / split).
 */
async function openFile(path, options = {}) {
  if (!state.vault) return null;
  if (options.create) return createFromLink(options.create, { ...options, create: undefined });
  path = normalizePath(path);
  if (!index.has(path)) { notify('warning', t('file.missing', { name: path })); return null; }
  const kind = kindOf(path);
  const tabKind = kind === 'note' ? 'note' : kind === 'canvas' ? 'canvas' : 'media';
  if (kind === 'note') await loadDoc(path);
  let tab = null;
  if (!options.newTab && !options.split) {
    const existing = allTabs(state.layout).find((x) => x.path === path);
    if (existing) { const leaf = leafOfTab(state.layout, existing.id); leaf.active = leaf.tabs.indexOf(existing); state.layout.active = leaf.id; tab = existing; }
  }
  if (!tab) {
    const fresh = newTab({ kind: tabKind, path, mode: kind === 'note' ? options.mode ?? settings().defaultMode : null });
    if (options.split) { splitLeaf(state.layout, state.layout.active ?? activeLeaf(state.layout).id, options.split, fresh); tab = fresh; }
    else {
      const { tab: placed, replaced } = openTab(state.layout, fresh, { newTab: options.newTab, leafId: options.leafId });
      tab = placed;
      if (replaced) { views.get(replaced.id)?.destroy?.(); views.delete(replaced.id); dropDocIfClosed(replaced.path); }
    }
  } else if (options.mode && tab.kind === 'note') views.get(tab.id)?.setMode?.(options.mode);
  rememberRecentFile(path);
  renderWorkspace();
  const view = views.get(tab.id);
  if (options.line != null) setTimeout(() => view?.revealLine?.(options.line, { col: options.col ?? 0, len: options.len ?? 0 }), 80);
  else if (options.subpath) setTimeout(() => revealSubpath(view, path, options.subpath), 80);
  if (options.focus !== false) setTimeout(() => view?.focus?.(), 40);
  activeChanged();
  return tab;
}

function revealSubpath(view, path, subpath) {
  const m = index.meta(path);
  if (!m || !view) return;
  if (subpath.startsWith('#^')) { const b = (m.blocks ?? []).find(([id]) => id === subpath.slice(2)); if (b) view.revealLine(b[1]); return; }
  const key = (s) => String(s).toLowerCase().replace(/[#^[\]|*_`~=]/g, '').replace(/\s+/g, ' ').trim();
  const want = key(subpath.split('#').filter(Boolean).pop() ?? '');
  const hd = (m.headings ?? []).find((x) => key(x.text) === want);
  if (hd) view.revealLine(hd.line);
}

function rememberRecentFile(path) { setVaultPrefs({ recentFiles: [path, ...(vaultPrefs().recentFiles ?? []).filter((p) => p !== path)].slice(0, 30) }, { quiet: true }); }

async function createFromLink(name, options = {}) {
  const clean = String(name).split('#')[0].split('|')[0].trim();
  if (!clean) return null;
  const base = clean.replace(/\.md$/i, '');
  const folder = clean.includes('/') ? '' : features.newNoteFolder();
  const path = normalizePath(folder ? `${folder}/${base}.md` : `${base}.md`);
  if (!index.has(path)) {
    const parent = folderOf(path);
    if (parent && !index.folders.has(parent)) await state.vault.mkdir(parent);
    await state.vault.create(path, '');
    await indexChanged({ structure: true });
  }
  return openFile(path, options);
}

const activePath = () => activeTab(state.layout)?.path ?? null;
const activeView = () => { const tab = activeTab(state.layout); return tab ? views.get(tab.id) ?? null : null; };
const activeNoteView = () => { const v = activeView(); return v instanceof NoteView ? v : null; };

function dropDocIfClosed(path) { if (path && !allTabs(state.layout).some((x) => x.path === path)) { saveDoc(path).catch(() => {}).finally(() => { if (!allTabs(state.layout).some((x) => x.path === path)) docs.delete(path); }); } }

function closeTabById(tabId) {
  const tab = allTabs(state.layout).find((x) => x.id === tabId);
  if (!tab) return;
  closeTab(state.layout, tabId);
  views.get(tabId)?.destroy?.();
  views.delete(tabId);
  dropDocIfClosed(tab.path);
  renderWorkspace();
  activeChanged();
}

function closePath(path) {
  for (const tab of allTabs(state.layout)) if (tab.path === path || tab.path?.startsWith(`${path}/`)) { closeTab(state.layout, tab.id); views.get(tab.id)?.destroy?.(); views.delete(tab.id); }
  for (const p of [...docs.keys()]) if (p === path || p.startsWith(`${path}/`)) { clearTimeout(docs.get(p).timer); docs.delete(p); }
  renderWorkspace();
  activeChanged();
}

/** After a rename / move: tabs, documents and preferences follow the new path. */
function pathRenamed(from, to) {
  const move = (p) => (p === from ? to : p?.startsWith(`${from}/`) ? `${to}${p.slice(from.length)}` : p);
  for (const tab of allTabs(state.layout)) {
    const next = move(tab.path);
    if (next === tab.path) continue;
    tab.path = next;
    const v = views.get(tab.id);
    if (v?.renamed) { v.renamed(next); v.editor?.setPath?.(next); } else if (v) { v.path = next; }
  }
  for (const [p, d] of [...docs]) { const next = move(p); if (next !== p) { docs.delete(p); docs.set(next, d); } }
  const prefs = vaultPrefs();
  setVaultPrefs({
    expanded: (prefs.expanded ?? []).map(move), pinned: (prefs.pinned ?? []).map(move), recentFiles: (prefs.recentFiles ?? []).map(move),
    bookmarks: (prefs.bookmarks ?? []).map((b) => ({ ...b, path: move(b.path) })),
    goals: Object.fromEntries(Object.entries(prefs.goals ?? {}).map(([k, v]) => [move(k), v])),
  }, { quiet: true });
  renderWorkspace();
  lastActive = undefined;
  activeChanged();
}

let layoutTimer = 0;
function persistLayout() { clearTimeout(layoutTimer); if (state.vault) setVaultPrefs({ layout: serialize(state.layout) }, { quiet: true }); }
function layoutChanged() { clearTimeout(layoutTimer); layoutTimer = setTimeout(persistLayout, 400); }

function renderWorkspace() {
  const host = root.querySelector('#workspace');
  if (!host || onStart()) return;
  const keep = renderLayout(host, state.layout, {
    tabHtml: (tab) => `${icon(tabIcon(tab))}<span class="ws-tab-title ${tab.path && isDirty(tab.path) ? 'dirty' : ''}">${h(tabTitle(tab))}</span>${tab.pinned ? `<span class="ws-tab-pin" data-tab-unpin="${tab.id}" title="${h(t('tab.unpin'))}">${icon('pin', 'icon tiny')}</span>` : `<button class="ws-tab-close" data-tab-close="${tab.id}" title="${h(t('tab.close'))}" aria-label="${h(t('tab.close'))}">${icon('close')}</button>`}`,
    leafToolsHtml: (leaf) => `<div class="ws-leaf-tools"><span class="ws-tab-nav"><button class="icon-button" data-leaf-step="-1" data-leaf="${leaf.id}" title="${h(t('tab.prev'))}" aria-label="${h(t('tab.prev'))}" ${leaf.active > 0 ? '' : 'disabled'}>${icon('chevronLeft')}</button><button class="icon-button" data-leaf-step="1" data-leaf="${leaf.id}" title="${h(t('tab.next'))}" aria-label="${h(t('tab.next'))}" ${leaf.active < leaf.tabs.length - 1 ? '' : 'disabled'}>${icon('chevronRight')}</button></span><button class="icon-button" data-leaf-new="${leaf.id}" title="${h(t('tab.newTip'))}">${icon('plus')}</button><button class="icon-button" data-leaf-split="${leaf.id}" data-dir="row" title="${h(t('pane.splitRight'))}">${icon('splitRight')}</button><button class="icon-button" data-leaf-split="${leaf.id}" data-dir="column" title="${h(t('pane.splitDown'))}">${icon('splitDown')}</button><button class="icon-button" data-leaf-menu="${leaf.id}" title="${h(t('pane.menu'))}">${icon('toolbarMore')}</button></div>`,
    hostFor: (tab) => viewFor(tab).el,
    onResize: () => { for (const v of views.values()) v.editor?.view?.requestMeasure(); },
  });
  for (const [id, view] of [...views]) if (!keep.has(id)) { view.destroy?.(); views.delete(id); }
  for (const view of views.values()) view.updateHeader?.();
  // The active tab of every pane is scrolled into its strip (many documents open side by side as tabs).
  for (const tab of root.querySelectorAll('.ws-tab.active')) tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  layoutChanged();
  renderTitleProject();
}

/** ‹ › in a pane's tab bar: the previous / next document tab of that pane. */
function stepTab(leafId, step) {
  const leaf = findLeaf(state.layout, leafId);
  if (!leaf || !leaf.tabs.length) return;
  const next = Math.max(0, Math.min(leaf.tabs.length - 1, leaf.active + step));
  if (next === leaf.active && state.layout.active === leafId) return;
  leaf.active = next;
  state.layout.active = leafId;
  renderWorkspace();
  activeChanged();
}

let lastActive;
function activeChanged(force = false) {
  const path = activePath();
  renderToolbarState();
  if (path === lastActive && !force) return;
  lastActive = path;
  state.unlinked = null;
  state.selection = null;
  refreshWriting(path);
  renderRight();
  renderLeftHighlights();
  renderStatus();
  localGraph?.setLocal(path && isNote(path) ? path : null);
  aiPanel?.refresh();
}

function renderLeftHighlights() {
  for (const el of root.querySelectorAll('#left-panel .tree-file.active, #left-panel .note-card.active')) el.classList.remove('active');
  const path = activePath();
  if (!path) return;
  root.querySelector(`#left-panel [data-tree-file="${CSS.escape(path)}"]`)?.classList.add('active');
  root.querySelector(`#left-panel .note-card[data-open-path="${CSS.escape(path)}"]`)?.classList.add('active');
}

// ───────────────────────── the note view's API (editor, preview)

function editorSettings() {
  const s = settings();
  return { lineNumbers: s.lineNumbers, foldGutter: s.foldGutter, readableLineLength: s.readableLineLength, maxWidth: s.maxWidth, spellcheck: s.spellcheck, focusMode: s.focusMode, typewriter: s.typewriter, smartPunctuation: s.smartPunctuation, autoPair: s.autoPair, tabSize: s.tabSize, indentWithTabs: s.indentWithTabs, showStyleCheck: s.showStyleCheck, highlightSyntax: s.highlightSyntax, fontSize: s.editorFontSize, fontFamily: s.editorFontFamily, lineHeight: s.lineHeight, codeWrap: s.codeWrap, placeholder: t('editor.placeholder') };
}

const SLASH = () => [
  ['h1', 'heading1', (e) => e.setHeading(1)], ['h2', 'heading2', (e) => e.setHeading(2)], ['h3', 'heading3', (e) => e.setHeading(3)],
  ['task', 'checkAll', (e) => e.toggleLinePrefix('- [ ] ')], ['bullet', 'listBullet', (e) => e.toggleLinePrefix('- ')], ['numbered', 'listNumbered', (e) => e.toggleLinePrefix('1. ')],
  ['quote', 'quote', (e) => e.toggleLinePrefix('> ')], ['callout', 'callout', (e) => e.insertCallout('note')], ['table', 'table', (e) => e.insertTable(3, 3)],
  ['code', 'codeBlock', (e) => e.insertCodeBlock('')], ['math', 'math', (e) => e.insertMath(true)], ['mermaid', 'diagram', (e) => e.insertCodeBlock('mermaid')],
  ['chart', 'chart', (e) => e.insertText('```chart\ntype: bar\nlabels: [A, B, C]\nseries:\n  - title: S\n    data: [1, 2, 3]\n```\n')], ['rule', 'rule', (e) => e.insertHorizontalRule()],
  ['footnote', 'footnote', (e) => e.insertFootnote()], ['link', 'hyperlink', (e) => e.insertWikiLink()], ['toc', 'structureTree', (e) => e.insertText('[TOC]\n')],
  ['date', 'calendar', () => features.insertDate('date')], ['time', 'clock', () => features.insertDate('time')], ['template', 'template', () => features.insertTemplate()],
  ['embed', 'embed', (e) => e.insertText('![[]]')],
].map(([id, glyph, run]) => ({ id, label: t(`slash.${id}`), icon: glyph, keywords: `${id} ${t(`slash.${id}`)}`, run }));

function linkTextFor(path, from) {
  const name = isNote(path) ? nameOf(path) : fileNameOf(path);
  const same = index.allPaths().filter((p) => (isNote(p) ? nameOf(p) : fileNameOf(p)) === name);
  return same.length > 1 && index.resolveQuick(name, from) !== path ? path.replace(/\.md$/, '') : name;
}

function createEditorFor(host, path, view) {
  const editor = createNoteEditor(host, {
    doc: docs.get(path)?.text ?? '',
    path,
    settings: { ...editorSettings(), mode: view.mode === 'live' ? 'live' : 'source' },
    callbacks: {
      onChange: (text) => updateText(view.path, text, view),
      onSelection: (sel) => { state.selection = sel; scheduleStatus(); highlightOutline(); },
      onSave: () => saveDoc(view.path).then(() => notify('success', t('notice.saved', { name: nameOf(view.path) }))).catch((error) => showError('error.save', error, view.path)),
      onOpenLink: ({ target, subpath, newTab: inNew, external }) => (external ? native.openExternal(external) : followLink(target, subpath, view.path, { newTab: inNew })),
      onTagClick: (tag) => searchFor(`tag:${tag}`),
      onFocus: () => noteViewApi.onFocus(view),
      onScroll: () => view.syncPreviewToEditor(),
      onContextMenu: (event, info) => editorContextMenu(event, view, info),
      onPasteFiles: (files) => { pasteFiles(view, files); return true; },
      onDropFiles: (files, pos) => { pasteFiles(view, files, pos); return true; },
    },
    complete: {
      notes: async (query) => (await core('quickSwitch', { query, limit: 40 })).map((r) => ({ label: r.alias ?? linkTextFor(r.path, view.path), detail: folderOf(r.path), path: r.path })),
      headings: async (target) => { const p = target ? index.resolveQuick(target, view.path) : view.path; return (index.meta(p)?.headings ?? []).map((x) => ({ text: x.text, level: x.level })); },
      blocks: async (target) => { const p = target ? index.resolveQuick(target, view.path) : view.path; if (!p) return []; const lines = (await readText(p)).split('\n'); return (index.meta(p)?.blocks ?? []).map(([id, line]) => ({ id, text: lines[line] ?? '' })); },
      tags: async () => index.tags().map((x) => ({ tag: x.tag, count: x.count })),
      emoji: (prefix) => core('emoji', { prefix }),
      propertyKeys: async () => index.properties().map((p) => p.key),
      slashCommands: SLASH,
    },
    resolveResource: async (target) => { if (/^(https?|data|blob):/.test(target)) return target; const p = index.resolveQuick(target, view.path); return p ? state.vault.resourceUrl(p) : null; },
    resolveLink: (target, from) => index.resolveQuick(target, from ?? view.path),
  });
  editor.clearHistory?.();
  return editor;
}

async function followLink(target, subpath, from, { newTab: inNew = false } = {}) {
  const path = target ? await core('resolve', { target, from }) : from;
  if (!path) { await createFromLink(target, { newTab: inNew }); return; }
  await openFile(path, { newTab: inNew, subpath });
}

const renderNote = (path, text) => core('render', { path, text, options: { resourcePrefix: state.vault.resourcePrefix(), embedDepth: 3, emoji: true, hideFrontmatter: true, lineBreaks: true } });

function previewCtx(path, view) {
  return {
    path, sourcePath: path, dark: resolveTheme(settings().theme, prefersDark(), settings().customTheme).dark, scroller: view?.previewScroll,
    settings: { codeWrap: settings().codeWrap, hoverNeedsMod: settings().hoverNeedsMod },
    resourceUrl: (p) => state.vault.resourceUrl(p),
    onLinkClick: ({ path: target, href, subpath, newTab: inNew, create }) => (create ? createFromLink(create, { newTab: inNew }) : target ? openFile(target, { newTab: inNew, subpath }) : followLink(href, subpath, path, { newTab: inNew })),
    onExternal: (url) => native.openExternal(url),
    onTagClick: (tag) => searchFor(`tag:${tag}`),
    onTaskToggle: (line, checked, info) => toggleTaskLine(info?.path ?? path, line, checked),
    preview: async (target) => (await core('render', { path: target, text: await readText(target), options: { resourcePrefix: state.vault.resourcePrefix(), embedDepth: 1 } })).html,
    copyText,
  };
}

async function renderMarkdownInto(text, element, sourcePath) {
  const r = await core('render', { path: sourcePath ?? '', text, options: { resourcePrefix: state.vault?.resourcePrefix() ?? '', embedDepth: 2 } });
  element.classList.add('markdown-rendered');
  applyReadingLook(element);
  await renderPreview(element, r.html, previewCtx(sourcePath, null));
}

function applyReadingLook(el) {
  const s = settings();
  el.dataset.readingTheme = s.readingTheme;
  el.dataset.readingFont = s.readingFont;
  el.dataset.padding = s.readingPadding;
  el.classList.toggle('readable-line-length', s.readableLineLength);
  el.style.setProperty('--reading-width', `${s.readingWidth}px`);
  el.style.setProperty('--reading-font-size', `${s.readingFontSize}px`);
}

async function toggleTaskLine(path, line, checked) {
  const d = docs.get(path) ?? await loadDoc(path);
  const lines = d.text.split('\n');
  if (line == null || lines[line] == null) return;
  lines[line] = lines[line].replace(/\[(.)\]/, checked ? '[x]' : '[ ]');
  updateText(path, lines.join('\n'));
}

function propertiesHtml(path, frontmatter, open) {
  const n = Object.keys(frontmatter).length;
  return `<div class="props-head" data-props-toggle>${icon(open ? 'chevronDown' : 'chevronRight')}${icon('docProperties')}<b>${h(t('props.title'))}</b><span class="tree-count">${n}</span></div>${open ? `${P.propertyRows(path, frontmatter)}<button class="small-button" data-prop-add="${h(path)}">${icon('plus')}<span>${h(t('props.add'))}</span></button>` : ''}`;
}

function breadcrumb(path) {
  const parts = path.split('/');
  return parts.map((part, i) => `${i ? `<span class="crumb-sep">${icon('chevronRight', 'icon tiny')}</span>` : ''}<button class="crumb ${i === parts.length - 1 ? 'current' : ''}" data-crumb="${h(parts.slice(0, i + 1).join('/'))}">${h(i === parts.length - 1 && isNote(part) ? nameOf(part) : part)}</button>`).join('');
}

const noteViewApi = {
  doc, settings, saveTabState: () => layoutChanged(), renderNote, propertiesHtml, breadcrumb,
  createEditor: createEditorFor,
  renderPreview: async (el, rendered, path, view) => { applyReadingLook(el); await renderPreview(el, rendered.html, previewCtx(path, view)); },
  previewScrollTo: (el, line, scroller, opts = {}) => { previewScrollTo(el, line, { smooth: false }); if (opts.flash) setLineHighlight(el, line); },
  previewTopLine: (el) => previewTopLine(el),
  destroyPreview,
  onFocus: (view) => {
    const leaf = leafOfTab(state.layout, view.tab.id);
    if (!leaf) return;
    if (state.layout.active !== leaf.id) { state.layout.active = leaf.id; for (const el of root.querySelectorAll('.ws-leaf')) el.classList.toggle('is-active', el.dataset.leaf === leaf.id); }
    activeChanged();
  },
  noteMenu: (view, anchorEl) => noteMenu(view, anchorBelow(anchorEl)),
  revealInTree: (path) => revealInTree(path),
};

// ───────────────────────── writing tools: statistics, style check, problems

let writingTimer = 0;
function refreshWriting(path = activePath()) {
  clearTimeout(writingTimer);
  writingTimer = setTimeout(async () => {
    if (!path || !isNote(path) || !docs.get(path)) { state.stats = null; state.styleIssues = []; renderRightIf('stats'); renderStatus(); return; }
    const text = docs.get(path).text;
    const s = settings();
    state.stats = await core('stats', { text });
    state.styleIssues = s.showStyleCheck ? await core('styleCheck', { text, lang: s.styleLanguage, longSentence: s.longSentence }) : [];
    const pos = s.highlightSyntax ? await core('partsOfSpeech', { text }) : [];
    for (const view of views.values()) if (view.path === path && view.editor) view.editor.setDecorations({ styleIssues: state.styleIssues.map((i) => ({ ...i, line: i.line + 1, message: t(`style.kind.${i.kind}`) + (i.suggestion ? ` → ${i.suggestion}` : '') })), partsOfSpeech: pos.map((x) => ({ ...x, line: x.line + 1 })) });
    renderRightIf('stats');
    renderStatus();
    refreshProblems();
  }, 300);
}

function refreshProblems() {
  const list = [];
  for (const [target, uses] of index.unresolved()) for (const u of uses.slice(0, 20)) list.push({ severity: 'warning', text: t('problems.unresolved', { target }), path: u.from, line: u.line, col: u.col, len: u.len });
  for (const [path, m] of index.notes) if (m.frontmatterError) list.push({ severity: 'error', text: t('problems.frontmatter', { error: m.frontmatterError }), path, line: 0 });
  const active = activePath();
  for (const i of state.styleIssues ?? []) list.push({ severity: 'info', text: `${t(`style.kind.${i.kind}`)}: ${i.text}${i.suggestion ? ` → ${i.suggestion}` : ''}`, path: active, line: i.line, col: i.col, len: i.len });
  state.problems = list.slice(0, 2000);
  if (settings().bottomTab === 'problems') renderBottom();
  renderStatus();
}

// ───────────────────────── search, switcher, palette

let searchTimer = 0;
function runSearch(query = state.search.query) {
  state.search.query = query;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const q = state.search.matchCase && query.trim() ? `match-case:(${query})` : query;
    state.search.results = query.trim() ? await core('search', { query: q, limit: 1000 }) : [];
    const panel = root.querySelector('#left-panel');
    if (panel && settings().leftTab === 'search' && panel.querySelector('.search-results')) {
      const tmp = document.createElement('div');
      tmp.innerHTML = P.searchHtml(panelApi);
      panel.querySelector('.search-results').replaceWith(tmp.querySelector('.search-results'));
      panel.querySelector('.search-summary').replaceWith(tmp.querySelector('.search-summary'));
    } else renderLeft();
  }, 160);
}

function searchFor(query) {
  state.search.query = query;
  updateSettings({ leftTab: 'search', showLeftPanel: true });
  runSearch(query);
  setTimeout(() => root.querySelector('[data-search-input]')?.focus(), 40);
}

const switchItems = async (q) => (await core('quickSwitch', { query: q, limit: 60 })).map((r) => ({ id: r.path, label: r.alias ?? (isNote(r.path) ? r.path.replace(/\.md$/, '') : r.path), positions: r.alias ? null : r.positions, icon: P.FILE_ICONS[kindOf(r.path)], detail: r.alias ? r.path : '' }));

async function pickVaultFile() { const item = await openSuggest({ placeholder: t('switcher.placeholder'), icon: 'switcher', items: switchItems }); return item?.id ?? null; }

async function quickSwitcher() {
  await openSuggest({
    placeholder: t('switcher.placeholder'), icon: 'switcher',
    footer: [['↵', t('switcher.open')], ['Ctrl+↵', t('switcher.newTab')], ['Esc', t('palette.close')]],
    items: async (q) => (q.trim() ? switchItems(q) : (vaultPrefs().recentFiles ?? []).filter((p) => index.has(p)).map((p) => ({ id: p, label: isNote(p) ? p.replace(/\.md$/, '') : p, icon: P.FILE_ICONS[kindOf(p)], hint: t('switcher.recent') }))),
    allowCreate: (q) => (q.trim() ? { id: `create:${q.trim()}`, label: t('switcher.createNamed', { name: q.trim() }), icon: 'fileNew' } : null),
    onChoose: (item, how) => (item.id.startsWith('create:') ? createFromLink(item.id.slice(7), { newTab: how.newTab }) : openFile(item.id, { newTab: how.newTab, focus: true })),
  });
}

async function commandPalette() {
  const ids = Object.keys(commands).filter((id) => !commands[id].hidden);
  await openSuggest({
    placeholder: t('palette.placeholder'), icon: 'command',
    items: (q) => ids.filter(commandEnabled).map((id) => ({ id, label: t(commands[id].label), icon: commands[id].icon, kbd: commands[id].key ? keyLabel(commands[id].key) : '' }))
      .map((it) => ({ ...it, positions: fuzzy(q, it.label) ?? (fuzzy(q, it.id) ? [] : null) })).filter((it) => it.positions)
      .sort((a, b) => (q ? (a.positions[0] ?? 99) - (b.positions[0] ?? 99) : a.label.localeCompare(b.label))),
    onChoose: (item) => run(item.id),
  });
}

// ───────────────────────── AI, graph

let aiPanel = null;
let localGraph = null;
function aiApi() {
  return {
    t, notify,
    aiSettings: () => settings().ai,
    saveAiSettings: (ai) => updateSettings({ ai }, { quiet: true }),
    openAiSettings: () => popups.open('settings', { tab: 'ai' }),
    renderMarkdown: (text, element, sourcePath) => renderMarkdownInto(text, element, sourcePath ?? activePath()),
    activeNote: () => { const p = activePath(); return p && isNote(p) && docs.get(p) ? { path: p, title: nameOf(p), text: docs.get(p).text } : null; },
    selection: () => activeNoteView()?.editor?.getSelection()?.text ?? '',
    linkedNotes: async () => { const p = activePath(); if (!p) return []; const paths = new Set([...index.outgoing(p).map((l) => l.resolved).filter((x) => x && isNote(x) && x !== p), ...index.backlinks(p).map((b) => b.from)]); return Promise.all([...paths].slice(0, 8).map(async (x) => ({ path: x, title: nameOf(x), text: await readText(x) }))); },
    searchVault: async (query, limit = 6) => { const r = await core('search', { query, limit }); return Promise.all(r.map(async (x) => ({ path: x.path, title: nameOf(x.path), excerpt: (x.matches.map((m) => m.text).join('\n') || (isNote(x.path) ? (await readText(x.path)).slice(0, 600) : '')).slice(0, 1200) }))); },
    insertText: (text) => activeNoteView()?.editor?.insertText(text),
    insertBelow: (text) => activeNoteView()?.editor?.insertText(`\n${text}\n`),
    replaceSelection: (text) => activeNoteView()?.editor?.replaceSelection(text),
    appendToNote: (text) => { const p = activePath(); if (p && docs.get(p)) updateText(p, `${docs.get(p).text.replace(/\s*$/, '')}\n\n${text}\n`); },
    createNote: async (text) => { const first = text.split('\n').find((l) => l.trim())?.replace(/^#+\s*/, '').replace(/[\\/:*?"<>|#^[\]]/g, ' ').slice(0, 60).trim() || t('note.untitled'); return features.newNote({ name: index.has(`${features.newNoteFolder() ? `${features.newNoteFolder()}/` : ''}${first}.md`) ? null : first, text }); },
    noteTags: () => (index.meta(activePath())?.tags ?? []).map((x) => x.replace(/^#/, '')),
    setNoteTags: async (tags) => { const p = activePath(); if (!p || !docs.get(p)) return; updateText(p, await core('setProperty', { text: docs.get(p).text, key: 'tags', value: tags })); },
    loadHistory: () => loadJson(`mymarkdown.aiHistory.${state.vault?.id ?? ''}`, []),
    saveHistory: (list) => saveJson(`mymarkdown.aiHistory.${state.vault?.id ?? ''}`, list),
  };
}

async function aiAction(id) {
  if (!isConfigured(settings().ai)) { notify('warning', t('ai.notConfigured')); popups.open('settings', { tab: 'ai' }); return; }
  showRightTab('ai');
  setTimeout(() => aiPanel?.ask('', { action: id }), 60);
}

function graphApi({ mode, compact = false }) {
  return {
    index, mode, compact, local: mode === 'local' ? activePath() : null,
    openFile: (path, opts = {}) => (opts.create ? createFromLink(opts.create, opts) : openFile(path, opts)),
    openTag: (tag) => searchFor(`tag:${tag}`),
    getActivePath: () => activePath(),
    loadOptions: () => vaultPrefs()[`graph:${mode}`] ?? null,
    saveOptions: (opts) => setVaultPrefs({ [`graph:${mode}`]: opts }, { quiet: true }),
    t,
  };
}

// ───────────────────────── export, print, presentation

const EXPORT_FORMATS = [
  ['pdf', 'pdfFile'], ['html', 'htmlFile'], ['html-plain', 'htmlFile'], ['docx', 'wordFile'], ['odt', 'odtFile'], ['epub', 'epubFile'], ['rtf', 'rtfFile'],
  ['latex', 'latexFile'], ['markdown', 'markdownFile'], ['text', 'textFile'], ['djot', 'textFile'], ['rst', 'textFile'], ['asciidoc', 'textFile'],
  ['mediawiki', 'textFile'], ['textile', 'textFile'], ['opml', 'outlineFile'], ['org', 'textFile'], ['json', 'jsonFile'],
];

/** The note rendered off screen with math and diagrams drawn: the body of HTML / EPUB / PDF exports and printing. */
async function renderedBody(path) {
  const holder = document.createElement('article');
  holder.className = 'markdown-rendered export-render';
  holder.style.cssText = 'position:fixed;left:-12000px;top:0;width:820px;';
  document.body.append(holder);
  try {
    const rendered = await renderNote(path, docs.get(path)?.text ?? await readText(path));
    await renderPreview(holder, rendered.html, { ...previewCtx(path, null), settings: { codeWrap: true, hoverNeedsMod: true } });
    for (const el of holder.querySelectorAll('.code-toolbar, .diagram-toolbar, button')) el.remove();
    return holder.innerHTML;
  } finally { destroyPreview(holder); holder.remove(); }
}

async function exportCss() {
  const rules = [];
  for (const sheet of document.styleSheets) {
    let list;
    try { list = [...sheet.cssRules]; } catch { continue; }
    for (const r of list) { const text = r.cssText; if (/markdown-rendered|katex|callout|hljs|md-toc|mermaid|chart/.test(text)) rules.push(text); }
  }
  const vars = getComputedStyle(document.documentElement);
  const keep = ['--bg', '--surface', '--surface2', '--panel', '--text', '--muted', '--border', '--accent', '--accent-text', '--hover', '--soft-accent', '--grid-alt', '--danger', '--warning', '--success', '--font-family', ...['red', 'orange', 'yellow', 'green', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink', 'slate', 'brown'].map((x) => `--tone-${x}`)];
  return `:root{${keep.map((k) => `${k}:${vars.getPropertyValue(k)}`).join(';')}}body{background:var(--bg);color:var(--text);font-family:var(--font-family, system-ui);margin:0}.markdown-rendered{max-width:820px;margin:32px auto;padding:0 24px}\n${rules.join('\n')}`;
}

async function exportNote(format, { again = false } = {}) {
  const path = activePath();
  if (!path || !isNote(path)) { notify('warning', t('export.noNote')); return; }
  try {
    await saveDoc(path);
    const text = docs.get(path)?.text ?? await readText(path);
    const title = index.meta(path)?.frontmatter?.title ?? nameOf(path);
    const html = ['html', 'epub', 'pdf'].includes(format) ? await renderedBody(path) : '';
    const css = ['html', 'epub', 'pdf'].includes(format) ? await exportCss() : '';
    if (format === 'pdf') { await exportPdf(path, title, html, css, again); return; }
    const formats = await core('exportFormats');
    const info = formats.find((f) => f.id === format) ?? { id: format, extension: format, mime: 'application/octet-stream' };
    const options = settings().exportOptions;
    if (desktop) {
      const last = settings().lastExport;
      const out = again && last?.path && last.format === format ? last.path : await native.chooseSavePath(`${settings().lastDirectory ?? ''}/${nameOf(path)}.${info.extension}`, [info.extension]);
      if (!out) return;
      await withProgress('progress.export', fileNameOf(out.replace(/\\/g, '/')), () => native.invoke('vault_export', { format, path, text, html, css, title, author: '', language: lang(), options, out }));
      updateSettings({ lastExport: { format, path: out } }, { quiet: true });
      notify('success', t('export.done', { name: fileNameOf(out.replace(/\\/g, '/')) }));
    } else {
      const b64 = await core('export', { format, path, text, html, css, title, language: lang(), options, resources: await webResources(path), date: new Date().toISOString().slice(0, 10) });
      const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: info.mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${nameOf(path)}.${info.extension}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      updateSettings({ lastExport: { format } }, { quiet: true });
      notify('success', t('export.done', { name: a.download }));
    }
  } catch (error) { showError('error.export', error, format); }
}

/** Web exports: the pictures a note uses, as base64 (the core puts them into DOCX / EPUB / HTML). */
async function webResources(path) {
  const out = {};
  for (const l of index.outgoing(path)) {
    if (!l.resolved || kindOf(l.resolved) !== 'image' || out[l.resolved]) continue;
    try { const bytes = await state.vault.readBinary(l.resolved); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); out[l.resolved] = btoa(s); } catch { /* missing */ }
  }
  return out;
}

const standalone = (title, html, css, extra = '') => `<!doctype html><html lang="${lang()}"><head><meta charset="utf-8"><title>${h(title)}</title><style>${css}${extra}</style></head><body><article class="markdown-rendered" data-reading-theme="original">${html}</article></body></html>`;

async function printHtml(doc) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.append(frame);
  frame.srcdoc = doc;
  await new Promise((resolve) => { frame.onload = resolve; });
  frame.contentWindow.print();
  setTimeout(() => frame.remove(), 60000);
}

async function exportPdf(path, title, html, css, again) {
  const doc = standalone(title, html, css, '\n@page{size:A4;margin:18mm 16mm}');
  if (!desktop) { await printHtml(doc); return; }
  const last = settings().lastExport;
  const out = again && last?.path && last.format === 'pdf' ? last.path : await native.chooseSavePath(`${settings().lastDirectory ?? ''}/${nameOf(path)}.pdf`, ['pdf']);
  if (!out) return;
  await withProgress('progress.export', fileNameOf(out.replace(/\\/g, '/')), async () => {
    let unlisten = () => {};
    const done = new Promise((resolve) => { native.listen('render-done', resolve).then((un) => { unlisten = un; }); });
    await native.openRenderWindow({ mode: 'pdf', html: doc, path: out, title }, false);
    const answer = await done;
    unlisten();
    if (!answer?.ok) throw new Error(answer?.error ?? 'PDF');
  });
  updateSettings({ lastExport: { format: 'pdf', path: out } }, { quiet: true });
  notify('success', t('export.done', { name: fileNameOf(out.replace(/\\/g, '/')) }));
}

// Printing (as in the other apps): the print window (popup "print": printer, paper, orientation, margins,
// pages, a laid-out preview) asks for the note's pages; its Print button prints them straight to the chosen
// printer — no system dialog (Windows; elsewhere the system dialog), a file printer writes a PDF.
let printing = false;
let printPage = '';
async function printNote() {
  const path = activePath();
  if (!path || !isNote(path)) { notify('warning', t('export.noNote')); return; }
  await saveDoc(path).catch(() => {});
  const result = await popups.open('print', { at: Date.now(), title: nameOf(path) });
  if (result?.printed) notify('success', t('status.printSent'));
}

/** The print window asks for the pages (the note rendered with math and diagrams, in the reading look). */
async function sendPrintContent() {
  const path = activePath();
  if (!path) return;
  try {
    printPage = standalone(nameOf(path), await renderedBody(path), await exportCss(), '.markdown-rendered{max-width:none;margin:0;padding:0}');
    const printers = await native.listPrinters().catch(() => ({ printers: [], defaultPrinter: '', filePrinters: [] }));
    popups.post('print', { type: 'print-content', html: printPage, printers });
  } catch (error) { showError('error.print', error); }
}

/** The print window's buttons: straight to the printer, a PDF file (file printers), or the system dialog. */
async function runPrint(job) {
  if (printing) return;
  printing = true;
  const page = printPage.includes('</head>') ? printPage.replace('</head>', `${job.css}</head>`) : job.css + printPage;
  try {
    const printers = await native.listPrinters().catch(() => ({ printers: [], filePrinters: [] }));
    let mode = job.mode;
    if (!desktop) mode = 'dialog';
    else if (mode === 'direct' && (!printers.printers.length || !job.printer)) mode = 'dialog';
    else if (mode === 'direct' && printers.filePrinters.includes(job.printer)) mode = 'pdf';
    if (mode === 'pdf') {
      const out = await native.chooseSavePath(`${settings().lastDirectory ?? ''}/${nameOf(activePath() ?? 'note')}.pdf`, ['pdf']);
      if (!out) { popups.post('print', { type: 'print-done', ok: false, error: t('status.exportCancel'), keep: true }); return; }
      await printToPdfFile({ html: page, path: out, widthMm: job.widthMm, heightMm: job.heightMm });
      notify('success', t('export.done', { name: fileNameOf(out.replace(/\\/g, '/')) }));
    } else if (mode === 'dialog') {
      await printDocument({ html: page });
    } else {
      await printDirect({ html: page, printer: job.printer, copies: job.copies, widthMm: job.widthMm, heightMm: job.heightMm, pageRanges: job.pageRanges });
      notify('success', t('status.printedTo', { printer: job.printer }));
    }
    popups.post('print', { type: 'print-done', ok: true });
  } catch (error) {
    popups.post('print', { type: 'print-done', ok: false, error: native.errorText(error), keep: true });
    showError('error.print', error);
  } finally { printing = false; }
}

async function copyAsMarkdown() {
  const path = activePath();
  if (!path || !isNote(path)) return;
  await copyText(await core('flatten', { path, text: docs.get(path)?.text, keepLinks: true }));
}

async function presentation(kind) {
  const path = activePath();
  if (!path || !isNote(path)) { notify('warning', t('export.noNote')); return; }
  const rendered = await renderNote(path, docs.get(path)?.text ?? '');
  const ctx = { ...previewCtx(path, null), title: nameOf(path), readingTheme: settings().readingTheme, readingFont: settings().readingFont, onExit: () => {}, loadPrefs: () => loadJson('mymarkdown.presentation', {}), savePrefs: (v) => saveJson('mymarkdown.presentation', v) };
  if (kind === 'slides') startSlides(rendered.html, ctx); else startReadingPresentation(rendered.html, ctx);
}

async function pasteFiles(view, files, pos) {
  try { const links = await features.saveAttachments(files, view.path); view.editor.insertText(links.join('\n'), pos); } catch (error) { showError('error.attachment', error); }
}
/** The note editor under a window point (client px) and the text position there: { view, pos } or null. */
function noteEditorAt(x, y) {
  for (const v of views.values()) { const pos = v instanceof NoteView ? v.editor?.posAtPoint?.(x, y) : null; if (pos != null) return { view: v, pos }; }
  return null;
}

// ───────────────────────── commands

const toggle = (key) => updateSettings({ [key]: !settings()[key] });
const noteOpen = () => Boolean(activeNoteView());
const fileOpen = () => Boolean(activePath());
const withEditor = (fn) => () => { const v = activeNoteView(); if (!v) return; if (v.mode === 'reading') v.setMode('live'); if (v.editor) fn(v.editor); };
const modeCommand = (mode, glyph, key) => ({ icon: glyph, label: `mode.${mode}`, key, enabled: noteOpen, checked: () => activeNoteView()?.mode === mode, run: () => activeNoteView()?.setMode(mode) });
const fmt = (label, glyph, fn, key) => ({ icon: glyph, label, key, enabled: noteOpen, run: withEditor(fn) });

const commands = {
  // vault & files
  openVault: { icon: 'folderOpen', label: 'vault.openFolder', key: 'Ctrl+Shift+O', run: () => openVaultFolder() },
  newVault: { icon: 'folderAdd', label: 'vault.new', run: () => newVault() },
  browserVaults: { icon: 'database', label: 'vault.browser', hidden: desktop, run: () => browserVaults() },
  closeVault: { icon: 'closeAll', label: 'vault.close', enabled: hasVault, run: () => closeVault() },
  revealVault: { icon: 'locate', label: 'vault.reveal', hidden: !desktop, enabled: hasVault, run: () => state.vault.reveal('') },
  newNote: { icon: 'fileNew', label: 'action.newNote', key: 'Ctrl+N', enabled: hasVault, run: () => features.newNote() },
  newNoteTab: { icon: 'newTab', label: 'action.newNoteTab', key: 'Ctrl+Shift+N', enabled: hasVault, run: () => features.newNote({ newTab: true }) },
  newFolder: { icon: 'folderAdd', label: 'action.newFolder', enabled: hasVault, run: () => features.newFolder() },
  newCanvas: { icon: 'canvasFile', label: 'action.newCanvas', enabled: hasVault, run: () => features.newCanvas() },
  dailyNote: { icon: 'calendar', label: 'action.dailyNote', key: 'Alt+D', enabled: hasVault, run: () => features.dailyNote(0) },
  dailyPrev: { icon: 'chevronLeft', label: 'action.dailyPrev', enabled: hasVault, run: () => features.adjacentDaily(-1) },
  dailyNext: { icon: 'chevronRight', label: 'action.dailyNext', enabled: hasVault, run: () => features.adjacentDaily(1) },
  uniqueNote: { icon: 'idCard', label: 'action.uniqueNote', enabled: hasVault, run: () => features.uniqueNote() },
  randomNote: { icon: 'dice', label: 'action.randomNote', enabled: hasVault, run: () => features.randomNote() },
  newFromTemplate: { icon: 'template', label: 'action.newFromTemplate', enabled: hasVault, run: () => features.newFromTemplate() },
  insertTemplate: { icon: 'templateInsert', label: 'action.insertTemplate', key: 'Alt+T', enabled: noteOpen, run: () => features.insertTemplate() },
  insertDate: { icon: 'calendar', label: 'action.insertDate', enabled: noteOpen, run: () => features.insertDate('date') },
  insertTime: { icon: 'clock', label: 'action.insertTime', enabled: noteOpen, run: () => features.insertDate('time') },
  save: { icon: 'save', label: 'action.save', key: 'Ctrl+S', enabled: () => fileOpen() && isDirty(activePath()), run: () => saveDoc(activePath()) },
  saveAll: { icon: 'saveAll', label: 'action.saveAll', key: 'Ctrl+Alt+S', enabled: anyDirty, run: () => saveAll() },
  renameFile: { icon: 'edit', label: 'file.rename', key: 'F2', enabled: fileOpen, run: () => features.rename(activePath()) },
  moveFile: { icon: 'moveFolder', label: 'file.move', enabled: fileOpen, run: () => features.move(activePath()) },
  duplicateFile: { icon: 'duplicate', label: 'file.duplicate', enabled: fileOpen, run: () => features.duplicate(activePath()) },
  deleteFile: { icon: 'trash', label: 'file.delete', enabled: fileOpen, run: () => features.remove(activePath()) },
  revealActive: { icon: 'locate', label: 'file.revealTree', enabled: fileOpen, run: () => revealInTree(activePath()) },
  revealSystem: { icon: 'folderOpen', label: 'file.revealSystem', hidden: !desktop, enabled: fileOpen, run: () => state.vault.reveal(activePath()) },
  openDefault: { icon: 'openFile', label: 'file.openDefault', hidden: !desktop, enabled: fileOpen, run: async () => native.openExternal(await state.vault.absPath(activePath())) },
  copyPath: { icon: 'copy', label: 'file.copyPath', enabled: fileOpen, run: () => copyText(activePath()) },
  copyLink: { icon: 'hyperlink', label: 'file.copyLink', enabled: fileOpen, run: () => copyText(`[[${linkTextFor(activePath(), '')}]]`) },
  recovery: { icon: 'history', label: 'action.recovery', enabled: noteOpen, run: () => features.recovery() },
  exportMenu: { icon: 'exportFile', label: 'action.export', enabled: noteOpen, run: (c) => exportMenu(c?.anchor) },
  exportAgain: { icon: 'exportAgain', label: 'action.exportAgain', key: 'Ctrl+Alt+E', enabled: () => noteOpen() && Boolean(settings().lastExport), run: () => exportNote(settings().lastExport.format, { again: true }) },
  copyMarkdown: { icon: 'markdownFile', label: 'action.copyMarkdown', enabled: noteOpen, run: () => copyAsMarkdown() },
  print: { icon: 'print', label: 'action.print', key: 'Ctrl+Shift+P', enabled: noteOpen, run: () => printNote() },
  startPage: { icon: 'home', label: 'action.startPage', key: 'Ctrl+Shift+H', checked: onStart, run: () => toggleStart() },
  exit: { icon: 'exit', label: 'action.exit', key: isMac ? 'Ctrl+Q' : 'Alt+F4', hidden: !desktop, run: () => requestExit() },
  // edit
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: () => Boolean(activeNoteView()?.editor?.canUndo?.()), run: withEditor((e) => e.undo()) },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: () => Boolean(activeNoteView()?.editor?.canRedo?.()), run: withEditor((e) => e.redo()) },
  find: { icon: 'search', label: 'action.find', key: 'Ctrl+F', enabled: noteOpen, run: withEditor((e) => e.openSearch({ replace: false })) },
  replace: { icon: 'replace', label: 'action.replace', key: 'Ctrl+H', enabled: noteOpen, run: withEditor((e) => e.openSearch({ replace: true })) },
  searchVault: { icon: 'searchAll', label: 'action.searchVault', key: 'Ctrl+Shift+F', enabled: hasVault, run: () => searchFor(activeNoteView()?.editor?.getSelection()?.text || state.search.query) },
  quickSwitcher: { icon: 'switcher', label: 'action.quickSwitcher', key: 'Ctrl+O', enabled: hasVault, run: () => quickSwitcher() },
  commandPalette: { icon: 'command', label: 'action.commandPalette', key: 'Ctrl+P', run: () => commandPalette() },
  mergeNote: { icon: 'mergeDocs', label: 'action.merge', enabled: noteOpen, run: () => features.mergeInto() },
  extractNote: { icon: 'extract', label: 'action.extract', enabled: noteOpen, run: () => features.extractSelection() },
  extractEmbed: { icon: 'embed', label: 'action.extractEmbed', enabled: noteOpen, run: () => features.extractSelection({ embed: true }) },
  foldAll: { icon: 'collapseAll', label: 'action.foldAll', enabled: noteOpen, run: withEditor((e) => e.foldAll()) },
  unfoldAll: { icon: 'expandAll', label: 'action.unfoldAll', enabled: noteOpen, run: withEditor((e) => e.unfoldAll()) },
  toggleFold: { icon: 'fold', label: 'action.toggleFold', enabled: noteOpen, run: withEditor((e) => e.toggleFoldAtCursor()) },
  // format
  bold: fmt('md.bold', 'bold', (e) => e.wrapSelection('**', '**', t('editor.text.bold')), 'Ctrl+B'),
  italic: fmt('md.italic', 'italic', (e) => e.wrapSelection('*', '*', t('editor.text.italic')), 'Ctrl+I'),
  strike: fmt('md.strike', 'strike', (e) => e.wrapSelection('~~', '~~', t('editor.text.strike'))),
  highlight: fmt('md.highlight', 'highlighter', (e) => e.wrapSelection('==', '==', t('editor.text.highlight'))),
  code: fmt('md.code', 'code', (e) => e.wrapSelection('`', '`', t('editor.text.code'))),
  comment: fmt('md.comment', 'comment', (e) => e.wrapSelection('%%', '%%', '')),
  link: fmt('md.link', 'hyperlink', (e) => e.insertLink(), 'Ctrl+K'),
  wikiLink: fmt('md.wikiLink', 'wikiLink', (e) => e.insertWikiLink()),
  h1: fmt('md.h1', 'heading1', (e) => e.setHeading(1)), h2: fmt('md.h2', 'heading2', (e) => e.setHeading(2)), h3: fmt('md.h3', 'heading3', (e) => e.setHeading(3)),
  h4: fmt('md.h4', 'heading4', (e) => e.setHeading(4)), h5: fmt('md.h5', 'heading5', (e) => e.setHeading(5)), h6: fmt('md.h6', 'heading6', (e) => e.setHeading(6)), paragraph: fmt('md.paragraph', 'paragraph', (e) => e.setHeading(0)),
  bulletList: fmt('md.list', 'listBullet', (e) => e.toggleLinePrefix('- ')), numberedList: fmt('md.ordered', 'listNumbered', (e) => e.toggleLinePrefix('1. ')),
  taskList: fmt('md.task', 'checkAll', (e) => e.toggleTask(), 'Ctrl+L'), quoteBlock: fmt('md.quote', 'quote', (e) => e.toggleLinePrefix('> ')),
  callout: fmt('md.callout', 'callout', (e) => e.insertCallout('note')), codeBlock: fmt('md.codeBlock', 'codeBlock', (e) => e.insertCodeBlock('')),
  mathBlock: fmt('md.math', 'math', (e) => e.insertMath(true)), table: fmt('md.table', 'table', (e) => e.insertTable(3, 3)), formatTable: fmt('md.formatTable', 'tableFormat', (e) => e.formatTable()),
  tableRow: fmt('md.tableRow', 'tableRow', (e) => e.tableAddRow()), tableColumn: fmt('md.tableColumn', 'tableColumn', (e) => e.tableAddColumn()),
  footnote: fmt('md.footnote', 'footnote', (e) => e.insertFootnote()), rule: fmt('md.rule', 'rule', (e) => e.insertHorizontalRule()),
  moveLineUp: fmt('md.lineUp', 'moveUp', (e) => e.moveLineUp()), moveLineDown: fmt('md.lineDown', 'moveDown', (e) => e.moveLineDown()),
  // view
  'mode:live': modeCommand('live', 'editMode', 'Ctrl+1'),
  'mode:source': modeCommand('source', 'markdownFile', 'Ctrl+2'),
  'mode:reading': modeCommand('reading', 'preview', 'Ctrl+3'),
  'mode:split': modeCommand('split', 'splitView', 'Ctrl+4'),
  toggleReading: { icon: 'preview', label: 'mode.toggle', key: 'Ctrl+E', enabled: noteOpen, run: () => { const v = activeNoteView(); v.setMode(v.mode === 'reading' ? (settings().defaultMode === 'reading' ? 'live' : settings().defaultMode) : 'reading'); } },
  splitRight: { icon: 'splitRight', label: 'pane.splitRight', key: 'Ctrl+\\', enabled: hasVault, run: () => splitActive('row') },
  splitDown: { icon: 'splitDown', label: 'pane.splitDown', key: 'Ctrl+Shift+\\', enabled: hasVault, run: () => splitActive('column') },
  closeTab: { icon: 'closeTab', label: 'tab.close', key: 'Ctrl+W', enabled: () => hasVault() && Boolean(activeTab(state.layout)), run: () => closeTabById(activeTab(state.layout).id) },
  closeOthers: { icon: 'closeAll', label: 'tab.closeOthers', enabled: hasVault, run: () => { const cur = activeTab(state.layout); for (const tab of activeLeaf(state.layout).tabs.filter((x) => x !== cur && !x.pinned)) closeTabById(tab.id); } },
  pinTab: { icon: 'pin', label: 'tab.pin', enabled: () => hasVault() && Boolean(activeTab(state.layout)), checked: () => Boolean(activeTab(state.layout)?.pinned), run: () => { const tab = activeTab(state.layout); tab.pinned = !tab.pinned; renderWorkspace(); } },
  nextTab: { icon: 'chevronRight', label: 'tab.next', key: 'Ctrl+Tab', hidden: true, enabled: hasVault, run: () => cycleTab(1) },
  prevTab: { icon: 'chevronLeft', label: 'tab.prev', key: 'Ctrl+Shift+Tab', hidden: true, enabled: hasVault, run: () => cycleTab(-1) },
  goBack: { icon: 'arrowLeft', label: 'nav.back', key: 'Alt+Left', enabled: () => (activeTab(state.layout)?.history?.length ?? 0) > 0, run: () => navigate(-1) },
  goForward: { icon: 'arrowRight', label: 'nav.forward', key: 'Alt+Right', enabled: () => (activeTab(state.layout)?.forward?.length ?? 0) > 0, run: () => navigate(1) },
  graphView: { icon: 'graphView', label: 'graph.open', key: 'Ctrl+G', enabled: hasVault, run: () => openSpecial('graph') },
  localGraph: { icon: 'graphLocal', label: 'graph.local', enabled: hasVault, run: () => showRightTab('localgraph') },
  leftPanel: { icon: 'panelLeft', label: 'action.leftPanel', key: 'Ctrl+Shift+1', checked: () => settings().showLeftPanel, run: () => toggle('showLeftPanel') },
  rightPanel: { icon: 'panelRight', label: 'action.rightPanel', key: 'Ctrl+Shift+2', checked: () => settings().showRightPanel, run: () => toggle('showRightPanel') },
  bottomPanel: { icon: 'panelBottom', label: 'action.bottomPanel', key: 'Ctrl+J', checked: () => settings().showBottomPanel, run: () => toggle('showBottomPanel') },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => settings().showStatusBar, run: () => toggle('showStatusBar') },
  ...Object.fromEntries(P.LEFT_TABS.map(([id, glyph]) => [`left:${id}`, { icon: glyph, label: `panel.${id}`, checked: () => settings().leftTab === id, run: () => showLeftTab(id) }])),
  ...Object.fromEntries([['problems', 'warning'], ['messages', 'info'], ['info', 'docProperties']].map(([id, glyph]) => [`bottom:${id}`, { icon: glyph, label: `bottom.${id}`, checked: () => settings().showBottomPanel && settings().bottomTab === id, run: () => showBottomTab(id) }])),
  ...Object.fromEntries(P.RIGHT_TABS.map(([id, glyph]) => [`right:${id}`, { icon: glyph, label: `panel.${id}`, checked: () => settings().rightTab === id, run: () => showRightTab(id) }])),
  zoomIn: { icon: 'zoomIn', label: 'action.zoomIn', key: 'Ctrl+=', run: () => updateSettings({ editorFontSize: Math.min(28, settings().editorFontSize + 1), readingFontSize: Math.min(32, settings().readingFontSize + 1) }) },
  zoomOut: { icon: 'zoomOut', label: 'action.zoomOut', key: 'Ctrl+-', run: () => updateSettings({ editorFontSize: Math.max(9, settings().editorFontSize - 1), readingFontSize: Math.max(10, settings().readingFontSize - 1) }) },
  zoomReset: { icon: 'zoomReset', label: 'action.zoomReset', key: 'Ctrl+0', run: () => updateSettings({ editorFontSize: 15, readingFontSize: 16 }) },
  readableLength: { icon: 'readableWidth', label: 'view.readable', checked: () => settings().readableLineLength, run: () => toggle('readableLineLength') },
  lineNumbers: { icon: 'lineNumbers', label: 'view.lineNumbers', checked: () => settings().lineNumbers, run: () => toggle('lineNumbers') },
  // Properties are shown in the right panel (속성 tab), never above the document.
  showProperties: { icon: 'docProperties', label: 'view.properties', checked: () => settings().showRightPanel && settings().rightTab === 'properties', run: () => showRightTab('properties') },
  syncScroll: { icon: 'syncScroll', label: 'view.syncScroll', checked: () => settings().syncScroll, run: () => toggle('syncScroll') },
  // writing tools (iA Writer, Typora, Ulysses, Bear)
  focusMode: { icon: 'focus', label: 'write.focus', key: 'F8', checked: () => settings().focusMode !== 'off', run: () => updateSettings({ focusMode: settings().focusMode === 'off' ? settings().lastFocusMode ?? 'paragraph' : 'off', lastFocusMode: settings().focusMode === 'off' ? settings().lastFocusMode : settings().focusMode }) },
  'focus:line': { icon: 'focusLine', label: 'write.focusLine', checked: () => settings().focusMode === 'line', run: () => updateSettings({ focusMode: 'line', lastFocusMode: 'line' }) },
  'focus:sentence': { icon: 'focusSentence', label: 'write.focusSentence', checked: () => settings().focusMode === 'sentence', run: () => updateSettings({ focusMode: 'sentence', lastFocusMode: 'sentence' }) },
  'focus:paragraph': { icon: 'focusParagraph', label: 'write.focusParagraph', checked: () => settings().focusMode === 'paragraph', run: () => updateSettings({ focusMode: 'paragraph', lastFocusMode: 'paragraph' }) },
  typewriter: { icon: 'typewriter', label: 'write.typewriter', key: 'F9', checked: () => settings().typewriter, run: () => toggle('typewriter') },
  styleCheck: { icon: 'spellCheck', label: 'write.styleCheck', key: 'F7', checked: () => settings().showStyleCheck, run: () => toggle('showStyleCheck') },
  syntaxHighlight: { icon: 'syntax', label: 'write.syntax', checked: () => settings().highlightSyntax, run: () => toggle('highlightSyntax') },
  smartPunctuation: { icon: 'quote', label: 'write.smartPunctuation', checked: () => settings().smartPunctuation, run: () => toggle('smartPunctuation') },
  setGoal: { icon: 'target', label: 'write.goal', enabled: noteOpen, run: () => setGoal() },
  slides: { icon: 'slides', label: 'present.slides', key: 'F5', enabled: noteOpen, run: () => presentation('slides') },
  readingPresentation: { icon: 'presentation', label: 'present.reading', key: 'Shift+F5', enabled: noteOpen, run: () => presentation('reading') },
  fullscreen: { icon: 'fullscreen', label: 'view.fullscreen', key: 'F11', run: () => toggleFullscreen() },
  audioRecord: { icon: 'microphone', label: 'action.record', checked: () => state.recording, enabled: noteOpen, run: () => features.toggleRecording() },
  // bookmarks, notes, workspaces
  bookmarkActive: { icon: 'bookmarkAdd', label: 'bookmarks.addActive', enabled: fileOpen, run: () => features.bookmark({ type: 'file', path: activePath() }) },
  bookmarkSearch: { icon: 'search', label: 'bookmarks.addSearch', enabled: () => Boolean(state.search.query), run: () => features.bookmark({ type: 'search', query: state.search.query }) },
  pinNote: { icon: 'pin', label: 'notes.pin', enabled: fileOpen, checked: () => (vaultPrefs().pinned ?? []).includes(activePath()), run: () => togglePinned(activePath()) },
  archiveNote: { icon: 'archive', label: 'notes.archive', enabled: noteOpen, run: () => archiveNote(activePath()) },
  saveWorkspace: { icon: 'layout', label: 'workspace.save', enabled: hasVault, run: () => features.saveWorkspace() },
  loadWorkspace: { icon: 'layoutLoad', label: 'workspace.load', enabled: hasVault, run: () => features.loadWorkspace() },
  deleteWorkspace: { icon: 'layoutDelete', label: 'workspace.delete', enabled: hasVault, run: () => features.deleteWorkspace() },
  copySearchResults: { icon: 'copy', label: 'search.copy', hidden: true, enabled: () => state.search.results.length > 0, run: () => copyText(state.search.results.map((r) => `- [[${linkTextFor(r.path, '')}]]`).join('\n')) },
  fileSort: { icon: 'sortAsc', label: 'files.sort', hidden: true, enabled: hasVault, run: (c) => fileSortMenu(c?.anchor) },
  collapseAll: { icon: 'collapseAll', label: 'files.collapseAll', hidden: true, enabled: hasVault, run: () => setVaultPrefs({ expanded: [] }) },
  // AI
  aiPanel: { icon: 'aiSpark', label: 'ai.panel', key: 'Ctrl+Shift+A', run: () => showRightTab('ai') },
  aiMenu: { icon: 'chevronDown', label: 'ai.actions', enabled: noteOpen, run: (c) => aiMenu(c?.anchor) },
  // appearance, help
  theme: { icon: 'palette', label: 'action.themeRandom', run: () => updateSettings({ theme: randomThemeId(settings().theme) }) },
  themeMenu: { icon: 'chevronDown', label: 'action.themeChoose', run: (c) => openThemePicker(c?.anchor) },
  readingThemeMenu: { icon: 'readingTheme', label: 'view.readingTheme', run: (c) => readingThemeMenu(c?.anchor) },
  language: { icon: 'globe', label: 'action.language', key: 'Ctrl+Shift+L', run: () => updateSettings({ language: getLanguage() === 'ko' ? 'en' : 'ko' }) },
  shuffleBackground: { icon: 'dice', label: 'action.shuffleBackground', key: 'Ctrl+Shift+B', run: () => shuffleBackground() },
  backgroundImage: { icon: 'imageBg', label: 'action.backgroundImage', run: () => chooseBackground() },
  clearBackground: { icon: 'imageClear', label: 'action.clearBackground', enabled: () => Boolean(settings().backgroundImage) || settings().backgroundKind !== 'none', run: () => removeBackground() },
  showProblems: { icon: 'warning', label: 'action.showProblems', run: () => showBottomTab('problems') },
  showMessages: { icon: 'info', label: 'action.showMessages', run: () => showBottomTab('messages') },
  clearMessages: { icon: 'clearHistory', label: 'action.clearMessages', enabled: () => state.log.length > 0, run: () => { state.log = []; renderBottom(); } },
  welcome: { icon: 'bulb', label: 'action.welcome', run: () => openWelcome() },
  tutorial: { icon: 'tutorial', label: 'action.tutorial', key: 'Shift+F1', run: () => startTutorial() },
  userGuide: { icon: 'userGuide', label: 'action.userGuide', run: () => openDocWindow('guide') },
  tutorialDoc: { icon: 'tutorialDoc', label: 'action.tutorialDoc', run: () => openDocWindow('tutorial') },
  shortcuts: { icon: 'keyboard', label: 'action.shortcuts', run: () => popups.open('settings', { tab: 'shortcuts' }) },
  settings: { icon: 'gear', label: 'action.settings', key: 'Ctrl+,', run: () => popups.open('settings', { tab: 'general' }) },
  about: { icon: 'info', label: 'action.about', key: 'F1', run: () => popups.open('about') },
};

function commandEnabled(id) { const c = commands[id]; return Boolean(c) && (c.enabled ? Boolean(c.enabled()) : true); }
function commandTip(id) {
  const c = commands[id];
  if (!c) return id;
  const tip = t(`tip.${id.replace(':', '.')}`, null, '');
  const on = c.checked && !id.includes(':') && id !== 'startPage' ? ` — ${t(c.checked() ? 'opts.on' : 'opts.off')}` : '';
  return `${t(c.label)}${c.key ? ` (${keyLabel(c.key)})` : ''}${on}${tip ? ` — ${tip}` : ''}`;
}
async function run(id, context) {
  const c = commands[id];
  if (!c || !commandEnabled(id)) return undefined;
  try { const result = await c.run(context); renderToolbarState(); return result; } catch (error) { return showError('error.command', error, t(c.label)); }
}

function splitActive(dir) {
  const tab = activeTab(state.layout);
  splitLeaf(state.layout, activeLeaf(state.layout).id, dir, tab?.path ? newTab({ kind: tab.kind, path: tab.path, mode: tab.mode }) : newTab({ kind: 'empty' }));
  renderWorkspace();
  activeChanged();
}

function cycleTab(step) {
  const leaf = activeLeaf(state.layout);
  if (!leaf?.tabs.length) return;
  leaf.active = (leaf.active + step + leaf.tabs.length) % leaf.tabs.length;
  renderWorkspace();
  activeChanged();
}

async function navigate(step) {
  const tab = activeTab(state.layout);
  if (!tab) return;
  const from = step < 0 ? tab.history : tab.forward;
  const target = from?.pop();
  if (!target || !index.has(target.path)) return;
  const to = step < 0 ? (tab.forward ??= []) : (tab.history ??= []);
  if (tab.path) to.push({ kind: tab.kind, path: tab.path });
  views.get(tab.id)?.destroy?.();
  views.delete(tab.id);
  const old = tab.path;
  tab.kind = target.kind; tab.path = target.path;
  if (tab.kind === 'note') await loadDoc(tab.path);
  dropDocIfClosed(old);
  renderWorkspace();
  activeChanged();
}

function openSpecial(kind) {
  const existing = allTabs(state.layout).find((x) => x.kind === kind);
  if (existing) { const leaf = leafOfTab(state.layout, existing.id); leaf.active = leaf.tabs.indexOf(existing); state.layout.active = leaf.id; }
  else openTab(state.layout, newTab({ kind }), { newTab: true });
  renderWorkspace();
  activeChanged();
}

async function toggleFullscreen() {
  if (desktop) { const full = await appWindow.isFullscreen(); await appWindow.setFullscreen(!full); return; }
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
}

function togglePinned(path) { const list = vaultPrefs().pinned ?? []; setVaultPrefs({ pinned: list.includes(path) ? list.filter((p) => p !== path) : [...list, path] }); }

async function archiveNote(path) {
  const folder = vaultPrefs().archiveFolder ?? t('notes.archiveFolder');
  if (!index.folders.has(folder)) await state.vault.mkdir(folder);
  await features.moveTo(path, `${folder}/${fileNameOf(path)}`);
}

async function setGoal() {
  const path = activePath();
  const current = vaultPrefs().goals?.[path] ?? index.meta(path)?.frontmatter?.goal ?? '';
  const value = await promptText({ title: t('goal.title'), value: String(current), glyph: 'target', validate: (v) => (v && !/^\d+$/.test(v) ? t('goal.number') : null) });
  if (value == null) return;
  setVaultPrefs({ goals: { ...(vaultPrefs().goals ?? {}), [path]: Number(value) || 0 } });
  renderStatus();
}

// ───────────────────────── menus

const SUBMENUS = {
  newMore: { icon: 'fileNew', items: ['newNoteTab', 'newFolder', 'newCanvas', '-', 'dailyNote', 'dailyPrev', 'dailyNext', 'uniqueNote', 'newFromTemplate'] },
  exportAs: { icon: 'exportFile', items: ['exportMenu', 'exportAgain', 'copyMarkdown', 'print'] },
  fileOps: { icon: 'file', items: ['renameFile', 'moveFile', 'duplicateFile', 'deleteFile', '-', 'revealActive', 'revealSystem', 'openDefault', 'copyPath', 'copyLink', '-', 'recovery'] },
  headings: { icon: 'heading1', items: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'paragraph'] },
  lists: { icon: 'listBullet', items: ['bulletList', 'numberedList', 'taskList', 'quoteBlock'] },
  tables: { icon: 'table', items: ['table', 'formatTable', 'tableRow', 'tableColumn'] },
  modes: { icon: 'editMode', items: ['mode:live', 'mode:source', 'mode:reading', 'mode:split', '-', 'syncScroll', 'showProperties', 'readableLength', 'lineNumbers'] },
  panes: { icon: 'splitRight', items: ['splitRight', 'splitDown', '-', 'closeTab', 'closeOthers', 'pinTab', '-', 'goBack', 'goForward'] },
  leftTabs: { icon: 'panelLeft', items: P.LEFT_TABS.map(([id]) => `left:${id}`) },
  rightTabs: { icon: 'panelRight', items: P.RIGHT_TABS.map(([id]) => `right:${id}`) },
  bottomTabs: { icon: 'panelBottom', items: ['bottomPanel', '-', 'bottom:problems', 'bottom:messages', 'bottom:info', '-', 'clearMessages'] },
  show: { icon: 'eye', items: ['leftPanel', 'rightPanel', 'bottomPanel', 'statusBar', '-', 'showProblems', 'showMessages'] },
  zoom: { icon: 'zoomIn', items: ['zoomIn', 'zoomOut', 'zoomReset'] },
  appearance: { icon: 'palette', items: ['theme', 'themeMenu', 'readingThemeMenu', 'language', '-', 'shuffleBackground', 'backgroundImage', 'clearBackground'] },
  focus: { icon: 'focus', items: ['focusMode', 'focus:line', 'focus:sentence', 'focus:paragraph'] },
  present: { icon: 'slides', items: ['slides', 'readingPresentation', 'fullscreen'] },
  workspaces: { icon: 'layout', items: ['saveWorkspace', 'loadWorkspace', 'deleteWorkspace'] },
  composer: { icon: 'mergeDocs', items: ['mergeNote', 'extractNote', 'extractEmbed'] },
  folding: { icon: 'fold', items: ['toggleFold', 'foldAll', 'unfoldAll'] },
};
const sub = (key) => ({ sub: key });
const MENUS = {
  file: ['newNote', sub('newMore'), '-', 'openVault', 'newVault', 'browserVaults', 'closeVault', 'revealVault', '-', 'save', 'saveAll', sub('fileOps'), '-', sub('exportAs'), 'print', '-', 'startPage', 'exit'],
  edit: ['undo', 'redo', '-', 'find', 'replace', 'searchVault', '-', 'quickSwitcher', 'commandPalette', '-', sub('composer'), sub('folding'), '-', 'moveLineUp', 'moveLineDown'],
  format: ['bold', 'italic', 'strike', 'highlight', 'code', 'comment', '-', sub('headings'), sub('lists'), '-', 'link', 'wikiLink', 'callout', 'codeBlock', 'mathBlock', sub('tables'), 'footnote', 'rule', '-', 'insertTemplate', 'insertDate', 'insertTime'],
  view: [sub('modes'), sub('panes'), '-', 'graphView', 'localGraph', '-', 'leftPanel', 'rightPanel', 'bottomPanel', '-', sub('leftTabs'), sub('rightTabs'), sub('bottomTabs'), sub('show'), '-', sub('zoom'), sub('appearance'), sub('workspaces')],
  notes: ['dailyNote', 'uniqueNote', 'randomNote', 'newFromTemplate', '-', 'bookmarkActive', 'pinNote', 'archiveNote', '-', 'audioRecord', 'recovery'],
  tools: [sub('focus'), 'typewriter', 'styleCheck', 'syntaxHighlight', 'smartPunctuation', 'setGoal', '-', sub('present'), '-', 'aiPanel', 'aiMenu'],
  help: ['welcome', 'tutorial', 'tutorialDoc', 'userGuide', 'shortcuts', '-', 'settings', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', format: 'bold', view: 'eye', notes: 'notesList', tools: 'tools', help: 'question' };

const TOOLBAR = [
  ['newNote', 'openVault', 'save', 'exportSplit', 'print'],
  ['undo', 'redo'],
  ['mode:live', 'mode:source', 'mode:reading', 'mode:split'],
  ['splitRight', 'splitDown'],
  ['quickSwitcher', 'searchVault', 'commandPalette', 'graphView', 'newCanvas', 'dailyNote', 'insertTemplate'],
  ['bold', 'italic', 'highlight', 'link', 'taskList', 'table', 'codeBlock'],
  ['focusMode', 'typewriter', 'styleCheck', 'slides'],
  ['aiSplit'],
];
const MENUBAR_PANELS = ['leftPanel', 'bottomPanel', 'rightPanel'];
const TOOLBAR_RIGHT = ['tutorial', 'themeSplit', 'language', 'settings', 'about'];
const TOOLBAR_MAIN = { themeSplit: 'theme', exportSplit: 'exportMenu', aiSplit: 'aiPanel' };

// ───────────────────────── shell

function renderShell() {
  root.innerHTML = `
    <nav id="menubar" role="menubar"></nav>
    <div id="toolbar" role="toolbar"></div>
    <main id="shell">
      <aside id="left-panel" class="side-panel" aria-label="${h(t('panel.left'))}"></aside>
      <div class="splitter vertical panel-split" data-split="left" role="separator" aria-orientation="vertical"></div>
      <section id="center">
        <div id="center-body">
          <div id="workspace" class="ws-root"></div>
          <div id="start-page" hidden></div>
          <div class="drop-overlay" aria-hidden="true"><div>${icon('drop')}<span>${h(t('drop.hint'))}</span></div></div>
        </div>
        <div class="splitter horizontal bottom-split" data-split="bottom" title="${h(t('bottom.splitter'))}" role="separator" aria-orientation="horizontal"></div>
        <section id="bottom-panel" aria-label="${h(t('bottom.title'))}"></section>
      </section>
      <div class="splitter vertical panel-split" data-split="right" role="separator" aria-orientation="vertical"></div>
      <aside id="right-panel" class="side-panel" aria-label="${h(t('panel.right'))}"></aside>
    </main>
    <footer id="statusbar" role="status"></footer>
    ${desktop ? `<div class="resize-grip" data-resize-grip title="${h(t('tip.resize'))}" role="separator">${icon('grip')}</div>` : `<div class="resize-grip static" aria-hidden="true">${icon('grip')}</div>`}
    <div id="tutorial-layer"></div>`;
}

function renderMenubar() {
  const menubar = root.querySelector('#menubar');
  const start = onStart();
  const home = `<button class="menubar-item menubar-home ${start ? 'current' : ''}" data-home title="${h(t('tip.home'))}" aria-pressed="${start}">${icon('home')}<span>${h(t('menu.home'))}</span></button><span class="menubar-sep" aria-hidden="true"></span>`;
  const brand = `<div class="app-brand" data-window-drag title="${h(`MyMarkdownMaster v${VERSION}`)}"><img class="app-brand-icon" src="${APP_ICON}" alt="" data-window-drag /><span class="app-brand-name" data-window-drag>MyMarkdownMaster</span><span class="app-brand-version" data-window-drag>v${h(VERSION)}</span></div>`;
  const button = (id, glyph, key) => `<button class="window-button ${id === 'close' ? 'close' : ''}" data-window="${id}" title="${h(t(key))}" aria-label="${h(t(key))}">${icon(glyph)}</button>`;
  const controls = desktop ? `<div class="window-controls">${button('minimize', 'winMinimize', 'window.minimize')}${state.maximized ? button('maximize', 'winRestore', 'window.restore') : button('maximize', 'winMaximize', 'window.maximize')}${button('close', 'winClose', 'window.close')}</div>` : '';
  const project = '<span class="menubar-project" data-window-drag><span class="app-brand-project-name" data-window-drag></span><span class="app-brand-dirty" data-window-drag>●</span></span>';
  const panels = `<div class="menubar-panels" role="group">${MENUBAR_PANELS.map((id) => `<button class="tool-button mini menubar-panel" data-command="${id}" title="${h(commandTip(id))}" aria-label="${h(t(commands[id].label))}" aria-pressed="${Boolean(commands[id].checked())}">${icon(commands[id].icon)}</button>`).join('')}</div>`;
  menubar.innerHTML = brand + home + Object.keys(MENUS).map((name) => `<button class="menubar-item ${state.openMenu === name ? 'open' : ''}" data-menu="${name}" role="menuitem" aria-haspopup="true" title="${h(t(`menu.${name}`))}">${icon(MENU_ICONS[name])}<span>${h(t(`menu.${name}`))}</span></button>`).join('') + project + `<div class="menubar-drag" data-window-drag></div>${panels}${controls}`;
  renderTitleProject();
}

function renderTitleProject() {
  const box = root.querySelector('.menubar-project');
  if (!box) return;
  const path = onStart() ? null : activePath();
  const name = state.vault && !onStart() ? `${state.vault.name}${path ? ` › ${isNote(path) ? nameOf(path) : fileNameOf(path)}` : ''}` : '';
  box.classList.toggle('empty', !name);
  box.classList.toggle('dirty', Boolean(path && isDirty(path)));
  box.querySelector('.app-brand-project-name').textContent = name;
  box.title = state.vault ? `${state.vault.kind === 'desktop' ? state.vault.root : state.vault.name}${path ? ` / ${path}` : ''}` : '';
  const title = `${path ? `${isDirty(path) ? '● ' : ''}${isNote(path) ? nameOf(path) : fileNameOf(path)} — ` : ''}${state.vault ? `${state.vault.name} — ` : ''}MyMarkdownMaster v${state.info?.version ?? VERSION}`;
  if (document.title !== title) { document.title = title; if (desktop) appWindow.setTitle(title).catch(() => {}); }
}

function windowButton(id) {
  if (!desktop) return;
  if (id === 'minimize') appWindow.minimize().catch(() => {});
  else if (id === 'maximize') appWindow.toggleMaximize().catch(() => {});
  else if (id === 'close') requestExit();
}

async function trackMaximized() {
  if (!desktop) return;
  const update = async () => { const maximized = await appWindow.isMaximized().catch(() => false); if (maximized !== state.maximized) { state.maximized = maximized; renderMenubar(); } };
  await update();
  appWindow.onResized(() => update()).catch(() => {});
  const markTime = (key) => { try { globalThis.localStorage?.setItem(key, String(Date.now())); } catch { /* private mode */ } };
  for (const type of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(type, () => markTime('mymarkdown.main.input'), { capture: true, passive: true });
  window.addEventListener('focus', () => markTime('mymarkdown.main.focus'));
}

let toolbarLanguage = null;
function renderToolbar() {
  const toolbar = root.querySelector('#toolbar');
  toolbarLanguage = getLanguage();
  const plain = (id, extra = '') => `<button class="tool-button ${extra}" data-command="${id}" title="${h(commandTip(id))}" aria-label="${h(t(commands[id].label))}">${id === 'language' ? switchFlag(getLanguage()) : icon(commands[id].icon)}</button>`;
  const split = (main, arrow, label) => `<span class="split-button">${plain(main)}<button class="tool-button split-arrow" data-command="${arrow}" title="${h(commandTip(arrow))}" aria-label="${h(t(label))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
  const button = (id) => {
    if (id === 'themeSplit') return split('theme', 'themeMenu', 'action.themeChoose');
    if (id === 'exportSplit') return plain('exportMenu');
    if (id === 'aiSplit') return split('aiPanel', 'aiMenu', 'ai.actions');
    return plain(id);
  };
  toolbar.innerHTML = `<div class="toolbar-inner">
    <div class="toolbar-left">${TOOLBAR.map((group, i) => `${i ? `<span class="tool-sep" data-group-sep="${i}" aria-hidden="true"></span>` : ''}<div class="tool-group" data-group="${i}">${group.map(button).join('')}</div>`).join('')}<button class="tool-button toolbar-more" data-toolbar-more hidden title="${h(t('toolbar.more'))}" aria-label="${h(t('toolbar.more'))}" aria-haspopup="true">${icon('toolbarMore')}</button></div>
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
  const ids = state.toolbarHidden.flatMap((group, i) => [...(i ? ['-'] : []), ...group.map((id) => TOOLBAR_MAIN[id] ?? id)]).filter((id) => id === '-' || commands[id]);
  if (ids.length) showMenu(menuItems(ids), anchorBelow(button));
}

function renderToolbarState() {
  for (const el of root.querySelectorAll('#toolbar [data-command], #menubar [data-command]')) {
    const id = el.dataset.command;
    el.disabled = !commandEnabled(id);
    const checked = commands[id]?.checked?.();
    el.classList.toggle('active', Boolean(checked));
    if (checked !== undefined) el.setAttribute('aria-pressed', String(Boolean(checked)));
  }
  root.querySelector('#toolbar [data-command="save"]')?.classList.toggle('dirty', Boolean(activePath() && isDirty(activePath())));
  renderTitleProject();
}

function updateMinimumWidth() {
  const right = root.querySelector('.toolbar-right');
  if (!right) return;
  requestAnimationFrame(() => {
    const menus = [...root.querySelectorAll('.app-brand, .menubar-item, .menubar-panels, .window-controls')].reduce((sum, el) => sum + el.offsetWidth + 2, 48);
    // Every toolbar button stays visible: the window is never narrower than the whole toolbar (all groups,
    // the separators and the right-hand group) — measured with every group shown.
    const left = root.querySelector('.toolbar-left');
    const inner = root.querySelector('.toolbar-inner');
    let tools = right.scrollWidth + 360;
    if (left && inner) {
      const hiddenEls = [...left.querySelectorAll('[data-group], [data-group-sep]')].filter((el) => el.hidden);
      for (const el of hiddenEls) el.hidden = false;
      const more = left.querySelector('[data-toolbar-more]'); const moreHidden = more?.hidden; if (more) more.hidden = true;
      const pad = inner.offsetWidth - inner.clientWidth + parseFloat(getComputedStyle(inner).paddingLeft) + parseFloat(getComputedStyle(inner).paddingRight);
      tools = left.scrollWidth + right.offsetWidth + 24 + pad;
      for (const el of hiddenEls) el.hidden = true;
      if (more) more.hidden = moreHidden;
    }
    const min = Math.min(window.screen?.availWidth || Infinity, Math.max(Math.ceil(Math.max(menus, tools)), 900));
    if (Math.abs(min - state.minWidth) < 1) return;
    state.minWidth = min;
    document.documentElement.style.setProperty('--min-width', `${min}px`);
    native.setMinimumSize(min, 600).catch(() => {});
  });
}

// ───────────────────────── panels

const panelApi = {
  get vault() { return state.vault; }, index, state, settings, t,
  vaultPrefs, activePath, commandTip, isDirty,
  excerpt: (path) => {
    const text = docs.get(path)?.text;
    if (text) return text.replace(/^---[\s\S]*?\n---\s*/, '').replace(/[#>*_`=[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 140);
    return (index.meta(path)?.headings ?? []).map((x) => x.text).join(' · ').slice(0, 140);
  },
  lineText: (path, line) => docs.get(path)?.text.split('\n')[line] ?? null,
  currentHeadingLine: () => { const hd = activeNoteView()?.editor?.currentHeading?.(); return hd ? hd.line - 1 : null; },
};

function railHtml(side) {
  const tabs = side === 'left' ? P.LEFT_TABS : P.RIGHT_TABS;
  const key = side === 'left' ? 'leftPanel' : 'rightPanel';
  return `<div class="panel-rail"><button class="rail-button expand" data-command="${key}" title="${h(t(`panel.expand${side === 'left' ? 'Left' : 'Right'}`))}">${icon(side === 'left' ? 'panelLeftOpen' : 'panelRightOpen')}<span class="rail-label">${h(t('panel.expand'))}</span></button>
    ${tabs.map(([id, glyph]) => `<button class="rail-button" data-${side}-tab="${id}" title="${h(t(`panel.${id}`))}">${icon(glyph)}</button>`).join('')}</div>`;
}

function renderLeft() {
  const panel = root.querySelector('#left-panel');
  if (!panel || onStart()) return;
  if (!settings().showLeftPanel) { panel.innerHTML = railHtml('left'); return; }
  const tab = settings().leftTab;
  const focused = document.activeElement;
  const typing = focused && panel.contains(focused) && focused.matches('input[type="search"], input[type="text"]') ? { attr: [...focused.attributes].find((a) => a.name.startsWith('data-'))?.name, pos: focused.selectionStart } : null;
  const scroll = panel.querySelector('.panel-body')?.scrollTop ?? 0;
  const body = tab === 'explorer' ? explorer.html() : tab === 'search' ? P.searchHtml(panelApi) : tab === 'bookmarks' ? P.bookmarksHtml(panelApi) : tab === 'tags' ? P.tagsHtml(panelApi) : tab === 'notes' ? P.notesHtml(panelApi) : P.filesHtml(panelApi);
  panel.innerHTML = `<div class="panel-header">${icon('vault')}<span class="panel-vault" title="${h(state.vault?.root || state.vault?.name || '')}">${h(state.vault?.name ?? '')}</span>
      <button class="icon-button" data-command="leftPanel" title="${h(t('panel.collapseLeft'))}">${icon('panelLeftClose')}</button></div>
    <div class="editor-tabs icon-tabs" role="tablist">${P.LEFT_TABS.map(([id, glyph]) => `<button class="editor-tab ${tab === id ? 'active' : ''}" data-left-tab="${id}" role="tab" title="${h(t(`panel.${id}`))}">${icon(glyph)}<span>${h(t(`panel.${id}Short`))}</span></button>`).join('')}</div>
    <div class="panel-body left-${tab}">${body}</div>`;
  panel.querySelector('.panel-body').scrollTop = scroll;
  if (typing?.attr) { const input = panel.querySelector(`[${typing.attr}]`); if (input) { input.focus(); try { input.setSelectionRange(typing.pos, typing.pos); } catch { /* not text */ } } }
}

function renderRight() {
  const panel = root.querySelector('#right-panel');
  if (!panel || onStart()) return;
  if (!settings().showRightPanel) { panel.innerHTML = railHtml('right'); aiPanel?.destroy(); aiPanel = null; localGraph?.destroy(); localGraph = null; return; }
  const tab = settings().rightTab;
  const focused = document.activeElement;
  if (focused && panel.contains(focused) && focused.matches('input, select') && tab !== 'ai' && !panel.querySelector('.right-ai:not([hidden])')) { clearTimeout(renderRight.timer); renderRight.timer = setTimeout(() => { if (!panel.contains(document.activeElement)) renderRight(); }, 500); return; }
  if (!panel.querySelector('.right-shell')) {
    panel.innerHTML = `<div class="right-shell"><div class="panel-header">${icon('panelRight')}<span data-right-title></span><button class="icon-button" data-command="rightPanel" title="${h(t('panel.collapseRight'))}">${icon('panelRightClose')}</button></div>
      <div class="editor-tabs icon-tabs" role="tablist" data-right-tabs></div><div class="panel-body right-body"></div><div class="panel-body right-ai" hidden></div><div class="panel-body right-graph" hidden></div></div>`;
  }
  panel.querySelector('[data-right-title]').textContent = t(`panel.${tab}`);
  panel.querySelector('[data-right-tabs]').innerHTML = P.RIGHT_TABS.map(([id, glyph]) => `<button class="editor-tab ${tab === id ? 'active' : ''}" data-right-tab="${id}" role="tab" title="${h(t(`panel.${id}`))}">${icon(glyph)}</button>`).join('');
  const body = panel.querySelector('.right-body');
  const aiHost = panel.querySelector('.right-ai');
  const graphHost = panel.querySelector('.right-graph');
  body.hidden = tab === 'ai' || tab === 'localgraph';
  aiHost.hidden = tab !== 'ai';
  graphHost.hidden = tab !== 'localgraph';
  if (tab === 'ai') { if (!aiPanel) aiPanel = createAiPanel(aiHost, aiApi()); else aiPanel.refresh(); return; }
  if (tab === 'localgraph') {
    if (!localGraph) import('./views/graph.js').then(({ createGraphView }) => { if (!localGraph && settings().rightTab === 'localgraph') localGraph = createGraphView(graphHost, graphApi({ mode: 'local', compact: true })); });
    else { localGraph.setLocal(activePath()); localGraph.refresh(); localGraph.resize?.(); }
    return;
  }
  const scroll = body.scrollTop;
  body.innerHTML = tab === 'backlinks' ? P.backlinksHtml(panelApi) : tab === 'outgoing' ? P.outgoingHtml(panelApi) : tab === 'properties' ? P.propertiesPanelHtml(panelApi) : tab === 'stats' ? P.statsHtml(panelApi) : P.outlineHtml(panelApi);
  body.scrollTop = scroll;
  if (tab === 'backlinks' && activePath() && state.unlinked?.path !== activePath()) {
    const path = activePath();
    state.unlinked = { path, list: null };
    core('unlinked', { path }).then((list) => { state.unlinked = { path, list }; if (settings().rightTab === 'backlinks' && activePath() === path) renderRight(); });
  }
}
const renderRightIf = (tab) => { if (settings().rightTab === tab) renderRight(); };

function highlightOutline() {
  if (settings().rightTab !== 'outline') return;
  const line = panelApi.currentHeadingLine();
  for (const el of root.querySelectorAll('#right-panel .outline-row')) el.classList.toggle('active', Number(el.dataset.gotoLine) === line);
}

let panelsTimer = 0;
function renderPanels() { clearTimeout(panelsTimer); panelsTimer = setTimeout(() => { renderLeft(); if (settings().rightTab !== 'ai') renderRight(); renderStatus(); }, 60); }

function showLeftTab(tab) { updateSettings({ leftTab: tab, showLeftPanel: true }); }
function showRightTab(tab) { updateSettings({ rightTab: tab, showRightPanel: true }); }
function showBottomTab(tab) { updateSettings({ bottomTab: tab, showBottomPanel: true }); }

function revealInTree(path) {
  if (!path) return;
  const parts = path.split('/');
  const expanded = new Set(vaultPrefs().expanded ?? []);
  for (let i = 1; i < parts.length; i += 1) expanded.add(parts.slice(0, i).join('/'));
  if (index.folders.has(path)) expanded.add(path);
  setVaultPrefs({ expanded: [...expanded] }, { quiet: true });
  updateSettings({ leftTab: 'files', showLeftPanel: true });
  setTimeout(() => { const row = root.querySelector(`[data-tree-path="${CSS.escape(path)}"]`); row?.scrollIntoView({ block: 'center' }); row?.classList.add('flash'); setTimeout(() => row?.classList.remove('flash'), 1200); }, 60);
}
function expandFolder(path) { const set = new Set(vaultPrefs().expanded ?? []); let p = path; while (p) { set.add(p); p = folderOf(p); } setVaultPrefs({ expanded: [...set] }); }

const SEV_ICON = { error: 'error', warning: 'warning', info: 'info', success: 'check' };
function renderBottom() {
  const host = root.querySelector('#bottom-panel');
  if (!host) return;
  const tab = settings().bottomTab;
  const counts = { problems: state.problems.length, messages: state.log.length };
  const tabs = [['problems', 'warning'], ['messages', 'info'], ['info', 'docProperties']].map(([id, glyph]) => `<button class="editor-tab ${tab === id ? 'active' : ''}" data-bottom-tab="${id}">${icon(glyph)}<span>${h(t(`bottom.${id}`))}</span>${counts[id] != null ? `<span class="badge">${counts[id]}</span>` : ''}</button>`).join('');
  let body;
  if (tab === 'problems') body = P.problemsHtml(panelApi);
  else if (tab === 'messages') body = state.log.map((e, i) => `<div class="problem-row sev-${e.kind}" data-log="${i}">${icon(SEV_ICON[e.kind] ?? 'info')}<span class="problem-text">${h(e.text)}</span><span class="path">${h(e.at.toLocaleTimeString())}</span></div>`).join('') || `<div class="problems-empty">${icon('info')}<span>${h(t('bottom.noMessages'))}</span></div>`;
  else {
    const info = state.info;
    const rows = [[t('info.app'), `MyMarkdownMaster ${info?.version ?? VERSION}`], [t('info.platform'), info ? (info.web ? 'Web' : `${info.os} / ${info.arch}`) : desktop ? 'Desktop' : 'Web'], [t('info.core'), desktop ? t('info.coreNative') : t('info.coreWasm')], [t('info.vault'), state.vault ? `${state.vault.name} (${t(`vault.kind.${state.vault.kind}`)})` : '—'], [t('info.notes'), index.notePaths().length], [t('info.files'), index.files.size], [t('info.tags'), index.tags().length], [t('info.links'), [...index.notes.values()].reduce((s, m) => s + (m.links?.length ?? 0), 0)]];
    body = `<table class="info-table">${rows.map(([k, v]) => `<tr><th>${h(k)}</th><td>${h(String(v))}</td></tr>`).join('')}</table>`;
  }
  host.innerHTML = `<div class="problems-header">${tabs}<span class="grow"></span>${(() => { const open = settings().showBottomPanel; const tip = t(open ? 'bottom.fold' : 'bottom.unfold'); return `<button class="icon-button bottom-fold" data-command="bottomPanel" title="${h(tip)}" aria-label="${h(tip)}" aria-expanded="${open}">${icon(open ? 'panelBottomClose' : 'panelBottomOpen')}</button>`; })()}</div><div class="problems-list bottom-${tab}">${body}</div>`;
}

let statusTimer = 0;
function scheduleStatus() { clearTimeout(statusTimer); statusTimer = setTimeout(renderStatus, 120); }
function renderStatus() {
  const bar = root.querySelector('#statusbar');
  if (!bar) return;
  const s = settings();
  const notice = state.notice;
  const hint = notice?.text ?? t('status.ready');
  const items = [`<span class="status-notice ${notice?.kind ?? 'hint'}" title="${h(hint)}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : 'info')}<span>${h(hint)}</span></span>`];
  if (state.vault && !onStart()) {
    const path = activePath();
    if (state.recording) items.push(`<button class="status-item warn" data-command="audioRecord">${icon('microphone')}<span>${h(t('recorder.recording'))}</span></button>`);
    if (path && isNote(path) && state.stats) {
      const st = state.stats;
      const goal = vaultPrefs().goals?.[path] ?? Number(index.meta(path)?.frontmatter?.goal) ?? 0;
      const pct = goal ? Math.min(100, Math.round((st.words / goal) * 100)) : 0;
      items.push(`<button class="status-item" data-command="right:backlinks" title="${h(t('panel.backlinks'))}">${icon('backlink')}<span>${index.backlinks(path).length}</span></button>`);
      items.push(`<button class="status-item" data-command="right:stats" title="${h(t('stats.words'))}">${icon('wordCount')}<span>${h(t('stat.wordsChars', { words: st.words.toLocaleString(), chars: st.chars.toLocaleString() }))}</span></button>`);
      items.push(`<span class="status-item" title="${h(t('stats.reading'))}">${icon('clock')}<span>${h(st.readingMinutes < 1 ? t('stats.lessMinute') : t('stats.minutes', { n: Math.round(st.readingMinutes) }))}</span></span>`);
      if (goal) items.push(`<button class="status-item" data-command="setGoal" title="${h(t('goal.title'))}"><span class="goal-mini"><span style="width:${pct}%"></span></span><span>${pct}%</span></button>`);
      const sel = state.selection;
      if (sel && sel.to > sel.from) items.push(`<span class="status-item">${icon('selectAll')}<span>${h(t('status.selection', { n: sel.to - sel.from }))}</span></span>`);
      if (sel) items.push(`<span class="status-item">${h(t('status.lineCol', { line: sel.line ?? 1, col: (sel.ch ?? 0) + 1 }))}</span>`);
      items.push(isDirty(path) ? `<span class="status-item warn" title="${h(t('doc.unsaved'))}">${icon('save')}<span>${h(t('doc.unsavedShort'))}</span></span>` : `<span class="status-item">${icon('check')}<span>${h(s.autosave ? t('status.autosave') : t('status.saved'))}</span></span>`);
    }
    const warn = state.problems.filter((p) => p.severity !== 'info').length;
    items.push(`<button class="status-item status-problems" data-command="showProblems" title="${h(t('action.showProblems'))}"><span class="sev-warning ${warn ? '' : 'zero'}">${icon('warning')}<b>${warn}</b></span></button>`);
    items.push(`<button class="status-item" data-command="left:files" title="${h(t('info.notes'))}">${icon('vault')}<span>${index.notePaths().length}</span></button>`);
  }
  items.push(`<span class="status-item">${icon('palette')}<span>${h(themeName(s.theme, getLanguage()))}</span></span>`);
  items.push(`<span class="status-item">${icon('globe')}<span>${h(t('status.language'))}</span></span>`);
  if (s.statusClock) items.push(`<span class="status-item clock">${icon('clock')}<span id="status-clock">${h(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span></span>`);
  bar.innerHTML = items.join('');
}

function renderAll() {
  const s = settings();
  root.classList.toggle('no-status', !s.showStatusBar);
  root.classList.toggle('no-left', !s.showLeftPanel);
  root.classList.toggle('no-right', !s.showRightPanel);
  root.classList.toggle('on-start', onStart());
  root.classList.toggle('no-bottom', !s.showBottomPanel);
  root.style.setProperty('--bottom-height', `${s.bottomHeight}px`);
  root.style.setProperty('--left-width', `${s.leftWidth}px`);
  root.style.setProperty('--right-width', `${s.rightWidth}px`);
  renderMenubar();
  if (toolbarLanguage !== getLanguage()) renderToolbar(); else renderToolbarState();
  const startHost = root.querySelector('#start-page');
  startHost.hidden = !onStart();
  root.querySelector('#workspace').hidden = onStart();
  if (!onStart()) { renderWorkspace(); renderLeft(); renderRight(); }
  renderBottom();
  renderStatus();
  if (onStart()) renderStartPage(); else { startCards?.destroy(); startCards = null; startBackground?.destroy(); startBackground = null; startHost.innerHTML = ''; }
  updateBackgroundState();
}

// ───────────────────────── start page and background

let startCards = null;
let startBackground = null;
function renderStartPage() {
  const host = root.querySelector('#start-page');
  if (!host || host.hidden) return;
  const scrollTop = host.querySelector('.start-scroll')?.scrollTop ?? 0;
  startCards?.destroy();
  host.innerHTML = startPageHtml({ state, settings, version: () => state.info?.version ?? VERSION, desktop, webSupport: webSupport() });
  startCards = startBoard(host.querySelector('.start-board'), { saved: settings().startLayout, reduced: Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches), onSave: (layout) => { state.settings.startLayout = layout; storeSettings(globalThis.localStorage, state.settings); } });
  host.querySelector('.start-scroll').scrollTop = scrollTop;
  for (const holder of host.querySelectorAll('.start-speed')) syncSliderSteps(holder);
  const canvas = host.querySelector('.start-bg');
  const carry = startBackground ? { time: startBackground.time, kind: startBackground.kind } : null;
  startBackground?.destroy();
  startBackground = new AnimatedBackground(canvas, { colors: backgroundColors, speed: () => settings().animationSpeed / 100, kind: settings().animation, vivid: true });
  if (carry && carry.kind === startBackground.kind) startBackground.time = carry.time;
  if (settings().backgroundKind === 'animated') startBackground.start(); else startBackground.draw();
  canvas.classList.toggle('static', settings().backgroundKind !== 'animated');
  host.querySelector('.start-scroll').style.setProperty('--start-image', state.backgroundUrl && settings().backgroundKind === 'image' ? `url("${state.backgroundUrl}")` : 'none');
  host.classList.toggle('with-image', Boolean(state.backgroundUrl) && settings().backgroundKind === 'image');
}

function syncSliderSteps(holder) {
  const input = holder?.querySelector('input[type="range"]');
  if (!input) return;
  for (const button of holder.querySelectorAll('[data-slider-step]')) button.disabled = Number(button.dataset.sliderStep) < 0 ? Number(input.value) <= Number(input.min) : Number(input.value) >= Number(input.max);
}

function showStartPage(show = true) { state.showStart = Boolean(show); renderAll(); if (!state.showStart) activeChanged(true); }
// The 시작 button is a toggle: start page ⇄ main window (an empty workspace when no vault is open).
function toggleStart() { return showStartPage(!onStart()); }

async function onStartAction(target) {
  const value = target.dataset.value;
  switch (target.dataset.start) {
    case 'open-vault': return openVaultFolder();
    case 'new-vault': return newVault();
    case 'browser-vaults': return browserVaults();
    case 'sample': return openSample(value);
    case 'open-recent': return openRecent(value, target.dataset.kind);
    case 'remove-recent': return forgetRecent(value);
    case 'clear-recent': return clearRecentAll();
    case 'arrange': return startCards?.arrange();
    case 'start-settings': return popups.open('settings', { tab: 'start' });
    case 'settings': return run('settings');
    case 'continue': return state.vault ? showStartPage(false) : value ? openRecent(value, target.dataset.kind) : openVaultFolder();
    case 'about': return run('about');
    case 'exit': return run('exit');
    case 'help-menu': return showMenu(menuItems(MENUS.help), anchorBelow(target), 'help');
    case 'tutorial': return startTutorial();
    case 'guide': return openDocWindow('guide');
    case 'tutorial-doc': return openDocWindow('tutorial');
    case 'animation': updateSettings({ animation: value, backgroundKind: 'animated' }); return notify('info', t('notice.animation', { name: t(`animation.${value}`) }));
    case 'shuffle': return shuffleBackground();
    case 'background-image': return chooseBackground();
    case 'template-cat': return updateSettings({ startTemplateCategory: value });
    case 'template': return noteFromLibrary(value);
    default: return undefined;
  }
}

/** Start page › 예제 양식: a new note from a built-in template in the open vault (else the most recent one). */
async function noteFromLibrary(id) {
  if (!state.vault) {
    // No vault open: the most recent one, else the "내 메모" vault (kept in the app's data folder / this browser).
    const last = state.recentVaults?.[0];
    if (last) await openRecent(last.path, last.kind).catch(() => {});
    if (!state.vault) {
      try {
        await beforeSwitch();
        const name = t('templates.vaultName');
        const vault = desktop ? await Vault.openDesktop(await native.invoke('notes_vault_dir', { name })) : (await loadWasm(), await Vault.openWeb(await Vault.browserVaultHandle(name, true), 'browser'));
        await useVault(vault);
      } catch (error) { showError('error.openVault', error, id); }
    }
    if (!state.vault) return notify('warning', t('templates.noVault'));
    notify('info', t('templates.needVault', { name: state.vault.name }));
  }
  const path = await features.newFromLibrary(id);
  if (path) { showStartPage(false); notify('success', t('templates.created', { name: nameOf(path) })); }
  return path;
}

function backgroundColors() { const theme = resolveTheme(settings().theme, prefersDark(), settings().customTheme); return { bg: theme.colors.bg, accent: theme.colors.accent, text: theme.colors.text, dark: theme.dark, danger: '#e5484d' }; }
function updateBackgroundState() {
  const s = settings();
  startBackground?.setKind(s.animation);
  if (onStart() && startBackground) { if (s.backgroundKind === 'animated') startBackground.start(); else { startBackground.stop(); startBackground.draw(); } } else startBackground?.stop();
}
let startBackgroundChangedAt = Date.now();
function randomAnimation(current) { const others = ANIMATIONS.filter((k) => k !== current); return others[Math.floor(Math.random() * others.length)]; }
function tickStartBackground() {
  const s = settings();
  const showing = onStart() && s.backgroundKind === 'animated' && s.animationInterval > 0 && !document.hidden && !tutorial?.state().active;
  if (!showing) { startBackgroundChangedAt = Date.now(); return; }
  if (Date.now() - startBackgroundChangedAt >= s.animationInterval * 1000) { startBackgroundChangedAt = Date.now(); updateSettings({ animation: randomAnimation(s.animation) }, { quiet: true }); startBackground?.setKind(settings().animation); }
}
function shuffleBackground() { const next = startBackground?.shuffle() ?? randomAnimation(settings().animation); updateSettings({ animation: next, backgroundKind: 'animated' }); notify('info', t('notice.animation', { name: t(`animation.${next}`) })); }
async function loadBackground() { try { state.backgroundUrl = await native.backgroundUrl(settings()); } catch (error) { state.backgroundUrl = null; showError('error.background', error); } if (onStart()) renderStartPage(); }
async function chooseBackground() {
  try {
    if (desktop) { const path = await native.chooseImage(settings().lastDirectory); if (path) { const stored = await withProgress('progress.background', fileNameOf(path.replace(/\\/g, '/')), (op) => native.importBackground(path, op)); updateSettings({ backgroundImage: stored, backgroundName: fileNameOf(path.replace(/\\/g, '/')), backgroundKind: 'image' }); await loadBackground(); } }
    else { const [file] = await native.pickWithInput('image/*'); if (file) { await native.storeWebBackground(file); updateSettings({ backgroundImage: `web:${file.name}:${Date.now()}`, backgroundName: file.name, backgroundKind: 'image' }); await loadBackground(); } }
  } catch (error) { showError('error.background', error); }
}
async function removeBackground() { await native.clearBackground(); state.backgroundUrl = null; updateSettings({ backgroundImage: null, backgroundName: '', backgroundKind: settings().backgroundKind === 'image' ? 'animated' : 'none' }); }

// ───────────────────────── settings, theme

function updateSettings(patch, { quiet = false } = {}) {
  const previous = state.settings;
  state.settings = { ...state.settings, ...patch };
  storeSettings(globalThis.localStorage, state.settings);
  if (quiet) return;
  applySettings(previous);
}

function applySettings(previous = {}) {
  const s = settings();
  const theme = resolveTheme(s.theme, prefersDark(), s.customTheme);
  applyTheme(theme);
  applyFont(s);
  native.setWindowTheme(theme.dark);
  const languageChanged = s.language !== getLanguage();
  if (languageChanged) {
    setLanguage(s.language);
    native.setBackendLanguage(s.language);
    if (previous.language) notify('info', t('notice.language'));
    toolbarLanguage = null;
    for (const view of views.values()) { view.editor?.refresh?.({ images: false }); view.build && view.updateHeader?.(); }
    aiPanel?.destroy(); aiPanel = null;
    localGraph?.destroy(); localGraph = null;
    const right = root.querySelector('#right-panel');
    if (right) right.innerHTML = '';
  }
  if (s.backgroundImage !== previous.backgroundImage) loadBackground();
  if (s.theme !== previous.theme && previous.theme) {
    notify('info', t('notice.theme', { name: themeName(s.theme, getLanguage()) }));
    for (const view of views.values()) if (view.preview) rerenderDiagrams(view.preview, { dark: theme.dark });
    localGraph?.refresh();
  }
  const es = editorSettings();
  for (const view of views.values()) { view.editor?.setSettings(es); if (view.preview) applyReadingLook(view.preview); view.renderProperties?.(); }
  if (previous.showStyleCheck !== s.showStyleCheck || previous.highlightSyntax !== s.highlightSyntax || previous.styleLanguage !== s.styleLanguage || previous.longSentence !== s.longSentence) refreshWriting();
  if (previous.codeWrap !== undefined && previous.codeWrap !== s.codeWrap) for (const view of views.values()) view.scheduleRender?.(0);
  renderAll();
  updateMinimumWidth();
}

async function openThemePicker(anchor) {
  const element = root.querySelector('.split-button [data-command="themeMenu"]')?.closest('.split-button') ?? root.querySelector('[data-command="themeMenu"]');
  const current = settings().theme;
  const handlers = {};
  const item = (theme, glyph = null) => { const id = `custom:theme:${theme.id ?? theme}`; handlers[id] = () => updateSettings({ theme: theme.id ?? theme }); return { id, label: themeName(theme.id ?? theme, lang()), icon: glyph ?? 'palette', swatch: theme.swatch ?? null, checked: current === (theme.id ?? theme) }; };
  handlers['custom:theme-edit'] = () => popups.open('settings', { tab: 'appearance', themeGroup: 'custom' });
  handlers['custom:theme-random'] = () => updateSettings({ theme: randomThemeId(current) });
  const items = [
    { columns: [[item(customTheme(settings().customTheme), 'palette')], [{ id: 'custom:theme-edit', label: t('theme.customSettings'), icon: 'gear' }]], row: true }, { separator: true },
    { columns: [DARK_THEMES.map((x) => item(x)), LIGHT_THEMES.map((x) => item(x))], heads: [t('theme.darkGroup', { count: DARK_THEMES.length }), t('theme.lightGroup', { count: LIGHT_THEMES.length })], headIcons: ['moon', 'sun'] },
    { separator: true }, { id: 'custom:theme-random', label: t('action.themeRandom'), icon: 'dice' },
  ];
  await showMenu(items, anchor ?? anchorBelow(element), 'theme', { handlers, header: { icon: 'palette', title: t('action.themeChoose') } });
}

function readingThemeMenu(anchor) {
  const handlers = {};
  const pick = (prefix, key, ids, glyph, label) => ids.map((id) => { handlers[`custom:${prefix}:${id}`] = () => updateSettings({ [key]: id }); return { id: `custom:${prefix}:${id}`, label: t(`${label}.${id}`), icon: glyph, checked: settings()[key] === id }; });
  const items = [...pick('rt', 'readingTheme', ['app', 'original', 'dark', 'creamy', 'solarized', 'contrast'], 'readingTheme', 'readingTheme'), { separator: true },
    ...pick('rf', 'readingFont', ['system', 'inter', 'open-sans', 'lora', 'roboto-slab', 'serif', 'mono'], 'font', 'readingFont'), { separator: true },
    ...pick('rp', 'readingPadding', ['compact', 'normal', 'roomy'], 'readableWidth', 'readingPadding')];
  return showMenu(items, anchor ?? anchorBelow(root.querySelector('#toolbar')), 'context', { handlers, header: { icon: 'readingTheme', title: t('view.readingTheme') } });
}

function exportMenu(anchor) {
  const handlers = {};
  const items = EXPORT_FORMATS.map(([id, glyph]) => { handlers[`custom:export:${id}`] = () => exportNote(id); return { id: `custom:export:${id}`, label: t(`export.${id}`), icon: glyph }; });
  items.push({ separator: true }, ...menuItems(['exportAgain', 'copyMarkdown', 'print']));
  return showMenu(items, anchor ?? anchorBelow(root.querySelector('[data-command="exportMenu"]') ?? root.querySelector('#toolbar')), 'context', { handlers, header: { icon: 'exportFile', title: t('action.export') } });
}

function aiMenu(anchor) {
  const handlers = { 'custom:ai:settings': () => popups.open('settings', { tab: 'ai' }) };
  const items = AI_ACTIONS.map((a) => { handlers[`custom:ai:${a.id}`] = () => aiAction(a.id); return { id: `custom:ai:${a.id}`, label: t(a.labelKey), icon: a.icon }; });
  items.push({ separator: true }, { id: 'custom:ai:settings', label: t('ai.settingsMenu'), icon: 'gear' });
  return showMenu(items, anchor ?? anchorBelow(root.querySelector('#toolbar')), 'context', { handlers, header: { icon: 'aiSpark', title: t('ai.actions') } });
}

function fileSortMenu(anchor) {
  const handlers = {};
  const current = vaultPrefs().sort ?? 'nameAsc';
  const items = P.SORT_ORDERS.map((id) => { handlers[`custom:sort:${id}`] = () => setVaultPrefs({ sort: id }); return { id: `custom:sort:${id}`, label: t(`sort.${id}`), icon: 'sortAsc', checked: id === current }; });
  items.push({ separator: true }, { id: 'custom:sort:folders', label: t('files.foldersFirst'), icon: 'folder', checked: vaultPrefs().foldersFirst !== false }, { id: 'custom:sort:ext', label: t('files.hideExtensions'), icon: 'markdownFile', checked: vaultPrefs().hideExtensions !== false });
  handlers['custom:sort:folders'] = () => setVaultPrefs({ foldersFirst: vaultPrefs().foldersFirst === false });
  handlers['custom:sort:ext'] = () => setVaultPrefs({ hideExtensions: vaultPrefs().hideExtensions === false });
  return showMenu(items, anchor ?? anchorBelow(root.querySelector('#left-panel')), 'context', { handlers, header: { icon: 'sortAsc', title: t('files.sort') } });
}

// ───────────────────────── progress, confirmation, clipboard

const progressJobs = [];
let progressSeq = 0;
async function withProgress(titleKey, name, task, { delay = 250, cancellable = false } = {}) {
  const op = `op-${Date.now().toString(36)}-${(progressSeq += 1)}`;
  let shown = false;
  let last = null;
  const signal = { cancelled: false };
  const job = { op, reopen: null };
  const show = (wait = 0) => { shown = true; popups.open('progress', { title: t(titleKey), name, op, last, cancellable, delay: wait }, { delay: wait }).then((r) => { if (r?.cancel) signal.cancelled = true; }); };
  job.reopen = () => show(0);
  progressJobs.push(job);
  let timer = null;
  if (desktop && !popups.useFrames) show(delay); else timer = setTimeout(() => show(0), delay);
  const unlisten = await native.listen('io-progress', (progress) => { if (progress.op !== op) return; last = progress; if (shown) popups.post('progress', { type: 'progress', ...progress }); });
  try {
    return await task(op, (progress) => { last = { op, done: Math.round((progress.fraction ?? 0) * 1000), total: 1000, text: progress.text ?? '' }; if (shown) popups.post('progress', { type: 'progress', ...last }); }, signal);
  } finally {
    clearTimeout(timer);
    unlisten();
    progressJobs.splice(progressJobs.indexOf(job), 1);
    if (shown || (desktop && !popups.useFrames)) {
      popups.post('progress', { type: 'done' });
      const outer = progressJobs.at(-1);
      setTimeout(() => { if (progressJobs.at(-1) !== outer) return; if (outer) outer.reopen(); else popups.hide('progress'); }, shown ? 400 : 0);
    }
  }
}

async function ask(params) { const result = await popups.open('confirm', params); return result?.choice ?? 'cancel'; }
async function requestExit() { if (desktop) return appWindow.close(); return undefined; }
async function confirmExit() {
  try { await saveAll(); persistLayout(); return true; } catch (error) {
    const choice = await ask({ kind: 'exit', icon: 'save', title: t('confirm.exitTitle'), message: t('confirm.saveFailed', { error: native.errorText(error) }), buttons: [{ id: 'cancel', label: t('common.cancel'), primary: true }, { id: 'discard', label: t('confirm.exitDiscard'), icon: 'exit', danger: true }] });
    return choice === 'discard';
  }
}

async function copyText(value) {
  try { await native.clipboardWrite(value); } catch { await navigator.clipboard?.writeText(value).catch(() => {}); }
  notify('success', t('notice.copiedText'));
}

// ───────────────────────── menus (popup windows)

const screenOffset = { x: 0, y: 0, measured: false };
function estimateOffset() { if (screenOffset.measured) return; const border = Math.max(0, (window.outerWidth - window.innerWidth) / 2); screenOffset.x = window.screenX + border; screenOffset.y = window.screenY + Math.max(0, window.outerHeight - window.innerHeight - border); }
window.addEventListener('pointermove', (event) => { if (!event.isTrusted) return; screenOffset.x = event.screenX - event.clientX; screenOffset.y = event.screenY - event.clientY; screenOffset.measured = true; }, { passive: true });
function toScreen(x, y) { if (popups.useFrames) return { x: window.screenX + x, y: window.screenY + y }; estimateOffset(); return { x: screenOffset.x + x, y: screenOffset.y + y }; }
function anchorBelow(element) { const rect = element.getBoundingClientRect(); const point = toScreen(rect.left, rect.bottom + 2); return { ...point, flipY: toScreen(rect.left, rect.top - 2).y }; }
const anchorAt = (event) => { const point = toScreen(event.clientX, event.clientY); return { x: point.x + 1, y: point.y + 1, flipY: point.y }; };

function menuItems(ids) {
  return ids.filter((id) => id === '-' || typeof id === 'object' || (commands[id] && !commands[id].hidden)).map((id) => (id === '-' ? { separator: true } : typeof id === 'object' ? {
    id: `submenu:${id.sub}`, label: t(`submenu.${id.sub}`), icon: SUBMENUS[id.sub].icon, submenu: true,
    disabled: !SUBMENUS[id.sub].items.some((item) => item !== '-' && commandEnabled(item)),
  } : { id, label: t(commands[id].label), icon: commands[id].icon, shortcut: commands[id].key ? keyLabel(commands[id].key) : '', disabled: !commandEnabled(id), checked: commands[id].checked?.() }));
}

function withChildren(items, depth = 0) {
  return items.map((item) => {
    if (!item.submenu || depth > 3) return item;
    if (item.children) return { ...item, children: withChildren(item.children, depth + 1) };
    const key = item.id.slice('submenu:'.length);
    return SUBMENUS[key] ? { ...item, children: withChildren(menuItems(SUBMENUS[key].items), depth + 1) } : item;
  });
}

async function showMenu(items, anchor, name = 'context', context = {}) {
  state.openMenu = name;
  renderMenubar();
  const header = context.header ?? (MENUS[name] ? { icon: MENU_ICONS[name], title: t(`menu.${name}`) } : { icon: 'markdownFile', title: 'MyMarkdownMaster' });
  const result = await popups.open('menu', { items: withChildren(items), name, header }, { anchor });
  if (state.openMenu === name) { state.openMenu = null; state.lastMenuClose = { name, at: Date.now() }; renderMenubar(); }
  const id = result?.id;
  if (!id) return undefined;
  if (id.startsWith('submenu:')) {
    const key = id.slice('submenu:'.length);
    if (!SUBMENUS[key]) return undefined;
    const at = result.at ?? anchor;
    return showMenu(menuItems(SUBMENUS[key].items), { x: at.x, y: at.y, flipY: at.flipY ?? at.y }, name, { ...context, header: { icon: SUBMENUS[key].icon, title: t(`submenu.${key}`) } });
  }
  await popups.whenHidden('menu');
  if (id.startsWith('custom:')) return context.handlers?.[id]?.();
  return run(id, context);
}

function openMenubarMenu(name) { const el = root.querySelector(`[data-menu="${name}"]`); if (el) showMenu(menuItems(MENUS[name]), anchorBelow(el), name); }

// ───────────────────────── Explorer tab (src/panels/explorer.js) and favorites
const explorer = createExplorer({
  desktop, native, settings: () => settings(), updateSettings: (patch, options) => updateSettings(patch, options),
  vault: () => state.vault, openFile: (path) => openFile(path), revealInVault: (path) => revealInTree(path), copyText: (text) => copyText(text),
  notify: (kind, text) => notify(kind, text), redraw: () => { if (settings().leftTab === 'explorer') renderLeft(); },
  async openVaultAt(dir, file = null) {
    await openRecent(dir, 'desktop');
    if (file && state.vault && index.has(file)) await openFile(file);
  },
});
/** A vault file or folder as a favorite: its absolute path on the desktop, "vault + path" on the web. */
const favoriteEntry = (path, dir) => (state.vault?.kind === 'desktop' && state.vault.root
  ? { path: `${String(state.vault.root).replace(/[\\/]+$/, '')}${String(state.vault.root).includes('\\') ? '\\' : '/'}${path.replace(/\//g, String(state.vault.root).includes('\\') ? '\\' : '/')}`.replace(/[\\/]+$/, ''), dir, name: fileNameOf(path) || state.vault.name }
  : { path, dir, name: fileNameOf(path) || state.vault?.name || path, vault: state.vault?.name ?? null });
function favoriteItem(path, dir) { const on = explorer.isFavorite(favoriteEntry(path, dir)); return { id: 'custom:favorite', label: t(on ? 'explorer.favoriteRemove' : 'explorer.favoriteAdd'), icon: on ? 'starOff' : 'star' }; }
function toggleVaultFavorite(path, dir) { const entry = favoriteEntry(path, dir); explorer.setFavorite(entry, !explorer.isFavorite(entry)); }

function fileMenu(event, path) {
  const folder = index.folders.has(path) && !index.files.has(path);
  const target = folder ? path : folderOf(path);
  const handlers = {
    'custom:print': async () => { await openFile(path); printNote(); },
    'custom:favorite': () => toggleVaultFavorite(path, folder),
    'custom:open': () => openFile(path), 'custom:newTab': () => openFile(path, { newTab: true }), 'custom:split': () => openFile(path, { split: 'row' }),
    'custom:newNote': () => features.newNote({ folder: target }), 'custom:newFolder': () => features.newFolder(target), 'custom:newCanvas': () => features.newCanvas(target),
    'custom:rename': () => features.rename(path), 'custom:move': () => features.move(path), 'custom:duplicate': () => features.duplicate(path), 'custom:delete': () => features.remove(path),
    'custom:bookmark': () => features.bookmark({ type: folder ? 'folder' : 'file', path }), 'custom:pin': () => togglePinned(path),
    'custom:copyPath': () => copyText(path), 'custom:copyLink': () => copyText(`[[${linkTextFor(path, '')}]]`), 'custom:reveal': () => state.vault.reveal(path),
    'custom:openDefault': async () => native.openExternal(await state.vault.absPath(path)), 'custom:search': () => searchFor(`path:"${path}"`),
  };
  const sysItems = desktop ? [{ id: 'custom:reveal', label: t('file.revealSystem'), icon: 'folderOpen' }, ...(folder ? [] : [{ id: 'custom:openDefault', label: t('file.openDefault'), icon: 'openFile' }])] : [];
  const items = folder ? [
    { id: 'custom:newNote', label: t('action.newNote'), icon: 'fileNew' }, { id: 'custom:newFolder', label: t('action.newFolder'), icon: 'folderAdd' }, { id: 'custom:newCanvas', label: t('action.newCanvas'), icon: 'canvasFile' }, { separator: true },
    { id: 'custom:search', label: t('files.searchIn'), icon: 'search' }, { id: 'custom:bookmark', label: t('bookmarks.add'), icon: 'bookmarkAdd' }, favoriteItem(path, true), { separator: true },
    { id: 'custom:rename', label: t('file.rename'), icon: 'edit' }, { id: 'custom:move', label: t('file.move'), icon: 'moveFolder' }, { id: 'custom:copyPath', label: t('file.copyPath'), icon: 'copy' }, ...sysItems, { separator: true },
    { id: 'custom:delete', label: t('file.delete'), icon: 'trash', danger: true },
  ] : [
    { id: 'custom:open', label: t('file.open'), icon: 'openFile' }, { id: 'custom:newTab', label: t('file.openNewTab'), icon: 'newTab' }, { id: 'custom:split', label: t('file.openSplit'), icon: 'splitRight' }, { separator: true },
    { id: 'custom:rename', label: t('file.rename'), icon: 'edit' }, { id: 'custom:move', label: t('file.move'), icon: 'moveFolder' }, { id: 'custom:duplicate', label: t('file.duplicate'), icon: 'duplicate' }, { separator: true },
    favoriteItem(path, false), { id: 'custom:bookmark', label: t('bookmarks.add'), icon: 'bookmarkAdd' }, { id: 'custom:pin', label: t('notes.pin'), icon: 'pin', checked: (vaultPrefs().pinned ?? []).includes(path) }, { id: 'custom:copyLink', label: t('file.copyLink'), icon: 'hyperlink' }, { id: 'custom:copyPath', label: t('file.copyPath'), icon: 'copy' },
    ...(isNote(path) ? [{ separator: true }, { id: 'custom:print', label: t('action.print'), icon: 'print' }] : []),
    ...(sysItems.length ? [{ separator: true }, ...sysItems] : []), { separator: true },
    { id: 'custom:delete', label: t('file.delete'), icon: 'trash', danger: true },
  ];
  return showMenu(items, anchorAt(event), 'context', { handlers, header: { icon: folder ? 'folder' : P.FILE_ICONS[kindOf(path)], title: fileNameOf(path) || state.vault.name } });
}

function tabMenu(event, tabId) {
  const tab = allTabs(state.layout).find((x) => x.id === tabId);
  if (!tab) return undefined;
  const leafId = leafOfTab(state.layout, tabId).id;
  const handlers = {
    'custom:close': () => closeTabById(tabId),
    'custom:others': () => { for (const x of leafOfTab(state.layout, tabId).tabs.filter((y) => y.id !== tabId && !y.pinned)) closeTabById(x.id); },
    'custom:pin': () => { tab.pinned = !tab.pinned; renderWorkspace(); },
    'custom:right': () => { moveTab(state.layout, tabId, leafId, { edge: 'right' }); renderWorkspace(); },
    'custom:down': () => { moveTab(state.layout, tabId, leafId, { edge: 'bottom' }); renderWorkspace(); },
    'custom:print': async () => { await openFile(tab.path); printNote(); },
    'custom:rename': () => features.rename(tab.path), 'custom:reveal': () => revealInTree(tab.path), 'custom:copyPath': () => copyText(tab.path ?? ''),
  };
  return showMenu([
    { id: 'custom:close', label: t('tab.close'), icon: 'closeTab' }, { id: 'custom:others', label: t('tab.closeOthers'), icon: 'closeAll' }, { id: 'custom:pin', label: t(tab.pinned ? 'tab.unpin' : 'tab.pin'), icon: 'pin' }, { separator: true },
    { id: 'custom:right', label: t('pane.moveRight'), icon: 'splitRight' }, { id: 'custom:down', label: t('pane.moveDown'), icon: 'splitDown' }, { separator: true },
    ...(tab.path && isNote(tab.path) ? [{ id: 'custom:print', label: t('action.print'), icon: 'print' }, { separator: true }] : []),
    { id: 'custom:rename', label: t('file.rename'), icon: 'edit', disabled: !tab.path }, { id: 'custom:reveal', label: t('file.revealTree'), icon: 'locate', disabled: !tab.path }, { id: 'custom:copyPath', label: t('file.copyPath'), icon: 'copy', disabled: !tab.path },
  ], anchorAt(event), 'context', { handlers, header: { icon: tabIcon(tab), title: tabTitle(tab) } });
}

function noteMenu(view, anchor) {
  const handlers = { 'custom:backlinks': () => showRightTab('backlinks'), 'custom:outline': () => showRightTab('outline') };
  return showMenu([...menuItems(['mode:live', 'mode:source', 'mode:reading', 'mode:split', '-', 'splitRight', 'splitDown', '-', 'renameFile', 'moveFile', 'duplicateFile', 'bookmarkActive', 'pinNote', '-', 'exportMenu', 'copyMarkdown', 'print', 'slides', 'readingPresentation', '-', 'recovery', 'deleteFile']), { separator: true }, { id: 'custom:backlinks', label: t('panel.backlinks'), icon: 'backlink' }, { id: 'custom:outline', label: t('panel.outline'), icon: 'structureTree' }], anchor, 'context', { handlers, header: { icon: 'markdownFile', title: nameOf(view.path) } });
}

function editorContextMenu(event, view, info = {}) {
  event.preventDefault();
  const e = view.editor;
  const sel = e?.getSelection()?.text ?? '';
  const handlers = {
    'custom:cut': async () => { await copyText(sel); e.replaceSelection(''); }, 'custom:copy': () => copyText(sel),
    'custom:paste': async () => { const value = await native.clipboardRead().catch(() => navigator.clipboard?.readText?.() ?? ''); if (value) e.insertText(value); },
    'custom:openLink': () => (info.link?.external ? native.openExternal(info.link.external) : followLink(info.link.target, info.link.subpath, view.path, {})),
    'custom:openLinkTab': () => followLink(info.link.target, info.link.subpath, view.path, { newTab: true }),
    'custom:search': () => searchFor(sel), 'custom:tag': () => searchFor(`tag:${info.tag}`),
  };
  const aiItems = sel ? AI_ACTIONS.filter((a) => a.needsSelection).slice(0, 12) : AI_ACTIONS.filter((a) => !a.needsSelection).slice(0, 10);
  for (const a of aiItems) handlers[`custom:ai:${a.id}`] = () => aiAction(a.id);
  return showMenu([
    ...(info.link ? [{ id: 'custom:openLink', label: t('editor.link.open'), icon: 'hyperlink' }, { id: 'custom:openLinkTab', label: t('file.openNewTab'), icon: 'newTab', disabled: Boolean(info.link.external) }, { separator: true }] : []),
    ...(info.tag ? [{ id: 'custom:tag', label: t('editor.searchTag', { tag: info.tag }), icon: 'tag' }, { separator: true }] : []),
    { id: 'custom:cut', label: t('action.cut'), icon: 'cut', disabled: !sel }, { id: 'custom:copy', label: t('action.copy'), icon: 'copy', disabled: !sel }, { id: 'custom:paste', label: t('action.paste'), icon: 'paste' },
    ...(sel ? [{ id: 'custom:search', label: t('editor.searchSelection'), icon: 'search' }] : []), { separator: true },
    ...menuItems(['bold', 'italic', 'highlight', 'strike', 'code', 'link', 'wikiLink']), { separator: true },
    ...menuItems([sub('headings'), sub('lists'), sub('tables'), 'callout', 'insertTemplate', '-', sub('composer')]), { separator: true },
    { id: 'submenu:ai', label: t('ai.actions'), icon: 'aiSpark', submenu: true, children: aiItems.map((a) => ({ id: `custom:ai:${a.id}`, label: t(a.labelKey), icon: a.icon })) },
  ], anchorAt(event), 'context', { handlers, header: { icon: 'editMode', title: nameOf(view.path) } });
}

function textContextMenu(element, event) {
  const handlers = {
    'custom:cut': () => { element.focus(); document.execCommand('cut'); }, 'custom:copy': () => { element.focus(); document.execCommand('copy'); },
    'custom:paste': async () => { element.focus(); const value = await native.clipboardRead().catch(() => ''); document.execCommand('insertText', false, value ?? ''); },
    'custom:selectAll': () => { element.focus(); element.select?.(); },
  };
  const hasSel = element.selectionStart !== element.selectionEnd;
  return showMenu([{ id: 'custom:cut', label: t('action.cut'), icon: 'cut', disabled: !hasSel }, { id: 'custom:copy', label: t('action.copy'), icon: 'copy', disabled: !hasSel }, { id: 'custom:paste', label: t('action.paste'), icon: 'paste' }, { separator: true }, { id: 'custom:selectAll', label: t('action.selectText'), icon: 'selectAll' }], anchorAt(event), 'context', { handlers, header: { icon: 'edit', title: t('menu.edit') } });
}

// ───────────────────────── documents (help windows)

async function openDocWindow(kind) {
  const info = DOC_KINDS[kind];
  if (!info) return undefined;
  popups.hideMenu();
  const url = `${location.pathname}?viewer=${kind}&lang=${getLanguage() === 'en' ? 'en' : 'ko'}`;
  if (popups.inline) {
    const key = docLabel(kind);
    let frame = popups.frames.get(key);
    if (!frame) { frame = document.createElement('div'); frame.className = `web-popup web-popup-doc web-popup-${key}`; frame.dataset.kind = key; frame.innerHTML = `<iframe title="${h(key)}" src="${h(url)}"></iframe>`; document.body.append(frame); popups.frames.set(key, frame); }
    return frame;
  }
  if (!desktop) { globalThis.open(url, `mymarkdown-${docLabel(kind)}`)?.focus?.(); return undefined; }
  const dark = resolveTheme(settings().theme, prefersDark(), settings().customTheme).dark;
  try { await native.invoke('open_doc_window', { kind, title: docWindowTitle(t(info.title)), width: info.width, height: info.height, dark }); } catch (error) { showError('error.docWindow', error); }
  return undefined;
}
function closeDocFrames() { for (const kind of Object.keys(DOC_KINDS)) if (popups.frames.has(docLabel(kind))) popups.close(docLabel(kind)); }

// ───────────────────────── drag & drop (files from the system)

function setDropActive(active) { if (state.dropActive === active) return; state.dropActive = active; root.classList.toggle('drop-active', active); }

async function handleDroppedPaths(paths, point = null) {
  if (!paths.length) return;
  const norm = paths.map((p) => p.replace(/\\/g, '/'));
  // A folder: open it as a vault. Files already in the vault: open them. Others: copy into the vault (attachments).
  if (norm.length === 1 && !/\.[a-z0-9]{1,6}$/i.test(norm[0])) { await openVaultFolder(paths[0]); return; }
  if (!state.vault) { await openVaultFolder(paths[0].replace(/[\\/][^\\/]+$/, '')); return; }
  const rootPath = state.vault.root.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const inside = norm.filter((p) => rootPath && p.toLowerCase().startsWith(`${rootPath}/`));
  for (const p of inside) await openFile(p.slice(rootPath.length + 1), { newTab: true });
  const outside = paths.filter((p, i) => !inside.includes(norm[i]));
  if (!outside.length) return;
  const files = await Promise.all(outside.map(async (p) => new File([Uint8Array.from(atob(await native.readBase64File(p)), (c) => c.charCodeAt(0))], fileNameOf(p.replace(/\\/g, '/')))));
  // Dropped on a note editor: the links go where the pointer was (the desktop drop gives physical pixels).
  const at = point ? noteEditorAt(point.x / (window.devicePixelRatio || 1), point.y / (window.devicePixelRatio || 1)) : null;
  const view = at?.view ?? activeNoteView();
  if (view) await pasteFiles(view, files, at?.pos);
  else { await features.saveAttachments(files, activePath() ?? ''); notify('success', t('drop.copied', { n: files.length })); }
}

// ───────────────────────── events

function bindShellEvents() {
  root.querySelectorAll('[data-split="left"], [data-split="right"]').forEach((splitter) => splitter.addEventListener('pointerdown', (event) => {
    const side = splitter.dataset.split;
    if ((side === 'left' && !settings().showLeftPanel) || (side === 'right' && !settings().showRightPanel)) return;
    event.preventDefault();
    const key = side === 'left' ? 'leftWidth' : 'rightWidth';
    const startWidth = settings()[key];
    pointerDrag(event, {
      cursor: 'col-resize',
      move: (dx) => { const width = Math.max(220, Math.min(900, startWidth + (side === 'left' ? dx : -dx))); root.style.setProperty(side === 'left' ? '--left-width' : '--right-width', `${width}px`); state.settings[key] = width; },
      end: (e, moved) => { if (moved) { updateSettings({ [key]: settings()[key] }, { quiet: true }); fitToolbar(); localGraph?.resize?.(); } },
    });
  }));
  root.querySelector('[data-split="bottom"]')?.addEventListener('pointerdown', (event) => {
    if (!settings().showBottomPanel) return;
    event.preventDefault();
    const startH = settings().bottomHeight;
    pointerDrag(event, { cursor: 'row-resize', move: (dx, dy) => { const hgt = Math.max(PANEL_MIN.bottom, Math.min(window.innerHeight * 0.6, startH - dy)); root.style.setProperty('--bottom-height', `${hgt}px`); state.settings.bottomHeight = Math.round(hgt); }, end: (e, moved) => { if (moved) updateSettings({ bottomHeight: settings().bottomHeight }, { quiet: true }); } });
  });
  root.querySelector('#menubar')?.addEventListener('mousedown', (event) => {
    if (!desktop || event.button !== 0 || !event.target.closest?.('[data-window-drag]')) return;
    event.preventDefault();
    if (event.detail === 2) appWindow?.toggleMaximize().catch(() => {}); else native.invoke('window_drag', {}).catch(() => {});
  });
  root.querySelector('[data-resize-grip]')?.addEventListener('pointerdown', (event) => { if (event.button !== 0) return; event.preventDefault(); native.invoke('window_drag', { edge: 'SouthEast' }).catch(() => appWindow?.startResizeDragging('SouthEast').catch(() => {})); });
  bindSplitters(root.querySelector('#workspace'), () => state.layout, { onChange: (redraw) => { layoutChanged(); if (redraw) renderWorkspace(); }, onResize: frameThrottle(() => { for (const v of views.values()) v.editor?.view?.requestMeasure(); }) });
}

function bindEvents() {
  root.addEventListener('mm-show-properties', () => showRightTab('properties'));
  root.addEventListener('click', (event) => {
    const target = event.target;
    const menu = target.closest('[data-menu]');
    if (menu) { const name = menu.dataset.menu; if (state.lastMenuClose.name === name && Date.now() - state.lastMenuClose.at < 300) return undefined; return openMenubarMenu(name); }
    if (target.closest('[data-home]')) return toggleStart();
    const start = target.closest('[data-start]');
    if (start && !start.disabled) return onStartAction(start);
    if (target.closest('[data-toolbar-more]')) return showToolbarMore(target.closest('[data-toolbar-more]'));
    if (target.closest('.cm-editor, .cv-host, .graph-view, .ai-panel, .markdown-rendered')) return undefined;
    const command = target.closest('[data-command]');
    if (command && !command.disabled) { const id = command.dataset.command; const anchored = ['themeMenu', 'exportMenu', 'aiMenu', 'fileSort', 'readingThemeMenu'].includes(id); return run(id, { anchor: anchored ? anchorBelow(command.closest('.split-button') ?? command) : undefined }); }
    const windowControl = target.closest('[data-window]');
    if (windowControl) return windowButton(windowControl.dataset.window);
    const leftTab = target.closest('[data-left-tab]');
    if (leftTab) return updateSettings({ leftTab: leftTab.dataset.leftTab, showLeftPanel: true });
    const rightTab = target.closest('[data-right-tab]');
    if (rightTab) return updateSettings({ rightTab: rightTab.dataset.rightTab, showRightPanel: true });
    const bottomTab = target.closest('[data-bottom-tab]');
    if (bottomTab) return updateSettings({ bottomTab: bottomTab.dataset.bottomTab, showBottomPanel: true });
    // workspace
    const tabClose = target.closest('[data-tab-close]');
    if (tabClose) { event.stopPropagation(); return closeTabById(tabClose.dataset.tabClose); }
    const unpin = target.closest('[data-tab-unpin]');
    if (unpin) { const tab = allTabs(state.layout).find((x) => x.id === unpin.dataset.tabUnpin); if (tab) { tab.pinned = false; renderWorkspace(); } return undefined; }
    const tabEl = target.closest('.ws-tab');
    if (tabEl) { const leaf = leafOfTab(state.layout, tabEl.dataset.tab); leaf.active = leaf.tabs.findIndex((x) => x.id === tabEl.dataset.tab); state.layout.active = leaf.id; renderWorkspace(); activeChanged(); views.get(tabEl.dataset.tab)?.focus?.(); return undefined; }
    if (target.closest('#left-panel .left-explorer') && explorer.click(target)) return undefined;
    const leafStep = target.closest('[data-leaf-step]');
    if (leafStep) { if (!leafStep.disabled) stepTab(leafStep.dataset.leaf, Number(leafStep.dataset.leafStep)); return undefined; }
    const leafNew = target.closest('[data-leaf-new]');
    if (leafNew) { state.layout.active = leafNew.dataset.leafNew; openTab(state.layout, newTab({ kind: 'empty' }), { newTab: true }); renderWorkspace(); activeChanged(); return undefined; }
    const leafSplit = target.closest('[data-leaf-split]');
    if (leafSplit) { state.layout.active = leafSplit.dataset.leafSplit; return splitActive(leafSplit.dataset.dir); }
    const leafMenu = target.closest('[data-leaf-menu]');
    if (leafMenu) { state.layout.active = leafMenu.dataset.leafMenu; return showMenu(menuItems(SUBMENUS.panes.items), anchorBelow(leafMenu)); }
    const leafEl = target.closest('.ws-leaf');
    if (leafEl && state.layout.active !== leafEl.dataset.leaf) { state.layout.active = leafEl.dataset.leaf; for (const el of root.querySelectorAll('.ws-leaf')) el.classList.toggle('is-active', el === leafEl); activeChanged(); }
    // panels
    const folder = target.closest('[data-tree-folder]');
    if (folder) { const path = folder.dataset.treeFolder; const set = new Set(vaultPrefs().expanded ?? []); if (set.has(path)) set.delete(path); else set.add(path); setVaultPrefs({ expanded: [...set] }); return undefined; }
    const file = target.closest('[data-tree-file]');
    if (file) return openFile(file.dataset.treeFile, { newTab: event.ctrlKey || event.metaKey, focus: false });
    const open = target.closest('[data-open-path]');
    if (open) return openFile(open.dataset.openPath, { newTab: event.ctrlKey || event.metaKey, line: open.dataset.line != null ? Number(open.dataset.line) : null, col: Number(open.dataset.col ?? 0), len: Number(open.dataset.len ?? 0) });
    const create = target.closest('[data-create-note]');
    if (create) return createFromLink(create.dataset.createNote);
    const outlineFold = target.closest('[data-outline-fold]');
    if (outlineFold) { const key = `${activePath()}:${outlineFold.dataset.outlineFold}`; const set = new Set(state.outlineFolded); if (set.has(key)) set.delete(key); else set.add(key); state.outlineFolded = [...set]; return renderRight(); }
    const gotoLine = target.closest('[data-goto-line]');
    if (gotoLine) { activeNoteView()?.revealLine(Number(gotoLine.dataset.gotoLine), { select: false }); return undefined; }
    const tagToggle = target.closest('[data-tag-toggle]');
    if (tagToggle) { const set = new Set(vaultPrefs().openTags ?? []); const k = tagToggle.dataset.tagToggle; if (set.has(k)) set.delete(k); else set.add(k); return setVaultPrefs({ openTags: [...set] }); }
    const tagSearch = target.closest('[data-tag-search]');
    if (tagSearch) return searchFor(`tag:${tagSearch.dataset.tagSearch}`);
    const bookmarkRemove = target.closest('[data-bookmark-remove]');
    if (bookmarkRemove) { const list = [...(vaultPrefs().bookmarks ?? [])]; list.splice(Number(bookmarkRemove.dataset.bookmarkRemove), 1); return setVaultPrefs({ bookmarks: list }); }
    const bookmark = target.closest('[data-bookmark]');
    if (bookmark) { const b = vaultPrefs().bookmarks?.[Number(bookmark.dataset.bookmark)]; if (!b) return undefined; if (b.type === 'search') return searchFor(b.query); if (b.type === 'folder') return revealInTree(b.path); return openFile(b.path, { subpath: b.subpath, newTab: event.ctrlKey || event.metaKey }); }
    const noteFilter = target.closest('[data-note-filter]');
    if (noteFilter) { state.noteFilter = noteFilter.dataset.noteFilter; return renderLeft(); }
    const searchInsert = target.closest('[data-search-insert]');
    if (searchInsert) { const input = root.querySelector('[data-search-input]'); input.value = `${input.value}${input.value && !input.value.endsWith(' ') ? ' ' : ''}${searchInsert.dataset.searchInsert}`; input.focus(); return runSearch(input.value); }
    if (target.closest('[data-search-collapse]')) { state.search.collapsed = !state.search.collapsed; return renderLeft(); }
    const searchProperty = target.closest('[data-search-property]');
    if (searchProperty) return searchFor(`[${searchProperty.dataset.searchProperty}]`);
    const linkMention = target.closest('[data-link-mention]');
    if (linkMention) { event.stopPropagation(); return linkMentions(linkMention.dataset.linkMention); }
    const propRemove = target.closest('[data-prop-remove]');
    if (propRemove) return setPropertyOf(propRemove.dataset.propPath, propRemove.dataset.propRemove, null);
    const propAdd = target.closest('[data-prop-add]');
    if (propAdd) return addProperty(propAdd.dataset.propAdd);
    const problemRow = target.closest('[data-problem]');
    if (problemRow) { const p = state.problems[Number(problemRow.dataset.problem)]; if (p?.path) return openFile(p.path, { line: p.line, col: p.col ?? 0, len: p.len ?? 0 }); return undefined; }
    const styleKind = target.closest('[data-style-kind]');
    if (styleKind) { const issue = state.styleIssues.find((i) => i.kind === styleKind.dataset.styleKind); if (issue) activeNoteView()?.revealLine(issue.line, { col: issue.col, len: issue.len }); return undefined; }
    return undefined;
  });

  root.addEventListener('auxclick', (event) => { const tabEl = event.target.closest('.ws-tab'); if (event.button === 1 && tabEl) { event.preventDefault(); closeTabById(tabEl.dataset.tab); } });
  root.addEventListener('dblclick', (event) => { if (event.target.closest('#left-panel .left-explorer') && explorer.dblclick(event.target)) return; const tabs = event.target.closest('.ws-tabs'); if (tabs && !event.target.closest('.ws-tab, button')) { state.layout.active = tabs.closest('.ws-leaf').dataset.leaf; openTab(state.layout, newTab({ kind: 'empty' }), { newTab: true }); renderWorkspace(); } });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if ('searchInput' in target.dataset) return runSearch(target.value);
    if ('fileFilter' in target.dataset) { state.fileFilter = target.value; return renderLeft(); }
    if ('noteQuery' in target.dataset) { state.noteQuery = target.value; return renderLeft(); }
    if ('startSpeed' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}%`; state.settings.animationSpeed = Number(target.value); }
    if ('startOpacity' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}%`; root.querySelector('.start-inner')?.style.setProperty('--start-card-alpha', `${target.value}%`); }
    if (target.matches?.('.start-speed input[type="range"]')) syncSliderSteps(target.parentElement);
    return undefined;
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if ('propKey' in target.dataset) { const type = target.dataset.propType; const value = type === 'checkbox' ? target.checked : type === 'number' ? Number(target.value) : type === 'list' ? target.value.split(',').map((x) => x.trim()).filter(Boolean) : target.value; return setPropertyOf(target.dataset.propPath, target.dataset.propKey, value); }
    if ('searchOpt' in target.dataset) { state.search[target.dataset.searchOpt] = target.checked; renderLeft(); return runSearch(); }
    if ('searchSort' in target.dataset) { state.search.sort = target.value; return renderLeft(); }
    if ('tagSort' in target.dataset) return setVaultPrefs({ tagSort: target.value });
    if ('goalInput' in target.dataset) { const path = activePath(); setVaultPrefs({ goals: { ...(vaultPrefs().goals ?? {}), [path]: Number(target.value) || 0 } }); return renderStatus(); }
    if ('startToggle' in target.dataset) return updateSettings({ showStartPage: target.checked }, { quiet: true });
    if ('startSpeed' in target.dataset) return updateSettings({ animationSpeed: Number(target.value) }, { quiet: true });
    if ('startOpacity' in target.dataset) return updateSettings({ startCardOpacity: Number(target.value) }, { quiet: true });
    if ('startRandom' in target.dataset) return updateSettings({ animationRandom: target.checked }, { quiet: true });
    if ('startInterval' in target.dataset) { startBackgroundChangedAt = Date.now(); return updateSettings({ animationInterval: Number(target.value) }, { quiet: true }); }
    return undefined;
  });

  const sliderStep = (button) => {
    const input = button.parentElement.querySelector('input[type="range"]');
    if (!input) return false;
    const before = input.value;
    input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value) + Number(button.dataset.sliderStep) * Number(input.step || 1))));
    if (input.value === before) return false;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };

  root.addEventListener('pointerdown', (event) => {
    const step = event.target.closest?.('[data-slider-step]');
    if (step && event.button === 0 && !step.disabled) {
      event.preventDefault();
      if (!sliderStep(step)) return;
      let timer = setTimeout(function again() { if (sliderStep(step)) timer = setTimeout(again, 90); }, 420);
      const stop = () => { clearTimeout(timer); window.removeEventListener('pointerup', stop, true); };
      window.addEventListener('pointerup', stop, true);
      return;
    }
    // Pointer drags (HTML5 drag-and-drop does not reach a Tauri page on Windows): tabs and tree rows.
    const tabEl = event.target.closest?.('.ws-tab');
    if (tabEl && event.button === 0 && !event.target.closest('button')) { dragTab(event, tabEl); return; }
    const row = event.target.closest?.('.tree-row[data-tree-path]');
    if (row && event.button === 0) dragTreeItem(event, row);
  });

  root.addEventListener('contextmenu', (event) => {
    if (event.target.closest('.cm-editor, .cv-host, .graph-view')) return undefined;
    const editable = event.target.closest('input:not([type="range"]):not([type="checkbox"]), textarea');
    if (editable) { event.preventDefault(); return textContextMenu(editable, event); }
    event.preventDefault();
    const xpMenu = event.target.closest('#left-panel .left-explorer') ? explorer.menu(event.target) : null;
    if (xpMenu) return showMenu(xpMenu.items, anchorAt(event), 'context', { handlers: xpMenu.handlers, header: xpMenu.header });
    const treeRow = event.target.closest('[data-tree-path]');
    if (treeRow) return fileMenu(event, treeRow.dataset.treePath);
    const openRow = event.target.closest('[data-open-path]');
    if (openRow) return fileMenu(event, openRow.dataset.openPath);
    const tabEl = event.target.closest('.ws-tab');
    if (tabEl) return tabMenu(event, tabEl.dataset.tab);
    if (event.target.closest('.tree, .left-files')) return showMenu(menuItems(['newNote', 'newFolder', 'newCanvas', '-', 'fileSort', 'collapseAll', '-', 'print']), anchorAt(event), 'context', { header: { icon: 'vault', title: state.vault?.name ?? '' } });
    if (event.target.closest('.note-preview')) {
      const sel = window.getSelection?.().toString() ?? '';
      return showMenu([{ id: 'custom:copy', label: t('action.copy'), icon: 'copy', disabled: !sel }, { separator: true }, ...menuItems(['mode:live', 'mode:source', 'mode:split', '-', 'exportMenu', 'copyMarkdown', 'print', 'slides'])], anchorAt(event), 'context', { handlers: { 'custom:copy': () => copyText(sel) }, header: { icon: 'preview', title: t('mode.reading') } });
    }
    if (event.target.closest('#bottom-panel')) return showMenu(menuItems(['showProblems', 'showMessages', 'clearMessages', '-', 'bottomPanel']), anchorAt(event), 'context', { header: { icon: 'panelBottom', title: t('bottom.title') } });
    if (event.target.closest('#start-page')) return showMenu(menuItems(['openVault', 'newVault', 'browserVaults', '-', 'shuffleBackground', 'backgroundImage', '-', 'tutorial', 'about']), anchorAt(event), 'context', { header: { icon: 'home', title: t('action.startPage') } });
    if (event.target.closest('#statusbar')) return showMenu(menuItems(['statusBar', 'showProblems', '-', 'theme', 'language']), anchorAt(event), 'context', { header: { icon: 'statusBar', title: t('action.statusBar') } });
    return showMenu(menuItems(['newNote', 'quickSwitcher', 'commandPalette', '-', 'print', '-', 'leftPanel', 'rightPanel', 'bottomPanel', 'statusBar', '-', 'settings', 'about']), anchorAt(event), 'context', { header: { icon: 'markdownFile', title: 'MyMarkdownMaster' } });
  });

  window.addEventListener('resize', frameThrottle(() => { fitToolbar(); if (desktop && state.minWidth && window.innerWidth < state.minWidth - 1) native.setMinimumSize(state.minWidth, 600).catch(() => {}); }));
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) { const previous = state.settings; state.settings = loadSettings(globalThis.localStorage); applySettings(previous); aiPanel?.refresh(); }
    else if (event.key === RECENT_KEY) { state.recentVaults = loadJson(RECENT_KEY, []); if (onStart()) renderStartPage(); }
  });
  window.addEventListener('beforeunload', (event) => { persistLayout(); if (!desktop && anyDirty()) { saveAll(); event.preventDefault(); event.returnValue = ''; } });
  if (!desktop) {
    let depth = 0;
    const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');
    document.addEventListener('dragenter', (event) => { if (hasFiles(event)) { depth += 1; setDropActive(true); event.preventDefault(); } });
    document.addEventListener('dragover', (event) => { if (hasFiles(event)) event.preventDefault(); });
    document.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) setDropActive(false); });
    document.addEventListener('drop', async (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault(); depth = 0; setDropActive(false);
      const files = [...(event.dataTransfer?.files ?? [])];
      if (!files.length || !state.vault || event.target.closest?.('.cm-editor')) return;
      const view = activeNoteView();
      if (view) await pasteFiles(view, files); else { await features.saveAttachments(files, activePath() ?? ''); notify('success', t('drop.copied', { n: files.length })); }
    });
  }
  setInterval(() => { const clock = root.querySelector('#status-clock'); if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 15000);
  // File recovery: a snapshot of each edited note every few minutes (the interval is checked by the vault).
  setInterval(() => { for (const [path, d] of docs) if (d.text !== d.lastSnap) { d.lastSnap = d.text; snapshotNow(path).catch(() => {}); } }, 60000);
}

/** A tab dragged with the pointer: along its strip, into another pane, or to a pane's edge (a new split). */
function dragTab(event, tabEl) {
  const tabId = tabEl.dataset.tab;
  let ghost = null;
  let target = null;
  const marker = document.createElement('div');
  marker.className = 'ws-drop-marker';
  pointerDrag(event, {
    threshold: 6,
    move: (dx, dy, e) => {
      if (!ghost) { ghost = tabEl.cloneNode(true); ghost.classList.add('ws-tab-ghost'); document.body.append(ghost, marker); }
      ghost.style.transform = `translate(${e.clientX + 8}px, ${e.clientY + 8}px)`;
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const strip = under?.closest('.ws-tabs');
      const body = under?.closest('.ws-leaf-body');
      target = null;
      marker.hidden = true;
      if (strip) {
        const leafId = strip.closest('.ws-leaf').dataset.leaf;
        const tabEls = [...strip.querySelectorAll('.ws-tab')];
        let i = tabEls.findIndex((el) => { const r = el.getBoundingClientRect(); return e.clientX < r.left + r.width / 2; });
        if (i < 0) i = tabEls.length;
        target = { leafId, index: i };
        const ref = tabEls[i] ?? tabEls.at(-1);
        const r = ref?.getBoundingClientRect() ?? strip.getBoundingClientRect();
        Object.assign(marker.style, { left: `${(tabEls[i] ? r.left : r.right) - 1}px`, top: `${r.top}px`, width: '3px', height: `${r.height}px` });
        marker.hidden = false;
      } else if (body) {
        const leafId = body.closest('.ws-leaf').dataset.leaf;
        const r = body.getBoundingClientRect();
        const zone = dropZone(r, e.clientX, e.clientY);
        target = { leafId, edge: zone };
        const box = zone === 'center' ? r : { left: zone === 'right' ? r.left + r.width / 2 : r.left, top: zone === 'bottom' ? r.top + r.height / 2 : r.top, width: zone === 'left' || zone === 'right' ? r.width / 2 : r.width, height: zone === 'top' || zone === 'bottom' ? r.height / 2 : r.height };
        Object.assign(marker.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
        marker.hidden = false;
      }
    },
    end: (e, moved) => {
      ghost?.remove(); marker.remove();
      if (!moved || !target) return;
      moveTab(state.layout, tabId, target.leafId, target.edge ? { edge: target.edge === 'center' ? null : target.edge } : { index: target.index });
      renderWorkspace();
      activeChanged();
    },
  });
}

/** A file or folder dragged from the tree: onto a folder (move), onto a pane (open there), into an editor (a link). */
function dragTreeItem(event, row) {
  const path = row.dataset.treePath;
  let ghost = null;
  pointerDrag(event, {
    threshold: 6,
    move: (dx, dy, e) => {
      if (!ghost) { ghost = document.createElement('div'); ghost.className = 'tree-ghost'; ghost.innerHTML = `${P.fileIcon(path)}<span>${h(fileNameOf(path))}</span>`; document.body.append(ghost); }
      ghost.style.transform = `translate(${e.clientX + 10}px, ${e.clientY + 6}px)`;
      for (const el of root.querySelectorAll('.drop-target')) el.classList.remove('drop-target');
      const under = document.elementFromPoint(e.clientX, e.clientY);
      (under?.closest('.tree-folder') ?? under?.closest('.ws-leaf-body'))?.classList.add('drop-target');
    },
    end: async (e, moved) => {
      ghost?.remove();
      for (const el of root.querySelectorAll('.drop-target')) el.classList.remove('drop-target');
      if (!moved) return;
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const folder = under?.closest('.tree-folder');
      if (folder) { if (folder.dataset.treeFolder !== path && !folder.dataset.treeFolder.startsWith(`${path}/`) && folderOf(path) !== folder.dataset.treeFolder) await features.moveTo(path, `${folder.dataset.treeFolder}/${fileNameOf(path)}`); return; }
      if (under?.closest('.tree')) { if (folderOf(path)) await features.moveTo(path, fileNameOf(path)); return; }
      if (under?.closest('.cm-editor')) { const at = noteEditorAt(e.clientX, e.clientY); const view = at?.view ?? activeNoteView(); if (view?.editor) view.editor.insertText(kindOf(path) === 'image' ? `![[${linkTextFor(path, view.path)}]]` : `[[${linkTextFor(path, view.path)}]]`, at?.pos); return; }
      const body = under?.closest('.ws-leaf-body');
      if (body && index.files.has(path)) {
        state.layout.active = body.closest('.ws-leaf').dataset.leaf;
        const zone = dropZone(body.getBoundingClientRect(), e.clientX, e.clientY);
        await openFile(path, zone === 'center' ? { newTab: true } : { split: zone === 'left' || zone === 'right' ? 'row' : 'column' });
      }
    },
  });
}

async function linkMentions(from) {
  const path = activePath();
  if (!path) return;
  const link = linkTextFor(path, from);
  const words = [nameOf(path), ...(index.meta(path)?.aliases ?? [])].sort((a, b) => b.length - a.length);
  const re = new RegExp(`(^|[^\\p{L}\\p{N}\\[|])(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=$|[^\\p{L}\\p{N}\\]])`, 'giu');
  const text = await readText(from);
  let fence = false;
  const next = text.split('\n').map((line) => { if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return line; } return fence ? line : line.replace(re, (m, pre, word) => `${pre}[[${link}${word === link ? '' : `|${word}`}]]`); }).join('\n');
  if (next === text) return;
  if (docs.get(from)) updateText(from, next); else { await writeText(from, next); await core('setText', { path: from, text: next }); }
  state.unlinked = null;
  await indexChanged();
  notify('success', t('backlinks.linkedDone', { name: nameOf(from) }));
}

async function setPropertyOf(path, key, value) {
  if (!path) return;
  const d = docs.get(path) ?? await loadDoc(path);
  updateText(path, await core('setProperty', { text: d.text, key, value }));
  for (const view of views.values()) if (view.path === path) view.scheduleRender?.(0);
}

async function addProperty(path) {
  const props = index.properties();
  const item = await openSuggest({ placeholder: t('props.addPlaceholder'), icon: 'docProperties', items: (q) => props.map((p) => ({ id: p.key, label: p.key, icon: P.PROP_ICONS[p.type] ?? 'editorText', positions: fuzzy(q, p.key) })).filter((x) => x.positions), allowCreate: (q) => (q.trim() && !props.some((p) => p.key === q.trim()) ? { id: q.trim(), label: t('props.create', { name: q.trim() }), icon: 'plus' } : null) });
  if (!item) return;
  const type = props.find((p) => p.key === item.id)?.type;
  await setPropertyOf(path, item.id, type === 'list' ? [] : type === 'checkbox' ? false : type === 'number' ? 0 : type === 'date' ? new Date().toISOString().slice(0, 10) : '');
}

/** Ctrl+key: [key, shift, alt, command]. */
const SHORTCUTS = [
  ['n', false, false, 'newNote'], ['n', true, false, 'newNoteTab'], ['o', false, false, 'quickSwitcher'], ['o', true, false, 'openVault'], ['p', false, false, 'commandPalette'], ['p', true, false, 'print'],
  ['s', false, false, 'save'], ['s', false, true, 'saveAll'], ['e', false, false, 'toggleReading'], ['e', false, true, 'exportAgain'], ['w', false, false, 'closeTab'], ['f', true, false, 'searchVault'],
  ['g', false, false, 'graphView'], ['\\', false, false, 'splitRight'], ['\\', true, false, 'splitDown'], ['|', true, false, 'splitDown'], [',', false, false, 'settings'], ['l', true, false, 'language'],
  ['!', true, false, 'leftPanel'], ['1', true, false, 'leftPanel'], ['@', true, false, 'rightPanel'], ['2', true, false, 'rightPanel'], ['j', false, false, 'bottomPanel'], ['a', true, false, 'aiPanel'],
  ['h', true, false, 'startPage'], ['b', true, false, 'shuffleBackground'], ['=', false, false, 'zoomIn'], ['+', false, false, 'zoomIn'], ['-', false, false, 'zoomOut'], ['0', false, false, 'zoomReset'],
  ['1', false, false, 'mode:live'], ['2', false, false, 'mode:source'], ['3', false, false, 'mode:reading'], ['4', false, false, 'mode:split'], ['tab', false, false, 'nextTab'], ['tab', true, false, 'prevTab'],
  ['q', false, false, 'exit'],
];

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  if (tutorial?.active && key === 'escape') { event.preventDefault(); tutorial.stop(); return; }
  if (paletteOpen() || event.isComposing) return;
  const inEditor = Boolean(event.target.closest?.('.cm-editor'));
  const inCanvas = Boolean(event.target.closest?.('.cv-host'));
  const editing = !inEditor && event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = event.ctrlKey || event.metaKey;
  if (event.altKey && !mod) {
    if (key === 'arrowleft') { event.preventDefault(); run('goBack'); return; }
    if (key === 'arrowright') { event.preventDefault(); run('goForward'); return; }
    if (key === 'd' && !editing) { event.preventDefault(); run('dailyNote'); return; }
    if (key === 't' && inEditor) { event.preventDefault(); run('insertTemplate'); return; }
  }
  if (mod) {
    if (editing && ['x', 'c', 'v', 'z', 'y', 'a'].includes(key)) return;
    if (inCanvas && ['z', 'y', 'c', 'v', 'x', 'a', 'd'].includes(key)) return;
    // The editor's own keys win (formatting, headings, folding, find): editor/editor.js handles them.
    if (inEditor && !event.altKey && ['b', 'i', 'k', 'l', 'x', 'c', 'v', 'a', 'z', 'y', 'd', 'f', 'h', '/', '[', ']', 's'].includes(key)) return;
    if (inEditor && !event.shiftKey && !event.altKey && ['5', '6'].includes(key)) return;
    const shortcut = SHORTCUTS.find(([k, shift, alt]) => k === key && shift === event.shiftKey && alt === event.altKey);
    if (shortcut) { event.preventDefault(); event.stopPropagation(); run(shortcut[3]); }
    return;
  }
  const fkeys = { f1: event.shiftKey ? 'tutorial' : 'about', f2: 'renameFile', f5: event.shiftKey ? 'readingPresentation' : 'slides', f7: 'styleCheck', f8: 'focusMode', f9: 'typewriter', f11: 'fullscreen' };
  if (fkeys[key]) { event.preventDefault(); run(fkeys[key]); return; }
  if (editing && key === 'escape') event.target.blur();
}

// ───────────────────────── popup actions

function bindPopupActions() {
  popups.on('error', (error) => showError('error.unexpected', error));
  popups.on('report-error', (data) => showError(data.titleKey ?? 'error.unexpected', Object.assign(new Error(data.message), { stack: data.detail ?? '' }), data.context ?? ''));
  popups.on('choose-background', () => chooseBackground());
  popups.on('clear-background', () => removeBackground());
  popups.on('shuffle-background', () => shuffleBackground());
  popups.on('open-recent', (data) => openRecent(data.path, data.kind));
  popups.on('notice', (data) => notify(data.kind ?? 'info', data.text));
  popups.on('open-settings', (data) => popups.open('settings', { tab: data.tab ?? 'general', themeGroup: data.themeGroup }));
  popups.on('start-tutorial', () => startTutorial());
  popups.on('show-start', () => showStartPage(true));
  popups.on('progress-cancel', (data) => { popups.actions.get(`cancel:${data.op}`)?.(); });
  popups.on('open-external', (data) => native.openExternal(data.url));
  popups.on('print-content', () => sendPrintContent());
  popups.on('print-run', (job) => runPrint(job));
  popups.on('raise-test-panic', () => native.invoke('raise_test_panic').catch((error) => showError('error.unexpected', error)));
}

// ───────────────────────── tutorial, welcome

let tutorial = null;
async function startTutorial(options = {}) {
  tutorial ??= new Tutorial(appApi, root.querySelector('#tutorial-layer'));
  state.tutorial = tutorial;
  updateSettings({ tutorialOffered: true }, { quiet: true });
  await tutorial.start(options);
}

async function openWelcome() {
  updateSettings({ tutorialOffered: true }, { quiet: true });
  const result = await popups.open('welcome', {});
  if (result?.choice === 'tutorial') startTutorial();
  else if (result?.choice === 'sample') openSample('guide');
}

// ───────────────────────── start-up

/** What the features, the tutorial and the tests use. */
const appApi = {
  state, t, run, commands, popups, notify, showError, ask, settings, updateSettings, renderAll, copyText, withProgress, showStartPage,
  core, index, lang, isDesktop: desktop, docs, views,
  get vault() { return state.vault; },
  activePath, activeView, activeNoteView, openFile, closePath, pathRenamed, externalText, updateText, saveDoc, saveAll, readText, writeText, snapshotNow,
  indexChanged, vaultPrefs, setVaultPrefs, expandFolder, revealInTree, layoutSnapshot: () => serialize(state.layout),
  restoreLayout: async (saved) => {
    for (const view of views.values()) view.destroy?.();
    views.clear();
    state.layout = deserialize(saved);
    for (const tab of allTabs(state.layout)) if (tab.path && !index.has(tab.path)) closeTab(state.layout, tab.id);
    await Promise.all(allTabs(state.layout).filter((x) => x.kind === 'note').map((x) => loadDoc(x.path).catch(() => null)));
    renderWorkspace();
    activeChanged(true);
  },
  recordingChanged: (on) => { state.recording = on; renderStatus(); renderToolbarState(); },
  openSample, openVaultFolder, closeVault, useVault, anchorBelow, openMenubarMenu, showMenu, openDocWindow, closeDocFrames,
  version: () => state.info?.version ?? VERSION,
  setLeftTab: showLeftTab, setRightTab: showRightTab, searchFor, quickSwitcher, commandPalette, exportNote,
  // The tutorial borrows the window: it opens a sample vault and gives the user's vault back afterwards.
  takeDoc: () => (state.vault ? { kind: state.vault.kind, path: state.vault.kind === 'desktop' ? state.vault.root : state.vault.name } : null),
  putDoc: async (saved) => {
    const now = appApi.takeDoc();
    if (!saved) { if (now) await closeVault(); return; }
    if (now?.path === saved.path && now?.kind === saved.kind) return;
    if (saved.kind === 'desktop') await openVaultFolder(saved.path); else if (saved.kind === 'browser') await openRecent(saved.path, 'browser');
  },
  openTemplate: (id) => openSample(id),
  moveTab: (tabId, leafId, opts) => { moveTab(state.layout, tabId, leafId, opts); renderWorkspace(); activeChanged(); },
};
Object.assign(features, createFeatures(appApi));

async function start() {
  renderShell();
  bindShellEvents();
  bindEvents();
  bindPopupActions();
  // The palette, the quick switcher, the pickers and name prompts are popups of their own, like every popup.
  useWindows(popups);
  configurePlatform({ defaultDir: () => settings().lastDirectory, dark: () => resolveTheme(settings().theme, prefersDark(), settings().customTheme).dark, title: () => `${nameOf(activePath() ?? 'note')} — MyMarkdownMaster` });
  await popups.init();
  const welcomeLikely = desktop && settings().showWelcome && settings().showStartPage !== false && !globalThis.__MYMARKDOWN_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome');
  if (welcomeLikely) popups.prewarm('welcome');
  state.info = await native.appInfo().catch(() => null);
  state.instance = await native.instanceInfo().catch(() => ({ first: true, others: 0 }));
  if (settings().animationRandom) updateSettings({ animation: randomAnimation(settings().animation) }, { quiet: true });
  setInterval(tickStartBackground, 1000);
  native.setBackendLanguage(settings().language);
  state.showStart = true;
  applySettings({});
  await loadBackground();
  if (!desktop) loadWasm().catch((error) => showError('error.core', error));

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
      else if (type === 'drop') { setDropActive(false); handleDroppedPaths(event.payload.paths ?? [], event.payload.position); }
    });
    native.listen('fatal-error', (fatal) => { const error = new Error(fatal.message); error.stack = [fatal.location, fatal.backtrace].join('\n'); showError('error.fatal', error, fatal.location); });
  }

  trackMaximized();
  if (desktop) await appWindow.show();
  // The vault open last time (desktop folders and browser vaults), unless files came on the command line.
  const startup = await native.startupFiles().catch(() => []);
  const session = loadJson(SESSION_KEY, null);
  if (startup.length) await handleDroppedPaths(startup);
  else if (session?.path && settings().restoreSession && (state.instance?.first ?? true) && !settings().showStartPage) {
    try {
      if (session.kind === 'desktop' && desktop) { const [ok] = await native.pathsExist([session.path]); if (ok) await useVault(await Vault.openDesktop(session.path)); }
      else if (session.kind === 'browser' && !desktop && webSupport().browser) { await loadWasm(); await useVault(await Vault.openWeb(await Vault.browserVaultHandle(session.path, false), 'browser')); }
    } catch (error) { console.warn('session', error); }
  }
  state.showStart = !state.vault;
  renderAll();
  const welcome = settings().showWelcome && onStart() && !globalThis.__MYMARKDOWN_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome');
  if (welcome) openWelcome(); else if (welcomeLikely) popups.close('welcome');
  if (desktop) {
    if (!welcome) await appWindow.setFocus();
    const warm = () => { popups.prewarm('menu').then(() => popups.prewarm('progress', { warm: true })); };
    if (welcome) popups.whenDrawn('welcome', 1500).then(() => setTimeout(warm, 200)); else setTimeout(warm, 400);
  }
}

// Test hook: E2E suites and the smoke script drive the app through this.
window.__mymarkdown = {
  state, t, commands, popups, run, index, docs, views, core, features,
  menus: { MENUS, SUBMENUS, enabled: (id) => commandEnabled(id) },
  app: appApi,
  layout: () => state.layout,
  tutorial: () => tutorial,
  startBackground: () => startBackground,
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => { if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {}); });
