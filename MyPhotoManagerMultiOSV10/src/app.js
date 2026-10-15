// The application shell: menu bar, mode switcher, toolbar, panes, file list,
// status bar, the View / Edit / Dashboard modes, keyboard shortcuts, opening
// folders (desktop dialogs, web folder access, drag and drop) and start-up.
import { LABEL_COLORS, LABELS, parentOf } from './catalog/catalog.js';
import { GROUP_KEYS, SORT_KEYS } from './catalog/listing.js';
import { ARCHIVES, isArchive, isMedia, kindOf, MEDIA_EXTENSIONS } from './formats/types.js';
import { getLanguage, onLanguageChange, plural, setLanguage, t } from './i18n.js';
import { filesFromDrop, fs, hasFolderAccess, webFs } from './platform/fs.js';
import { chooseFiles, chooseFolder, errorText, invoke, isDesktop, listen, onFileDrop, setWindowTheme, setWindowTitle, showWindow, startWindowResize } from './platform/native.js';
import { setColorManagement } from './formats/decode.js';
import { DEFAULTS as DEFAULT_SETTINGS, loadSettings, loadSettingsFile } from './settings.js';
import {
  addToBasket, app, catalogFolder, copyToClipboard, deleteItems, focusedItem, goBack, goForward, goUp, invertSelection, loadCatalog, newFolder, openFolder, openSource,
  pasteClipboard, rate, rebuildList, refreshList, reload, renameItem, saveCatalogNow, selectAll, selectedFiles, selectedItems, selectFilesOnly, selectItem, selectNone,
  setLabel, setMode, setSelection, targetPaths, toggleTag, transfer, viewableList, viewItem,
} from './store.js';
import { thumbs } from './thumbs/thumbs.js';
import { aboutDialog, settingsDialog, shortcutsDialog } from './ui/appdialogs.js';
import { quickKeyword } from './ui/quickmeta.js';
import { addToCollectionMenu, newCollection, smartCollectionDialog } from './ui/collections.js';
import { editors as externalEditors, externalEditorMenu, openInEditor } from './ui/external.js';
import { gpxGeotagDialog } from './ui/gpxtag.js';
import { adjustDates, autoRotate, batchAdjust, batchApplyPreset, batchConvert, batchRename, batchResize, batchWatermark, copyMoveTo, fileTimeFromTaken, rotateFiles } from './ui/batch.js';
import { createFocusStack, createGif, createHdr, createPanorama, createPdf, createZip, exportSlideshow, openArchive } from './ui/create.js';
import { editClipboard } from './ui/editor.js';
import { importDialog } from './ui/importer.js';
import { commandFor, keymapDialog, registerCommands } from './ui/keymap.js';
import { createPeoplePane, nameFacesDialog, scanFaces } from './ui/peoplepane.js';
import { copyImageToClipboard, exifEditor, isPrivatePath, lockPrivateFolder, lookUpPlaces, moveToPrivate, openPrivateFolder, openWith, privateUnlocked, restoreFromPrivate, scanDialog, shareFiles, syncDialog, writeMetadataCommand } from './ui/tools.js';
import { createCalendarPane } from './ui/calendarpane.js';
import { createCatalogPane } from './ui/catalogpane.js';
import { openCompare } from './ui/compare.js';
import { createDashboard } from './ui/dashboard.js';
import { closeAllDialogs, confirmDialog, dialogDocuments, dialogOpen, openDialog, promptDialog, statusProgress, toast, topDialog } from './ui/dialog.js';
import { $, button, clear, debounce, h, typing } from './ui/dom.js';
import { findDuplicates } from './ui/duplicates.js';
import { createEditor } from './ui/editor.js';
import { createFileList } from './ui/filelist.js';
import { createFolderPane } from './ui/folders.js';
import { icon } from './ui/icons.js';
import { createMapPane } from './ui/mappane.js';
import { closeMenus, contextMenu, menuBar, menuOpen, showMenu } from './ui/menu.js';
import { printDialog } from './ui/print.js';
import { createPreviewPane } from './ui/previewpane.js';
import { createPropertiesPane } from './ui/properties.js';
import { createSearchPane } from './ui/searchpane.js';
import { startSlideshow } from './ui/slideshow.js';
import { createStartPage } from './ui/startpage.js';
import { createViewer } from './ui/viewer.js';
import { formatBytes } from './util/format.js';
import { applyTheme, nextTheme } from './themes.js';
import { history as undoHistory } from './history.js';
import { FLAG_EN, FLAG_KO } from './ui/flags.js';
import { watchNumbers } from './ui/steppers.js';
import { watchMinWidth } from './ui/minwidth.js';
import * as analysis from './analysis/analyzer.js';
import { customThemeDialog, EDIT_CUSTOM, themeSelect } from './ui/themepicker.js';

app.settings = loadSettings();
setLanguage(app.settings.language);

// ───────────────────────── theme

const darkQuery = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
/** Theme id in use ('system' follows the OS: the default dark or light theme). */
function currentTheme() {
  return app.settings.theme === 'system' ? (darkQuery?.matches ? 'dark' : 'light') : app.settings.theme;
}
let shownTheme = null;
function updateTheme() {
  shownTheme = applyTheme(currentTheme(), app.settings.customTheme);
  setWindowTheme(shownTheme.mode === 'dark');
}
function setTheme(id) {
  app.settings.theme = id;
  app.saveSettings();
  updateTheme();
  renderHeader();
}
/** The theme button: a painter's palette with coloured paint. */
const PALETTE_ICON = '<svg class="icon palette-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6a9.4 9.4 0 0 0 0 18.8c1.2 0 1.7-.9 1.7-1.6 0-1.3-1-1.6-1-2.6s.8-1.6 2.3-1.6h2.1a4.4 4.4 0 0 0 4.4-4.4C21.5 6.4 17.3 2.6 12 2.6z" fill="#d9b382" stroke="#8a6338" stroke-width="1.2"/><circle cx="7.2" cy="11.2" r="1.7" fill="#e53935"/><circle cx="9.6" cy="6.9" r="1.7" fill="#fdd835"/><circle cx="14.6" cy="6.6" r="1.7" fill="#43a047"/><circle cx="17.9" cy="10.1" r="1.7" fill="#1e88e5"/><circle cx="8.4" cy="16.1" r="1.5" fill="#8e24aa"/></svg>';

/** Theme button: the next of the 40 themes. */
function cycleTheme() {
  const next = nextTheme(currentTheme());
  setTheme(next.id);
  toast(t('theme.changed', { name: next.name }), 'info', 1400);
}
async function pickTheme(id) {
  if (id !== EDIT_CUSTOM) { setTheme(id); return; }
  const saved = await customThemeDialog();
  if (!saved) updateTheme(); // back from the preview
  renderHeader();
}
/** Language button: Korean ↔ English (shows the flag of the language it switches to). */
function toggleLanguage() {
  app.settings.language = getLanguage() === 'ko' ? 'en' : 'ko';
  app.saveSettings();
  setLanguage(app.settings.language);
}
watchNumbers(document);
darkQuery?.addEventListener?.('change', () => { if (app.settings.theme === 'system') updateTheme(); });

// ───────────────────────── layout

const root = $('#app');
const header = h('header.app-header');
const toolbar = h('div.app-toolbar');
const leftPane = h('aside.side-pane.left');
const rightPane = h('aside.side-pane.right');
const center = h('main.center');
const basketBar = h('div.basket-bar');
const statusBar = h('footer.status-bar');
const manage = h('div.manage', leftPane, h('div.splitter', { dataset: { side: 'left' } }), center, h('div.splitter', { dataset: { side: 'right' } }), rightPane);
const modeHost = h('div.mode-host');
const dropHint = h('div.drop-hint', h('div', { html: icon('upload') }), h('div', t('web.dropHere')));
root.append(header, toolbar, modeHost, statusBar, dropHint);

const fileList = createFileList({
  onContextMenu: itemMenu,
  onDropItems: (paths, dir, { copy, x, y }) => (dir === '__map__' ? mapPane.placeAt(x, y, paths) : dir === '__basket__' ? addToBasket(paths) : transfer(paths, dir, { move: !copy })),
});
const welcome = h('div.welcome');
center.append(welcome, fileList.filmPreview, fileList.box, basketBar);

const folderPane = createFolderPane({ onOpenWebFolder: openWebFolder, onOpenWebFiles: openWebFiles, folderMenuItems: () => [] });
const catalogPane = createCatalogPane();
const calendarPane = createCalendarPane();
const searchPane = createSearchPane();
const propertiesPane = createPropertiesPane({ onShowOnMap: () => showRightTab('map'), onFilter: (change) => setListFilter(change) });
const previewPane = createPreviewPane();
const mapPane = createMapPane();
const viewer = createViewer({
  onEdit: (path) => editPath(path),
  onSlideshow: (index) => startSlideshow(viewableList(), index),
  onRotate: (paths, turns) => rotateAndRefresh(paths, turns),
  onContextMenu: (event, item) => itemMenu(event, item),
});
let editReturn = 'manage';
const editor = createEditor({ onDone: () => setMode(editReturn === 'view' ? 'view' : 'manage') });
const dashboard = createDashboard({
  open: (target) => {
    setMode('manage');
    if (target.calendar) calendarPane.show(target.calendar.year, target.calendar.month);
    if (target.left) showLeftTab(target.left);
    if (target.right) showRightTab(target.right);
    if (target.section) catalogPane.reveal(target.section);
    if (target.source) openSource(target.source);
  },
});

const peoplePane = createPeoplePane();
const LEFT_TABS = [['folders', 'folder', folderPane], ['catalog', 'bookmark', catalogPane], ['people', 'user', peoplePane], ['calendar', 'calendar', calendarPane], ['search', 'search', searchPane]];
const RIGHT_TABS = [['properties', 'info', propertiesPane], ['preview', 'image', previewPane], ['map', 'map', mapPane]];

/** A side panel: title bar (icon, title, collapse button) and tabs; collapsed it is a strip of icons and the title. */
function tabs(container, list, current, onPick, side) {
  clear(container);
  const p = app.settings.panes;
  const key = side === 'left' ? 'leftCollapsed' : 'rightCollapsed';
  const collapsed = p[key];
  const [currentId, currentIcon] = list.find(([id]) => id === current) ?? list[0];
  const setCollapsed = (value) => { p[key] = value; app.saveSettings(); layoutPanes(); };
  // "<" folds the left panel towards the left edge, ">" the right one towards the right edge.
  const fold = side === 'left' ? '<' : '>';
  const unfold = side === 'left' ? '>' : '<';
  container.classList.toggle('collapsed', collapsed);
  if (collapsed) {
    container.append(
      h('button.pane-fold', { type: 'button', title: t('pane.expand'), dataset: { fold: side }, onclick: () => setCollapsed(false) }, unfold),
      h('div.pane-strip-tabs', list.map(([id, iconName]) => h(`button.pane-strip-tab${id === current ? '.on' : ''}`, { type: 'button', title: t(`pane.${id}`), dataset: { tab: id }, html: icon(iconName), onclick: () => { p[key] = false; onPick(id); } }))),
      h('div.pane-strip-title', { title: t(`pane.${currentId}`) }, h('span', { html: icon(currentIcon) }), h('span.pane-strip-text', t(`pane.${currentId}`))));
    return;
  }
  // A pane may put its own buttons on the title row (the Folders pane: the drives).
  const headTools = list.find(([id]) => id === current)?.[2].headTools?.() ?? null;
  const headIcon = h('span.pane-head-icon', { html: icon(currentIcon) });
  const headTitle = h('span.pane-head-title', t(`pane.${currentId}`));
  const foldButton = h('button.pane-fold', { type: 'button', title: t('pane.collapse'), dataset: { fold: side }, onclick: () => setCollapsed(true) }, fold);
  // Fold buttons face the middle: "<" at the right of the left panel, ">" at the left of the right panel.
  container.append(h('div.pane-head', side === 'right' ? [foldButton, headIcon, headTitle, headTools] : [headIcon, headTitle, headTools, foldButton]));
  const bar = h('div.pane-tabs', { role: 'tablist' });
  for (const [id, iconName] of list) {
    bar.append(h(`button.pane-tab${id === current ? '.on' : ''}`, { type: 'button', role: 'tab', title: t(`pane.${id}`), dataset: { tab: id }, onclick: () => onPick(id) }, h('span', { html: icon(iconName) }), h('span.pane-tab-label', t(`pane.${id}`))));
  }
  const pane = list.find(([id]) => id === current)?.[2] ?? list[0][2];
  container.append(bar, pane.el);
  pane.render();
}

function showLeftTab(id) {
  app.settings.panes.leftTab = id;
  app.settings.panes.left = true;
  app.settings.panes.leftCollapsed = false;
  app.saveSettings();
  layoutPanes();
}

app.on('show-pane', ({ side, id }) => { if (side === 'left') showLeftTab(id); else showRightTab(id); });

function showRightTab(id) {
  app.settings.panes.rightTab = id;
  app.settings.panes.right = true;
  app.settings.panes.rightCollapsed = false;
  app.saveSettings();
  layoutPanes();
}

function layoutPanes() {
  const p = app.settings.panes;
  leftPane.hidden = !p.left;
  rightPane.hidden = !p.right;
  manage.querySelector('[data-side=left]').hidden = !p.left;
  manage.querySelector('[data-side=right]').hidden = !p.right;
  leftPane.style.width = p.leftCollapsed ? '' : `${p.leftWidth}px`;
  rightPane.style.width = p.rightCollapsed ? '' : `${p.rightWidth}px`;
  // A folded panel cannot be resized.
  if (p.left && p.leftCollapsed) manage.querySelector('[data-side=left]').hidden = true;
  if (p.right && p.rightCollapsed) manage.querySelector('[data-side=right]').hidden = true;
  if (p.left) tabs(leftPane, LEFT_TABS, p.leftTab, showLeftTab, 'left');
  if (p.right) tabs(rightPane, RIGHT_TABS, p.rightTab, showRightTab, 'right');
  basketBar.hidden = !p.basket;
  renderBasket();
  renderToolbar();
}

// Pane splitters.
for (const splitter of manage.querySelectorAll('.splitter')) {
  splitter.addEventListener('pointerdown', (event) => {
    const side = splitter.dataset.side;
    const start = event.clientX;
    const width = app.settings.panes[`${side}Width`];
    splitter.setPointerCapture(event.pointerId);
    const move = (e) => {
      const delta = side === 'left' ? e.clientX - start : start - e.clientX;
      app.settings.panes[`${side}Width`] = Math.max(180, Math.min(560, width + delta));
      (side === 'left' ? leftPane : rightPane).style.width = `${app.settings.panes[`${side}Width`]}px`;
    };
    const up = () => { splitter.removeEventListener('pointermove', move); splitter.removeEventListener('pointerup', up); app.saveSettings(); };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', up);
  });
}

// ───────────────────────── header: menus and modes

const MODES = [['manage', 'grid'], ['view', 'eye'], ['edit', 'pencil'], ['dashboard', 'chart']];

function renderHeader() {
  clear(header);
  const bar = menuBar([
    { id: 'file', icon: 'folder', label: t('menu.file'), items: fileMenu },
    { id: 'edit', icon: 'pencil', label: t('menu.edit'), items: editMenu },
    { id: 'view', icon: 'eye', label: t('menu.view'), items: viewMenu },
    { id: 'organize', icon: 'tag', label: t('menu.organize'), items: organizeMenu },
    { id: 'create', icon: 'wand', label: t('menu.create'), items: createMenu },
    { id: 'tools', icon: 'sliders', label: t('menu.tools'), items: toolsMenu },
    { id: 'help', icon: 'help', label: t('menu.help'), items: helpMenu },
  ]);
  const home = h(`button.mode-button.start-home${app.state.mode === 'start' ? '.on' : ''}`, {
    type: 'button', id: 'start-home', title: t('start.title'), 'aria-label': t('start.title'), 'aria-pressed': app.state.mode === 'start' ? 'true' : 'false', onclick: () => showStart(),
  }, h('span', { html: icon('home') }), h('span.mode-label', t('start.title')));
  const modes = h('div.mode-switch', { role: 'tablist' }, MODES.map(([id, iconName]) => h(`button.mode-button${app.state.mode === id ? '.on' : ''}`, {
    type: 'button', role: 'tab', dataset: { mode: id }, title: t(`mode.${id}`), onclick: () => switchMode(id),
  }, h('span', { html: icon(iconName) }), h('span.mode-label', t(`mode.${id}`)))));
  const modeCluster = h('div.mode-cluster', home, modes);
  const toEnglish = getLanguage() === 'ko';
  const right = h('div.header-right',
    h('button.tool', { type: 'button', id: 'theme-next', title: `${t('theme.next')} — ${shownTheme?.name ?? ''}`, html: PALETTE_ICON, onclick: cycleTheme }),
    themeSelect(app.settings.theme, { withEdit: true, onChange: pickTheme }),
    h('button.tool.lang-toggle', { type: 'button', id: 'language-toggle', title: toEnglish ? 'English' : '한국어', html: toEnglish ? FLAG_EN : FLAG_KO, onclick: toggleLanguage }),
    h('button.tool', { type: 'button', title: t('menu.settings'), html: icon('gear'), onclick: openSettings, id: 'open-settings' }),
    h('button.tool', { type: 'button', title: t('about.title'), html: icon('info'), onclick: aboutDialog, id: 'open-about' }));
  header.append(h('div.app-logo', { html: icon('images') }), bar, modeCluster, right);
}

/** The mode buttons are the only part of the header that changes when the page changes. */
function syncModeChrome() {
  const home = header.querySelector('#start-home');
  if (!home) { renderHeader(); return; }
  const mode = app.state.mode;
  home.classList.toggle('on', mode === 'start');
  home.setAttribute('aria-pressed', mode === 'start' ? 'true' : 'false');
  for (const button of header.querySelectorAll('.mode-switch .mode-button')) button.classList.toggle('on', button.dataset.mode === mode);
}

function switchMode(mode) {
  if (mode === 'view') {
    const item = focusedItem() && !focusedItem().isDir ? focusedItem() : viewableList()[0];
    if (!item) { toast(t('mode.nothingToView'), 'info'); return; }
    setMode('view', { path: item.path });
  } else if (mode === 'edit') {
    const item = focusedItem() && !focusedItem().isDir ? focusedItem() : (app.state.mode === 'view' ? app.state.list.find((i) => i.path === viewer.currentPath) : null);
    if (!item || kindOf(item.name) === 'video' || !kindOf(item.name)) { toast(t('mode.nothingToEdit'), 'info'); return; }
    editPath(item.path);
  } else {
    setMode(mode);
  }
}

function editPath(path) {
  editReturn = app.state.mode === 'view' ? 'view' : 'manage';
  setMode('edit', { path });
}

async function leaveEditor() {
  if (app.state.mode === 'edit' && editor.dirty) return confirmDialog(t('edit.discard'), { ok: t('edit.discardOk'), danger: true });
  return true;
}

async function showStart() {
  if (!(await leaveEditor())) return;
  setMode('start');
}

// While the first folder is opened, stay on the start page.
let keepStart = false;
const startPage = createStartPage(() => {
  const files = () => (selectedFiles().length ? selectedFiles() : app.state.list.filter((item) => !item.isDir));
  return {
    recent: app.settings.recentFolders ?? [],
    showSamples: !isDesktop(),
    actions: {
      openFolder: () => openFolderDialog(),
      openFiles: () => (isDesktop() ? openFilesDesktop() : openWebFiles()),
      import: () => importDialog(),
      slideshow: () => slideshowFromManage(),
      settings: () => openSettings(),
      shortcuts: () => shortcutsDialog(),
      recent: (path) => openFolder(path).catch((error) => toast(errorText(error), 'error')),
      manage: () => setMode('manage'),
      view: () => switchMode('view'),
      edit: () => switchMode('edit'),
      dashboard: () => switchMode('dashboard'),
      search: () => { setMode('manage'); showLeftTab('search'); },
      folders: () => { setMode('manage'); showLeftTab('folders'); },
      calendar: () => { setMode('manage'); showLeftTab('calendar'); },
      people: () => { setMode('manage'); showLeftTab('people'); },
      map: () => { setMode('manage'); showRightTab('map'); },
      print: () => { setMode('manage'); printDialog(files()); },
      compare: () => { setMode('manage'); openCompare(selectedFiles()); },
      duplicates: () => { setMode('manage'); findDuplicates(); },
      panorama: () => { setMode('manage'); createPanorama(selectedFiles()); },
      gif: () => { setMode('manage'); createGif(files()); },
      pdf: () => { setMode('manage'); createPdf(files()); },
      hdr: () => { setMode('manage'); createHdr(selectedFiles()); },
      batch: () => { setMode('manage'); batchRename(); },
      organize: async () => { setMode('manage'); (await import('./ui/organize.js')).organizeDialog(app.state.list); },
    },
  };
});

app.on('mode', async (mode) => {
  closeMenus();
  if (mode !== 'view') viewer.exitFullscreen();
  clear(modeHost);
  document.body.dataset.mode = mode;
  // Panes skipped their updates while hidden: draw them for the current selection.
  if (mode === 'start') { modeHost.append(startPage.el); startPage.show(); }
  else startPage.hide();
  if (mode === 'manage') { modeHost.append(manage); if (app.settings.panes.right) RIGHT_TABS.find(([id]) => id === app.settings.panes.rightTab)?.[2].render(); fileList.rebuild(); if (app.state.focus) fileList.scrollIntoView(app.state.focus); fileList.focus(); }
  if (mode === 'view') { modeHost.append(viewer.el); viewer.open(app.state.viewPath); }
  if (mode === 'edit') {
    modeHost.append(editor.el);
    const item = app.state.list.find((i) => i.path === app.state.viewPath) ?? { path: app.state.viewPath, name: app.state.viewPath.split(/[\\/]/).pop() };
    editor.open(item);
  }
  if (mode === 'dashboard') { modeHost.append(dashboard.el); dashboard.render(); }
  syncModeChrome();
  renderToolbar();
  renderStatus();
});

app.on('edited', (path) => { if (editReturn === 'view') { app.state.viewPath = path; } });

// ───────────────────────── toolbar

function renderToolbar() {
  if (app.state.mode !== 'manage') {
    toolbar.hidden = true;
    return;
  }
  clear(toolbar);
  toolbar.hidden = false;
  const { history, source } = app.state;
  const s = app.settings;
  const nav = h('div.tool-group',
    button('back', t('nav.back'), goBack, { title: `${t('nav.back')} (Alt+←)`, disabled: !history.back.length }),
    button('forward', t('nav.forward'), goForward, { title: `${t('nav.forward')} (Alt+→)`, disabled: !history.forward.length }),
    button('up', t('nav.up'), goUp, { title: `${t('nav.up')} (Backspace)`, disabled: source.type !== 'folder' || !parentOf(source.path) }),
    button('refresh', t('nav.refresh'), () => reload(), { title: `${t('nav.refresh')} (F5)` }));
  const undoRedo = h('div.tool-group',
    button('undo', t('undo.undo'), undoFileOp, { title: undoHistory.canUndo ? `${t('undo.undo')}: ${undoHistory.undoLabel} (Ctrl+Z)` : `${t('undo.undo')} (Ctrl+Z)`, disabled: !undoHistory.canUndo, id: 'undo-button' }),
    button('redo', t('undo.redo'), redoFileOp, { title: undoHistory.canRedo ? `${t('undo.redo')}: ${undoHistory.redoLabel} (Ctrl+Y)` : `${t('undo.redo')} (Ctrl+Y)`, disabled: !undoHistory.canRedo, id: 'redo-button' }));
  const address = h('div.address', addressContent());
  const views = h('div.tool-group.segmented', VIEW_STYLES.map(([id, iconName]) => button(iconName, t(`viewStyle.${id}`), () => { s.view = id; app.saveSettings(); renderToolbar(); fileList.rebuild(); }, { className: s.view === id ? 'on' : '' })));
  const size = h('input.thumb-size', { type: 'range', min: 64, max: 400, step: 4, value: s.thumbSize, title: t('toolbar.thumbSize'), disabled: s.view !== 'thumbs' });
  size.addEventListener('input', () => { s.thumbSize = Number(size.value); fileList.rebuild(); });
  size.addEventListener('change', () => app.saveSettings());
  const sort = h('button.btn.small.menu-button', { type: 'button', title: t('toolbar.sort'), onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); showMenu(sortMenu(), r.left, r.bottom + 2); } }, h('span', { html: icon('sort') }), t(`sort.${s.sort.key}`));
  const filterActive = Boolean(app.state.listFilter.rating || app.state.listFilter.label || app.state.listFilter.tagged || app.state.listFilter.kinds);
  const filter = h(`button.btn.small.menu-button${filterActive ? '.on' : ''}`, { type: 'button', title: t('toolbar.filter'), onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); showMenu(filterMenu(), r.left, r.bottom + 2); } }, h('span', { html: icon('filter') }), t('toolbar.filter'));
  const group = h('button.btn.small.menu-button', { type: 'button', title: t('toolbar.group'), onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); showMenu(groupMenu(), r.left, r.bottom + 2); } }, h('span', { html: icon('layers') }), t(`group.by.${s.groupBy}`));
  const search = h('input.input.quick-search', { type: 'search', placeholder: t('toolbar.searchPlaceholder'), value: app.state.source.type === 'search' ? app.state.source.text : '', id: 'quick-search' });
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const text = search.value.trim();
      if (!text) return;
      openSource({ type: 'search', text, title: text });
    }
    if (event.key === 'Escape') { search.value = ''; fileList.focus(); }
  });
  const panes = h('div.tool-group',
    button('panelLeft', t('toolbar.leftPane'), () => { s.panes.left = !s.panes.left; app.saveSettings(); layoutPanes(); }, { className: s.panes.left ? 'on' : '' }),
    button('basket', t('toolbar.basket'), () => { s.panes.basket = !s.panes.basket; app.saveSettings(); layoutPanes(); }, { className: s.panes.basket ? 'on' : '' }),
    button('panelRight', t('toolbar.rightPane'), () => { s.panes.right = !s.panes.right; app.saveSettings(); layoutPanes(); }, { className: s.panes.right ? 'on' : '' }));
  toolbar.append(nav, undoRedo, address, h('div.tool-group', sort, group, filter), views, size, search, panes);
  // Long paths: keep the current folder (the end) in view.
  requestAnimationFrame(() => { address.scrollLeft = address.scrollWidth; });
}

function addressContent() {
  const { source } = app.state;
  if (source.type === 'folder') {
    const parts = [];
    let path = source.path;
    for (let i = 0; i < 40 && path; i++) {
      parts.unshift(path);
      const parent = parentOf(path);
      if (!parent || parent === path) break;
      path = parent;
    }
    return parts.map((p, i) => h('button.crumb', { type: 'button', title: p, dataset: { drop: p }, onclick: () => openFolder(p) }, i === 0 ? p.replace(/^@\d+:/, '').replace(/[\\/]$/, '') || p : p.split(/[\\/]/).pop()));
  }
  const iconName = { filter: 'bookmark', search: 'search', calendar: 'calendar', basket: 'basket', paths: 'layers' }[source.type] ?? 'images';
  const title = source.type === 'basket' ? t('catalog.basket') : source.title ?? source.text ?? t('app.name');
  return [h('span.crumb-icon', { html: icon(iconName) }), h('span.crumb.static', title)];
}

function sortMenu() {
  const s = app.settings;
  return [
    ...SORT_KEYS.map((key) => ({ label: t(`sort.${key}`), checked: s.sort.key === key, action: () => { s.sort = { ...s.sort, key }; app.saveSettings(); refreshList(); renderToolbar(); } })),
    'separator',
    { label: t('sort.ascending'), checked: !s.sort.desc, action: () => { s.sort = { ...s.sort, desc: false }; app.saveSettings(); refreshList(); } },
    { label: t('sort.descending'), checked: s.sort.desc, action: () => { s.sort = { ...s.sort, desc: true }; app.saveSettings(); refreshList(); } },
  ];
}

function groupMenu() {
  return GROUP_KEYS.map((key) => ({ label: t(`group.by.${key}`), checked: app.settings.groupBy === key, action: () => { app.settings.groupBy = key; app.saveSettings(); refreshList(); renderToolbar(); } }));
}

function setListFilter(change) {
  Object.assign(app.state.listFilter, change);
  refreshList();
  renderToolbar();
  renderStatus();
}

function filterMenu() {
  const f = app.state.listFilter;
  const kinds = [['native', t('kind.image')], ['raw', 'RAW'], ['heif', 'HEIC'], ['tiff', 'TIFF'], ['psd', 'PSD'], ['video', t('kind.video')]];
  return [
    { header: t('filter.rating') },
    ...[0, 1, 2, 3, 4, 5].map((n) => ({ label: n ? `≥ ${'★'.repeat(n)}` : t('filter.all'), checked: f.rating === n, action: () => setListFilter({ rating: n }) })),
    'separator',
    { header: t('filter.label') },
    { label: t('filter.all'), checked: !f.label, action: () => setListFilter({ label: null }) },
    ...LABELS.map((l) => ({ label: t(`label.${l}`), swatch: LABEL_COLORS[l], checked: f.label === l, action: () => setListFilter({ label: l }) })),
    'separator',
    { label: t('filter.taggedOnly'), checked: f.tagged, action: () => setListFilter({ tagged: !f.tagged }) },
    { label: t('filter.kind'), icon: 'images', submenu: [
      { label: t('filter.all'), checked: !f.kinds, action: () => setListFilter({ kinds: null }) },
      ...kinds.map(([kind, label]) => ({ label, checked: Boolean(f.kinds?.has(kind)), action: () => setListFilter({ kinds: new Set([kind, ...(kind === 'native' ? ['svg'] : [])]) }) })),
    ] },
    'separator',
    { label: t('filter.clear'), icon: 'close', action: () => setListFilter({ rating: 0, label: null, tagged: false, kinds: null }) },
  ];
}

// ───────────────────────── menus

const has = () => targetPaths().length > 0;
const hasFiles = () => targetPaths({ filesOnly: true }).length > 0;
const inFolder = () => app.state.source.type === 'folder';

function ratingSubmenu(paths) {
  return [0, 1, 2, 3, 4, 5].map((n) => ({ label: n ? '★'.repeat(n) : t('organize.noRating'), icon: n ? 'starFill' : 'star', shortcut: `Ctrl+${n}`, action: () => rate(n, paths) }));
}

function labelSubmenu(paths) {
  return [...LABELS.map((l, i) => ({ label: t(`label.${l}`), swatch: LABEL_COLORS[l], shortcut: `Alt+${i + 1}`, action: () => setLabel(l, paths) })), { label: t('organize.noLabel'), icon: 'close', shortcut: 'Alt+0', action: () => setLabel(null, paths) }];
}

const VIEW_STYLES = [['thumbs', 'grid'], ['tiles', 'panelLeft'], ['list', 'list'], ['details', 'table'], ['filmstrip', 'filmstrip']];

function createMenu() {
  const files = selectedFiles().length ? selectedFiles() : app.state.list.filter((i) => !i.isDir);
  const none = !files.length;
  return [
    { label: t('create.pdf'), icon: 'file', disabled: none, action: () => createPdf(files) },
    { label: t('create.gif'), icon: 'play', disabled: none, action: () => createGif(files) },
    { label: t('create.slideshow'), icon: 'video', disabled: none, action: () => exportSlideshow(files) },
    { label: t('file.print'), icon: 'print', disabled: none, action: () => printDialog(files) },
    'separator',
    { label: t('create.panorama'), icon: 'images', disabled: selectedFiles().length < 2, action: () => createPanorama(selectedFiles()) },
    { label: t('create.hdr'), icon: 'sun', disabled: selectedFiles().length < 2, action: () => createHdr(selectedFiles()) },
    { label: t('create.focus'), icon: 'zoomIn', disabled: selectedFiles().length < 2, action: () => createFocusStack(selectedFiles()) },
    'separator',
    { label: t('create.zip'), icon: 'download', disabled: none, action: () => createZip(files) },
    { label: t('file.wallpaper'), icon: 'wallpaper', disabled: !hasFiles() || !fs.caps.wallpaper, action: setWallpaper },
  ];
}

function privateMenu() {
  const inPrivate = isPrivatePath(app.state.source.path);
  return [
    { label: t('private.open'), icon: 'lock', action: openPrivateFolder },
    { label: t('private.moveTo'), icon: 'lock', disabled: !hasFiles() || inPrivate, action: () => moveToPrivate() },
    { label: t('private.restore'), icon: 'upload', disabled: !inPrivate || !hasFiles(), action: () => restoreFromPrivate() },
    { label: t('private.lock'), icon: 'close', disabled: !privateUnlocked(), action: lockPrivateFolder },
  ];
}

/** File › Recent: the last 10 folders and 10 files; × forgets one, the last item forgets all. */
function recentMenu() {
  const s = app.settings;
  const forget = (key, path) => { s[key] = s[key].filter((p) => p !== path); app.saveSettings(); };
  const gone = (key, path) => { forget(key, path); toast(t('file.recentGone', { path }), 'error', 5000); };
  const folders = s.recentFolders.map((path) => ({
    label: path.replace(/^@\d+:/, ''), icon: 'folder', removeTitle: t('file.recentForget'), remove: () => forget('recentFolders', path),
    action: () => openFolder(path).catch(() => gone('recentFolders', path)),
  }));
  const files = s.recentFiles.map((path) => ({
    label: path, icon: kindOf(path) === 'video' ? 'video' : 'image', removeTitle: t('file.recentForget'), remove: () => forget('recentFiles', path),
    action: async () => {
      try {
        await openFolder(parentOf(path), { select: [path] });
        if (!app.state.list.some((i) => i.path === path)) throw new Error('missing');
        viewItem(path);
      } catch { gone('recentFiles', path); }
    },
  }));
  if (!folders.length && !files.length) return [{ label: t('file.noRecent'), icon: 'info', disabled: true }];
  return [
    ...(folders.length ? [{ header: t('file.recentFolders') }, ...folders] : []),
    ...(files.length ? [...(folders.length ? ['separator'] : []), { header: t('file.recentFiles') }, ...files] : []),
    'separator',
    { label: t('file.recentClear'), icon: 'trash', action: () => { s.recentFolders = []; s.recentFiles = []; app.saveSettings(); toast(t('file.recentCleared'), 'info', 1600); } },
  ];
}

function fileMenu() {
  const recent = recentMenu();
  return [
    { label: t('file.openFolder'), icon: 'folderOpen', shortcut: 'Ctrl+O', action: openFolderDialog },
    !isDesktop() ? { label: t('web.openFiles'), icon: 'images', action: openWebFiles } : { label: t('file.openFiles'), icon: 'images', action: openFilesDesktop },
    { label: t('file.recent'), icon: 'clock', submenu: recent },
    { label: t('import.title'), icon: 'download', shortcut: 'Ctrl+Shift+I', action: importDialog },
    isDesktop() ? { label: t('scan.title'), icon: 'camera', action: scanDialog } : null,
    isDesktop() ? { label: t('sync.title'), icon: 'refresh', action: syncDialog } : null,
    { label: t('private.title'), icon: 'lock', submenu: privateMenu() },
    'separator',
    { label: t('file.newFolder'), icon: 'folderPlus', shortcut: 'Ctrl+Shift+N', disabled: !inFolder() || !fs.caps.mkdir, action: newFolder },
    { label: t('file.rename'), icon: 'rename', shortcut: 'F2', disabled: !has() || !fs.caps.rename, action: renameSelection },
    { label: t('file.copyTo'), icon: 'copy', disabled: !has() || !fs.caps.write, action: () => copyMoveTo(false) },
    { label: t('file.moveTo'), icon: 'move', disabled: !has() || !fs.caps.move, action: () => copyMoveTo(true) },
    { label: t('file.delete'), icon: 'trash', shortcut: 'Del', disabled: !has(), danger: true, action: () => deleteItems() },
    'separator',
    { label: t('file.reveal'), icon: 'reveal', disabled: !has() || !fs.caps.reveal, action: () => fs.reveal(targetPaths()[0]).catch((e) => toast(errorText(e), 'error')) },
    { label: t('file.openExternal'), icon: 'external', disabled: !hasFiles() || !fs.caps.open, action: () => fs.openExternal(targetPaths({ filesOnly: true })[0]).catch((e) => toast(errorText(e), 'error')) },
    { label: t('file.openWith'), icon: 'external', disabled: !hasFiles() || !fs.caps.open, action: () => openWith(targetPaths({ filesOnly: true })[0]) },
    { label: t('share.share'), icon: 'upload', disabled: !hasFiles(), action: () => shareFiles(targetPaths({ filesOnly: true })) },
    { label: t('share.copyImage'), icon: 'copy', shortcut: 'Ctrl+Shift+C', disabled: !hasFiles(), action: () => copyImageToClipboard(targetPaths({ filesOnly: true })[0]) },
    { label: t('file.wallpaper'), icon: 'wallpaper', disabled: !hasFiles() || !fs.caps.wallpaper, action: setWallpaper },
    'separator',
    { label: t('file.print'), icon: 'print', shortcut: 'Ctrl+P', disabled: !app.state.list.some((i) => !i.isDir), action: () => printDialog(selectedFiles().length ? selectedFiles() : app.state.list) },
    ...(isDesktop() ? ['separator', { label: t('file.exit'), icon: 'close', action: quit }] : []),
  ];
}

function editMenu() {
  return [
    { label: undoHistory.canUndo ? `${t('undo.undo')}: ${undoHistory.undoLabel}` : t('undo.undo'), icon: 'undo', shortcut: 'Ctrl+Z', disabled: !undoHistory.canUndo, action: undoFileOp },
    { label: undoHistory.canRedo ? `${t('undo.redo')}: ${undoHistory.redoLabel}` : t('undo.redo'), icon: 'redo', shortcut: 'Ctrl+Y', disabled: !undoHistory.canRedo, action: redoFileOp },
    'separator',
    { label: t('edit.cut'), icon: 'scissors', shortcut: 'Ctrl+X', disabled: !has() || !fs.caps.move, action: () => copyToClipboard(true) },
    { label: t('edit.copy'), icon: 'copy', shortcut: 'Ctrl+C', disabled: !has() || !fs.caps.write, action: () => copyToClipboard(false) },
    { label: t('edit.paste'), icon: 'clipboard', shortcut: 'Ctrl+V', disabled: !app.state.clipboard || !inFolder(), action: pasteClipboard },
    'separator',
    { label: t('edit.selectAll'), icon: 'checkSquare', shortcut: 'Ctrl+A', action: selectAll },
    { label: t('edit.selectFiles'), icon: 'images', action: selectFilesOnly },
    { label: t('edit.selectNone'), icon: 'square', shortcut: 'Ctrl+D', action: selectNone },
    { label: t('edit.invertSelection'), icon: 'invert', shortcut: 'Ctrl+I', action: invertSelection },
    'separator',
    { label: t('edit.editImage'), icon: 'pencil', shortcut: 'Ctrl+E', disabled: !hasFiles(), action: () => switchMode('edit') },
    isDesktop() ? { label: t('external.editIn'), icon: 'external', submenu: externalEditorMenu(targetPaths({ filesOnly: true })) } : null,
    { label: t('edit.restoreOriginal'), icon: 'undo', disabled: !hasFiles() || !fs.caps.originals, action: restoreOriginals },
    { label: t('edit.pasteSettings'), icon: 'copy', disabled: !hasFiles() || !editClipboard.preset, action: () => batchApplyPreset(targetPaths({ filesOnly: true }), editClipboard.preset) },
  ].filter(Boolean);
}

// ───────────────────────── workspaces: named window layouts (panes, tabs, widths, list view)

const WORKSPACE_KEYS = ['panes', 'view', 'thumbSize', 'sort', 'groupBy', 'caption'];
const currentLayout = () => JSON.parse(JSON.stringify(Object.fromEntries(WORKSPACE_KEYS.map((key) => [key, app.settings[key]]))));

function applyWorkspace(layout) {
  const s = app.settings;
  for (const key of WORKSPACE_KEYS) {
    if (layout[key] === undefined) continue;
    s[key] = typeof layout[key] === 'object' && layout[key] && !Array.isArray(layout[key]) ? { ...DEFAULT_SETTINGS[key], ...JSON.parse(JSON.stringify(layout[key])) } : layout[key];
  }
  // The drive shown in the folder pane is not part of a layout.
  s.panes.drive = s.panes.drive ?? null;
  app.saveSettings();
  if (app.state.mode !== 'manage') setMode('manage');
  layoutPanes();
  refreshList({ keepScroll: false });
  fileList.rebuild();
  renderToolbar();
}

async function saveWorkspace() {
  const name = await promptDialog(t('workspace.name'), '', { title: t('workspace.save'), validate: (v) => (!v.trim() ? t('file.nameEmpty') : null) });
  if (!name?.trim()) return;
  app.settings.workspaces = [...app.settings.workspaces.filter((w) => w.name !== name.trim()), { name: name.trim(), layout: currentLayout() }].sort((a, b) => a.name.localeCompare(b.name));
  app.saveSettings();
  toast(t('workspace.saved', { name: name.trim() }), 'success');
}

function workspaceMenu() {
  const list = app.settings.workspaces;
  const now = JSON.stringify(currentLayout());
  return [
    ...list.map((w, i) => ({ label: w.name, icon: 'panelLeft', shortcut: i < 9 ? `Ctrl+Alt+${i + 1}` : '', checked: JSON.stringify(w.layout) === now, action: () => applyWorkspace(w.layout) })),
    list.length ? 'separator' : null,
    { label: t('workspace.save'), icon: 'save', action: saveWorkspace },
    { label: t('workspace.default'), icon: 'refresh', action: () => applyWorkspace(Object.fromEntries(WORKSPACE_KEYS.map((key) => [key, DEFAULT_SETTINGS[key]]))) },
    list.length ? { label: t('workspace.delete'), icon: 'trash', submenu: list.map((w) => ({ label: w.name, icon: 'close', danger: true, action: () => { app.settings.workspaces = app.settings.workspaces.filter((x) => x !== w); app.saveSettings(); } })) } : null,
  ].filter(Boolean);
}

function viewMenu() {
  const s = app.settings;
  return [
    { label: t('workspace.title'), icon: 'panelLeft', submenu: workspaceMenu() },
    'separator',
    { label: t('start.title'), icon: 'home', checked: app.state.mode === 'start', action: () => showStart() },
    ...MODES.map(([id, iconName]) => ({ label: t(`mode.${id}`), icon: iconName, checked: app.state.mode === id, action: () => switchMode(id) })),
    'separator',
    { label: t('menu.viewStyle'), icon: 'grid', submenu: VIEW_STYLES.map(([id, iconName]) => ({ label: t(`viewStyle.${id}`), icon: iconName, checked: s.view === id, action: () => { s.view = id; app.saveSettings(); renderToolbar(); fileList.rebuild(); } })) },
    { label: t('toolbar.sort'), icon: 'sort', submenu: sortMenu() },
    { label: t('toolbar.group'), icon: 'layers', submenu: groupMenu() },
    { label: t('toolbar.filter'), icon: 'filter', submenu: filterMenu() },
    'separator',
    { label: t('toolbar.leftPane'), checked: s.panes.left, action: () => { s.panes.left = !s.panes.left; app.saveSettings(); layoutPanes(); } },
    { label: t('toolbar.rightPane'), checked: s.panes.right, action: () => { s.panes.right = !s.panes.right; app.saveSettings(); layoutPanes(); } },
    { label: t('toolbar.basket'), checked: s.panes.basket, action: () => { s.panes.basket = !s.panes.basket; app.saveSettings(); layoutPanes(); } },
    ...LEFT_TABS.map(([id, iconName]) => ({ label: t(`pane.${id}`), icon: iconName, action: () => showLeftTab(id) })),
    ...RIGHT_TABS.map(([id, iconName]) => ({ label: t(`pane.${id}`), icon: iconName, action: () => showRightTab(id) })),
    'separator',
    { label: t('nav.refresh'), icon: 'refresh', shortcut: 'F5', action: () => reload() },
    { label: t('view.slideshow'), icon: 'play', shortcut: 'Ctrl+Shift+S', action: slideshowFromManage },
  ];
}

function organizeMenu() {
  const paths = targetPaths({ filesOnly: true });
  const none = !paths.length;
  return [
    { label: t('organize.setRating'), icon: 'star', disabled: none, submenu: ratingSubmenu(paths) },
    { label: t('organize.setLabel'), icon: 'tag', disabled: none, submenu: labelSubmenu(paths) },
    { label: t('organize.tag'), icon: 'checkSquare', shortcut: '`', disabled: none, action: () => toggleTag(paths) },
    { label: t('organize.keywords'), icon: 'hash', disabled: none, action: () => { showRightTab('properties'); setTimeout(() => $('[data-field=keywords]')?.focus(), 50); } },
    'separator',
    { label: t('organize.addToBasket'), icon: 'basket', shortcut: 'Ctrl+B', disabled: none, action: () => addToBasket(paths) },
    { label: t('organize.showBasket'), icon: 'basket', action: () => openSource({ type: 'basket' }) },
    { label: t('organize.clearBasket'), icon: 'trash', disabled: !app.catalog.basket.length, action: () => app.catalog.clearBasket() },
    'separator',
    { label: t('collection.addTo'), icon: 'folderOpen', disabled: none, submenu: addToCollectionMenu(paths) },
    { label: t('collection.new'), icon: 'plus', action: () => newCollection(paths) },
    { label: t('collection.newSmart'), icon: 'wand', action: () => smartCollectionDialog() },
    'separator',
    { label: t('organize.showTagged'), icon: 'checkSquare', action: () => openSource({ type: 'filter', filters: [{ type: 'tagged' }], title: t('catalog.tagged') }) },
    { label: t('catalog.indexFolder'), icon: 'layers', disabled: !inFolder(), action: () => catalogFolder(app.state.source.path) },
    { label: t('gpx.menu'), icon: 'map', action: () => gpxGeotagDialog(none ? app.state.list.filter((i) => !i.isDir).map((i) => i.path) : paths) },
    'separator',
    { label: t('people.scanList'), icon: 'user', action: () => scanFaces(app.state.list) },
    { label: t('people.nameFaces'), icon: 'user', action: () => nameFacesDialog() },
    'separator',
    { label: t('metadata.editExif'), icon: 'info', disabled: none, action: () => exifEditor(paths) },
    { label: t('metadata.writeToFiles'), icon: 'save', disabled: none, action: () => writeMetadataCommand(paths) },
    { label: t('places.lookUp'), icon: 'mapPin', disabled: none, action: () => lookUpPlaces(paths) },
  ];
}

function toolsMenu() {
  const files = hasFiles();
  const paths = targetPaths({ filesOnly: true });
  return [
    { label: t('view.rotateLeft'), icon: 'rotateLeft', shortcut: 'Ctrl+[', disabled: !files, action: () => rotateAndRefresh(paths, -1) },
    { label: t('view.rotateRight'), icon: 'rotateRight', shortcut: 'Ctrl+]', disabled: !files, action: () => rotateAndRefresh(paths, 1) },
    { label: t('edit.flipH'), icon: 'flipH', disabled: !files, action: () => rotateFiles(paths, 0, 'h') },
    { label: t('edit.flipV'), icon: 'flipV', disabled: !files, action: () => rotateFiles(paths, 0, 'v') },
    'separator',
    { label: t('actions.menu'), icon: 'play', action: async () => (await import('./ui/actions.js')).actionsDialog(paths) },
    'separator',
    { label: t('tools.batchRename'), icon: 'rename', disabled: !files || !fs.caps.rename, action: () => batchRename() },
    { label: t('tools.batchResize'), icon: 'fit', disabled: !files, action: () => batchResize() },
    { label: t('tools.convert'), icon: 'images', disabled: !files, action: () => batchConvert() },
    { label: t('tools.autoAdjust'), icon: 'wand', disabled: !files, action: () => batchAdjust() },
    { label: t('tools.dates'), icon: 'clock', disabled: !files, action: () => adjustDates() },
    { label: t('tools.fileTime'), icon: 'clock', disabled: !files || !fs.caps.setTime, action: () => fileTimeFromTaken() },
    { label: t('tools.autoRotate'), icon: 'rotateRight', disabled: !files, action: () => autoRotate() },
    { label: t('tools.watermark'), icon: 'text', disabled: !files, action: () => batchWatermark() },
    { label: t('tools.applyPreset'), icon: 'bookmark', disabled: !files, action: () => batchApplyPreset() },
    'separator',
    { label: t('analysis.runFolder'), icon: 'wand', disabled: !files, action: () => analysis.analyze(app.state.list) },
    { label: t('analysis.rerun'), icon: 'refresh', disabled: !files, action: () => analysis.analyze(selectedFiles().length ? selectedFiles() : app.state.list, { force: true }) },
    { label: t('analysis.stop'), icon: 'close', disabled: !analysis.state().running, action: () => analysis.stopAnalysis() },
    { label: t('analysis.toFolders'), icon: 'layers', disabled: !files, action: async () => (await import('./ui/organize.js')).organizeDialog(app.state.list) },
    'separator',
    { label: t('tools.compare'), icon: 'compare', disabled: selectedFiles().length < 2, action: () => openCompare(selectedFiles()) },
    { label: t('tools.duplicates'), icon: 'layers', action: findDuplicates },
    { label: t('view.slideshow'), icon: 'play', action: slideshowFromManage },
    { label: t('file.print'), icon: 'print', action: () => printDialog(selectedFiles().length ? selectedFiles() : app.state.list) },
    'separator',
    { label: t('menu.settings'), icon: 'gear', shortcut: 'Ctrl+,', action: openSettings },
  ];
}

function helpMenu() {
  return [
    { label: t('shortcuts.title'), icon: 'keyboard', shortcut: 'F1', action: shortcutsDialog },
    { label: t('keys.title'), icon: 'keyboard', action: keymapDialog },
    { label: t('help.guide'), icon: 'help', action: () => fs.openUrl('https://github.com/knix008').catch(() => {}) },
    'separator',
    { label: t('about.title'), icon: 'info', action: aboutDialog },
  ];
}

function itemMenu(event, item) {
  const paths = targetPaths();
  const files = targetPaths({ filesOnly: true });
  const items = item ? [
    item.isDir ? { label: t('folders.open'), icon: 'folderOpen', action: () => openFolder(item.path) } : isArchive(item.name) ? { label: t('create.openZip'), icon: 'folderOpen', action: () => openArchive(item.path) } : { label: t('mode.view'), icon: 'eye', shortcut: 'Enter', action: () => viewItem(item.path) },
    !item.isDir && fs.caps.open ? { label: t('file.openWith'), icon: 'external', action: () => openWith(item.path) } : null,
    files.length ? { label: t('share.copyImage'), icon: 'copy', action: () => copyImageToClipboard(files[0]) } : null,
    files.length ? { label: t('share.share'), icon: 'upload', action: () => shareFiles(files) } : null,
    files.length && !isPrivatePath(item.path) ? { label: t('private.moveTo'), icon: 'lock', action: () => moveToPrivate(files) } : null,
    files.length && isPrivatePath(item.path) ? { label: t('private.restore'), icon: 'upload', action: () => restoreFromPrivate(files) } : null,
    files.length ? { label: t('metadata.editExif'), icon: 'info', action: () => exifEditor(files) } : null,
    !item.isDir && kindOf(item.name) === 'video' ? { label: t('trim.menu'), icon: 'scissors', action: async () => (await import('./ui/videotrim.js')).trimVideoDialog(item) } : null,
    !item.isDir && kindOf(item.name) !== 'video' ? { label: t('edit.editImage'), icon: 'pencil', shortcut: 'Ctrl+E', action: () => editPath(item.path) } : null,
    files.length && isDesktop() ? { label: t('external.editIn'), icon: 'external', submenu: externalEditorMenu(files) } : null,
    fs.caps.open ? { label: t('file.openExternal'), icon: 'external', action: () => fs.openExternal(item.path).catch((e) => toast(errorText(e), 'error')) } : null,
    fs.caps.reveal ? { label: t('file.reveal'), icon: 'reveal', action: () => fs.reveal(item.path).catch((e) => toast(errorText(e), 'error')) } : null,
    'separator',
    files.length ? { label: t('organize.setRating'), icon: 'star', submenu: ratingSubmenu(files) } : null,
    files.length ? { label: t('organize.setLabel'), icon: 'tag', submenu: labelSubmenu(files) } : null,
    files.length ? { label: t('organize.tag'), icon: 'checkSquare', shortcut: '`', action: () => toggleTag(files) } : null,
    files.length ? { label: t('organize.addToBasket'), icon: 'basket', action: () => addToBasket(files) } : null,
    app.state.source.type === 'basket' ? { label: t('organize.removeFromBasket'), icon: 'close', action: () => { app.catalog.removeFromBasket(files); reload(); } } : null,
    files.length ? { label: t('collection.addTo'), icon: 'folderOpen', submenu: addToCollectionMenu(files.map((f) => f.path ?? f)) } : null,
    app.state.source.type === 'collection' && !app.catalog.collection(app.state.source.id)?.smart ? { label: t('collection.removeFrom'), icon: 'close', action: () => app.catalog.removeFromCollection(app.state.source.id, files.map((f) => f.path ?? f)) } : null,
    files.length ? { label: t('view.rotateLeft'), icon: 'rotateLeft', action: () => rotateAndRefresh(files, -1) } : null,
    files.length ? { label: t('view.rotateRight'), icon: 'rotateRight', action: () => rotateAndRefresh(files, 1) } : null,
    'separator',
    { label: t('edit.cut'), icon: 'scissors', shortcut: 'Ctrl+X', disabled: !fs.caps.move, action: () => copyToClipboard(true) },
    { label: t('edit.copy'), icon: 'copy', shortcut: 'Ctrl+C', disabled: !fs.caps.write, action: () => copyToClipboard(false) },
    { label: t('file.copyTo'), icon: 'copy', disabled: !fs.caps.write, action: () => copyMoveTo(false) },
    { label: t('file.moveTo'), icon: 'move', disabled: !fs.caps.move, action: () => copyMoveTo(true) },
    { label: t('file.rename'), icon: 'rename', shortcut: 'F2', disabled: !fs.caps.rename, action: renameSelection },
    { label: t('file.delete'), icon: 'trash', shortcut: 'Del', danger: true, action: () => deleteItems(paths) },
    'separator',
    files.length >= 2 && files.length <= 4 ? { label: t('tools.compare'), icon: 'compare', action: () => openCompare(selectedFiles()) } : null,
    files.length ? { label: t('menu.batch'), icon: 'layers', submenu: [
      { label: t('tools.batchRename'), icon: 'rename', action: () => batchRename(files), disabled: !fs.caps.rename },
      { label: t('tools.batchResize'), icon: 'fit', action: () => batchResize(files) },
      { label: t('tools.convert'), icon: 'images', action: () => batchConvert(files) },
      { label: t('tools.autoAdjust'), icon: 'wand', action: () => batchAdjust(files) },
      { label: t('tools.dates'), icon: 'clock', action: () => adjustDates(files) },
    ] } : null,
    files.length ? { label: t('view.slideshow'), icon: 'play', action: () => startSlideshow(selectedFiles().length > 1 ? selectedFiles() : viewableList(), selectedFiles().length > 1 ? 0 : Math.max(0, viewableList().findIndex((i) => i.path === item.path))) } : null,
    files.length ? { label: t('file.print'), icon: 'print', action: () => printDialog(selectedFiles()) } : null,
    files.length && fs.caps.wallpaper ? { label: t('file.wallpaper'), icon: 'wallpaper', action: setWallpaper } : null,
    item.isDir ? { label: t('catalog.indexFolder'), icon: 'layers', action: () => catalogFolder(item.path) } : null,
  ] : [
    { label: t('edit.paste'), icon: 'clipboard', shortcut: 'Ctrl+V', disabled: !app.state.clipboard || !inFolder(), action: pasteClipboard },
    { label: t('file.newFolder'), icon: 'folderPlus', disabled: !inFolder() || !fs.caps.mkdir, action: newFolder },
    'separator',
    { label: t('edit.selectAll'), icon: 'checkSquare', shortcut: 'Ctrl+A', action: selectAll },
    { label: t('toolbar.sort'), icon: 'sort', submenu: sortMenu() },
    { label: t('toolbar.group'), icon: 'layers', submenu: groupMenu() },
    { label: t('menu.viewStyle'), icon: 'grid', submenu: VIEW_STYLES.map(([id, iconName]) => ({ label: t(`viewStyle.${id}`), icon: iconName, checked: app.settings.view === id, action: () => { app.settings.view = id; app.saveSettings(); renderToolbar(); fileList.rebuild(); } })) },
    { label: t('nav.refresh'), icon: 'refresh', shortcut: 'F5', action: () => reload() },
    inFolder() ? { label: t('catalog.indexFolder'), icon: 'layers', action: () => catalogFolder(app.state.source.path) } : null,
  ];
  contextMenu(event, cleanSeparators(items.filter(Boolean)));
}

function cleanSeparators(items) {
  const out = [];
  for (const item of items) {
    if (item === 'separator' && (!out.length || out[out.length - 1] === 'separator')) continue;
    out.push(item);
  }
  while (out[out.length - 1] === 'separator') out.pop();
  return out;
}

// ───────────────────────── actions

async function renameSelection() {
  const paths = targetPaths();
  if (paths.length > 1) batchRename(targetPaths({ filesOnly: true }));
  else renameItem(paths[0]);
}

async function rotateAndRefresh(paths, turns) {
  await rotateFiles(paths, turns);
  if (app.state.mode === 'view') viewer.reloadCurrent();
}

async function setWallpaper() {
  const path = targetPaths({ filesOnly: true })[0];
  try { await fs.setWallpaper(path); toast(t('file.wallpaperSet'), 'success'); } catch (error) { toast(errorText(error), 'error', 6000); }
}

async function restoreOriginals() {
  const paths = targetPaths({ filesOnly: true });
  const flags = await fs.hasOriginals(paths);
  const restorable = paths.filter((_, i) => flags[i]);
  if (!restorable.length) { toast(t('edit.noOriginal'), 'info'); return; }
  if (!(await confirmDialog(plural('edit.restoreConfirm', restorable.length), { ok: t('edit.restoreOriginal') }))) return;
  for (const path of restorable) {
    try { await fs.restoreOriginal(path); app.catalog.markEdited(path, false); thumbs.invalidate(path); fs.releaseUrl?.(path); } catch (error) { toast(errorText(error), 'error'); }
  }
  await reload();
  toast(t('edit.restored'), 'success');
}

function slideshowFromManage() {
  const selected = selectedFiles();
  if (selected.length > 1) startSlideshow(selected, 0);
  else startSlideshow(viewableList(), Math.max(0, viewableList().findIndex((i) => i.path === app.state.focus)));
}

async function openSettings() {
  await settingsDialog({
    onApply: () => {
      setLanguage(app.settings.language);
      setColorManagement(app.settings.colorManagement);
      viewer.forgetDecoded();
      viewer.dicom.refresh();
      updateTheme();
      reload();
      renderAll();
    },
  });
}

async function quit() {
  if (!(await leaveEditor())) return;
  await saveCatalogNow();
  await thumbs.flush().catch(() => {});
  invoke('quit_app');
}

// ───────────────────────── opening (desktop dialogs, web folders, drops)

async function openFolderDialog() {
  if (isDesktop()) {
    const dir = await chooseFolder(app.state.source.path);
    if (dir) openFolder(dir);
  } else {
    openWebFolder();
  }
}

async function openFilesDesktop() {
  const files = await chooseFiles([{ name: t('file.mediaFiles'), extensions: MEDIA_EXTENSIONS }]);
  if (files.length) openPaths(files);
}

async function openWebFolder({ input = false } = {}) {
  try {
    if (hasFolderAccess() && !input) {
      const path = await webFs.openFolder();
      if (path) { await folderPane.render(); openFolder(path); }
      return;
    }
    const files = await pickInput({ directory: true });
    if (!files.length) return;
    const name = files[0].webkitRelativePath?.split('/')[0] || t('web.folder');
    const path = webFs.addMemoryFolder(name, files.filter((f) => isMedia(f.name)).map((file) => ({ file, relativePath: file.webkitRelativePath })), { stripRoot: true });
    await folderPane.render();
    openFolder(path);
  } catch (error) {
    toast(errorText(error), 'error');
  }
}

async function openWebFiles() {
  const files = await pickInput({ multiple: true });
  const media = files.filter((f) => isMedia(f.name) || isArchive(f.name)); // ZIP/CBZ open like folders
  if (!media.length) return;
  const path = webFs.addMemoryFolder(t('web.openedFiles'), media.map((file) => ({ file, relativePath: file.name })));
  await folderPane.render();
  openFolder(path);
}

function pickInput({ directory = false, multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', multiple: multiple || directory, accept: directory ? undefined : [...MEDIA_EXTENSIONS, ...ARCHIVES].map((e) => `.${e}`).join(','), style: { display: 'none' }, id: directory ? 'web-folder-input' : 'web-files-input' });
    if (directory) input.webkitdirectory = true;
    input.addEventListener('change', () => { resolve([...(input.files ?? [])]); input.remove(); });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

/** Sample photos shipped with the web build (public/samples). */
async function openSamples() {
  try {
    const list = await (await fetch('./samples/index.json')).json();
    const files = await Promise.all(list.map(async (name) => {
      const blob = await (await fetch(`./samples/${name}`)).blob();
      return { file: new File([blob], name, { lastModified: Date.now() }), relativePath: name };
    }));
    const path = webFs.addMemoryFolder(t('web.samples'), files);
    await folderPane.render();
    await openFolder(path);
  } catch (error) {
    toast(errorText(error), 'error');
  }
}

/** Opens images or folders given by the OS (command line, "Open with", drops). */
async function openPaths(paths) {
  if (!paths.length) return;
  const stats = await fs.stat(paths);
  const first = paths[0];
  if (stats[0]?.isDir) { await openFolder(first); return; }
  await openFolder(parentOf(first), { select: paths });
  if (isMedia(first)) viewItem(first);
}

// Web: drag and drop of folders / files from the OS.
if (!isDesktop()) {
  let depth = 0;
  window.addEventListener('dragenter', (event) => { if (event.dataTransfer?.types?.includes('Files')) { depth++; document.body.classList.add('dropping'); } });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove('dropping'); });
  window.addEventListener('dragover', (event) => { if (event.dataTransfer?.types?.includes('Files')) event.preventDefault(); });
  window.addEventListener('drop', async (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    depth = 0;
    document.body.classList.remove('dropping');
    const { folders, files } = await filesFromDrop(event.dataTransfer);
    let target = folders[0];
    if (files.length) target = webFs.addMemoryFolder(t('web.droppedFiles'), files.filter(({ file }) => isMedia(file.name)));
    await folderPane.render();
    if (target) openFolder(target);
  });
}

// ───────────────────────── basket bar, status bar, welcome

function renderBasket() {
  clear(basketBar);
  if (basketBar.hidden) return;
  const paths = app.catalog.basket;
  basketBar.dataset.drop = '__basket__';
  const strip = h('div.basket-strip', paths.length ? paths.map((path) => {
    const item = { path, name: path.split(/[\\/]/).pop(), size: app.catalog.get(path)?.size ?? 0, modified: app.catalog.get(path)?.modified ?? 0 };
    const img = h('img', { alt: '', title: path, draggable: false });
    const cached = thumbs.peek(item);
    if (cached?.url) img.src = cached.url; else thumbs.get(item, 1).then((r) => { if (r?.url) img.src = r.url; });
    const cell = h('div.basket-cell', img, h('button.basket-remove', { type: 'button', title: t('organize.removeFromBasket'), html: icon('close'), onclick: () => app.catalog.removeFromBasket([path]) }));
    cell.addEventListener('dblclick', () => openSource({ type: 'basket' }, { select: [path] }));
    return cell;
  }) : h('div.basket-empty', t('basket.empty')));
  basketBar.append(h('div.basket-head', h('span', { html: icon('basket') }), h('span', plural('basket.count', paths.length)),
    h('button.btn.small', { type: 'button', onclick: () => openSource({ type: 'basket' }), disabled: !paths.length }, t('basket.show')),
    h('button.btn.small', { type: 'button', onclick: () => app.catalog.clearBasket(), disabled: !paths.length }, t('basket.clear'))), strip);
}

let thumbsRemaining = 0;
function renderStatus() {
  clear(statusBar);
  const { list, selection } = app.state;
  const files = list.filter((i) => !i.isDir);
  const selected = selectedItems();
  const selectedSize = selected.reduce((s, i) => s + (i.size ?? 0), 0);
  statusBar.append(
    h('span.status-item', plural('status.items', list.length), files.length !== list.length ? ` (${plural('status.files', files.length)})` : ''),
    selection.size ? h('span.status-item', plural('status.selected', selection.size), selectedSize ? ` · ${formatBytes(selectedSize)}` : '') : '',
    app.state.listFilter.rating || app.state.listFilter.label || app.state.listFilter.tagged || app.state.listFilter.kinds ? h('span.status-item.warn', t('status.filtered', { n: app.state.items.length - list.length })) : '',
    h('span.status-spacer'),
    thumbsRemaining ? h('span.status-item.status-progress', { id: 'status-thumbs' }, h('span.spinner-dot'), t('status.thumbnailsOf', { done: thumbsTotal - thumbsRemaining, total: thumbsTotal }), h('span.status-percent', `${Math.round(((thumbsTotal - thumbsRemaining) / Math.max(1, thumbsTotal)) * 100)}%`), h('span.status-meter', h('span', { style: { width: `${Math.round(((thumbsTotal - thumbsRemaining) / Math.max(1, thumbsTotal)) * 100)}%` } }))) : '',
    app.state.loading ? h('span.status-item.status-progress', { id: 'status-loading' }, h('span.spinner-dot'), t('list.loading'), h('span.status-meter.indeterminate', h('span', { style: { width: '40%' } }))) : '',
    statusTask(),
    app.state.source.type === 'folder' ? h('span.status-item.path', { title: app.state.source.path }, app.state.source.path.replace(/^@\d+:/, '')) : '',
    fs.kind === 'web' && app.state.source.type === 'folder' && webFs.isReadOnly(app.state.source.path) ? h('span.status-item.warn', t('web.readOnly')) : '',
    // Bottom-right corner: drag to resize the window.
    isDesktop() ? h('span.resize-grip', { title: t('status.resize'), 'aria-hidden': 'true', onpointerdown: (event) => { event.preventDefault(); startWindowResize(); } }) : '');
}

let thumbsTotal = 0;
thumbs.onProgress = (remaining, total = remaining) => {
  const before = thumbsRemaining;
  const prevPct = thumbsTotal ? Math.round(((thumbsTotal - before) / thumbsTotal) * 100) : -1;
  thumbsRemaining = remaining;
  thumbsTotal = Math.max(total, remaining);
  const pct = thumbsTotal ? Math.round(((thumbsTotal - remaining) / thumbsTotal) * 100) : 0;
  if (Boolean(before) !== Boolean(remaining) || pct !== prevPct) renderStatus();
};

/** The running background task (progress dialogs, slow picture loads) in the status bar. */
function statusTask() {
  const task = statusProgress.current();
  if (!task) return '';
  const percent = task.total ? Math.round((task.done / task.total) * 100) : null;
  return h('span.status-item.status-progress', { id: 'status-task', title: task.text || task.title }, h('span.spinner-dot'),
    task.total ? `${task.title} ${task.done}/${task.total}` : task.title,
    percent != null ? h('span.status-percent', `${percent}%`) : '',
    h(`span.status-meter${percent == null ? '.indeterminate' : ''}`, h('span', { style: { width: `${percent ?? 40}%` } })));
}
statusProgress.onChange(() => renderStatus());

function renderWelcome() {
  const show = app.state.source.type === 'welcome';
  welcome.hidden = !show;
  fileList.el.hidden = show;
  if (!show) return;
  clear(welcome);
  welcome.append(
    h('div.welcome-card',
      h('img.welcome-icon', { src: './icon-192.png', alt: '' }),
      h('h1', t('app.name')),
      h('p', t('welcome.tagline')),
      h('div.welcome-actions',
        h('button.btn.primary.large', { type: 'button', id: 'welcome-open-folder', onclick: () => (isDesktop() ? openFolderDialog() : openWebFolder()) }, h('span', { html: icon('folderOpen') }), t('file.openFolder')),
        !isDesktop() ? h('button.btn.large', { type: 'button', id: 'welcome-open-files', onclick: openWebFiles }, h('span', { html: icon('images') }), t('web.openFiles')) : null,
        !isDesktop() ? h('button.btn.large', { type: 'button', id: 'welcome-samples', onclick: openSamples }, h('span', { html: icon('starFill') }), t('web.samples')) : null),
      !isDesktop() ? h('p.hint', hasFolderAccess() ? t('web.hintAccess') : t('web.hintReadOnly')) : null,
      h('p.hint', t('welcome.drop'))));
}

function updateTitle() {
  const { source } = app.state;
  const where = source.type === 'folder' ? source.path.replace(/^@\d+:/, '') : source.title ?? (source.type === 'basket' ? t('catalog.basket') : '');
  setWindowTitle(where ? `${where} - MyPhotoManager` : 'MyPhotoManager');
}

function renderAll() {
  renderHeader();
  layoutPanes();
  renderWelcome();
  renderStatus();
  fileList.rebuild();
}

app.on('source', () => {
  if (!keepStart && (app.state.mode === 'dashboard' || app.state.mode === 'view' || app.state.mode === 'start')) setMode('manage');
  renderWelcome();
  renderToolbar();
  renderStatus();
  updateTitle();
});
app.on('items', () => { renderStatus(); renderToolbar(); analysis.autoAnalyze(); });
app.on('selection', renderStatus);
app.on('resort', () => { refreshList(); renderToolbar(); });
const reloadCollection = debounce(() => { if (app.state.source.type === 'collection') reload(); }, 150);
app.on('catalog', (change) => {
  if (['basket'].includes(change?.what) || !change?.what) renderBasket();
  // A collection on screen changed (or, for a smart one, what its rules look at): list it again.
  const source = app.state.source;
  if (source.type === 'collection' && (change?.what === 'collections' || (app.catalog.collection(source.id)?.smart && ['rating', 'label', 'tagged', 'organize', 'fields', 'people', 'keywords', 'categories'].includes(change?.what)))) reloadCollection();
  // Sorting or filtering by what changed: rebuild the order.
  const s = app.settings;
  if ((['rating', 'label', 'tagged'].includes(change?.what) && (['rating', 'label'].includes(s.sort.key) || ['rating', 'label'].includes(s.groupBy) || app.state.listFilter.rating || app.state.listFilter.label || app.state.listFilter.tagged))) {
    rebuildList();
    app.emit('items', {});
  }
});
app.on('settings', () => {});
app.on('roots-changed', () => folderPane.render());
app.on('open-archive', (path) => openArchive(path));
onLanguageChange(() => {
  renderAll();
  // Re-opening the viewer would load app.state.viewPath again and replace the picture on screen.
  if (app.state.mode === 'view') viewer.relabel();
  else if (app.state.mode !== 'manage') app.emit('mode', app.state.mode);
});

// ───────────────────────── keyboard

document.addEventListener('keydown', async (event) => {
  // Already handled below (e.g. Enter in the file list opened the viewer): not again for the new mode.
  if (event.defaultPrevented) return;
  if (dialogOpen() || menuOpen() || document.body.classList.contains('slideshow-on') || document.querySelector('.compare')) return;
  const ctrl = event.ctrlKey || event.metaKey;
  const key = event.key;
  if (key === 'F1') { event.preventDefault(); shortcutsDialog(); return; }
  if (ctrl && key === ',') { event.preventDefault(); openSettings(); return; }
  if (app.state.mode === 'edit') { if (editor.onKey(event)) event.preventDefault(); return; }
  if (typing(event)) return;
  if (app.state.mode === 'view') {
    if (ctrl && /^[0-5]$/.test(key)) { event.preventDefault(); rate(Number(key), [viewer.currentPath]); return; }
    if (event.altKey && event.shiftKey && !ctrl && /^Digit[1-9]$/.test(event.code)) { event.preventDefault(); quickKeyword(Number(event.code.slice(5)), [viewer.currentPath]); return; }
    if (event.altKey && /^[0-5]$/.test(key)) { event.preventDefault(); setLabel(key === '0' ? null : LABELS[Number(key) - 1], [viewer.currentPath]); return; }
    if (key === '`') { event.preventDefault(); toggleTag([viewer.currentPath]); return; }
    if (ctrl && (key === '[' || key === ']')) { event.preventDefault(); rotateAndRefresh([viewer.currentPath], key === ']' ? 1 : -1); return; }
    if (ctrl && key.toLowerCase() === 'e') { event.preventDefault(); editPath(viewer.currentPath); return; }
    if (viewer.onKey(event)) event.preventDefault();
    return;
  }
  if (app.state.mode === 'dashboard') { if (key === 'Escape') setMode('manage'); return; }
  // Manage mode.
  const handled = () => event.preventDefault();
  if (event.altKey && ctrl && /^Digit[1-9]$/.test(event.code) && app.settings.workspaces[Number(event.code.slice(5)) - 1]) { handled(); applyWorkspace(app.settings.workspaces[Number(event.code.slice(5)) - 1].layout); return; }
  if (ctrl && /^[0-5]$/.test(key)) { handled(); rate(Number(key)); return; }
  if (event.altKey && event.shiftKey && !ctrl && /^Digit[1-9]$/.test(event.code)) { handled(); quickKeyword(Number(event.code.slice(5)), targetPaths()); return; }
  if (event.altKey && /^[0-5]$/.test(key)) { handled(); setLabel(key === '0' ? null : LABELS[Number(key) - 1]); return; }
  if (key === '`' && !ctrl) { handled(); toggleTag(); return; }
  const command = commandFor(event);
  if (command) { handled(); command.run(); return; }
  if (key === 'Escape' && app.state.source.type !== 'folder' && app.state.history.back.length) { handled(); goBack(); }
});

// Manage-mode commands with their default keys (users can reassign them: Help → Customize shortcuts).
async function undoFileOp() {
  try {
    const step = await undoHistory.undo();
    if (step) toast(t('undo.undone', { label: step.label }), 'info', 1600);
  } catch (error) {
    toast(errorText(error), 'error', 6000);
  }
}

async function redoFileOp() {
  try {
    const step = await undoHistory.redo();
    if (step) toast(t('undo.redone', { label: step.label }), 'info', 1600);
  } catch (error) {
    toast(errorText(error), 'error', 6000);
  }
}

undoHistory.onChange(() => { if (app.state.mode === 'manage') renderToolbar(); });

registerCommands([
  { id: 'undo', label: 'undo.undo', key: 'Ctrl+Z', run: undoFileOp },
  { id: 'redo', label: 'undo.redo', key: 'Ctrl+Y', run: redoFileOp },
  { id: 'redoAlt', label: 'undo.redo', key: 'Ctrl+Shift+Z', run: redoFileOp },
  { id: 'selectAll', label: 'edit.selectAll', key: 'Ctrl+A', run: selectAll },
  { id: 'selectNone', label: 'edit.selectNone', key: 'Ctrl+D', run: selectNone },
  { id: 'invertSelection', label: 'edit.invertSelection', key: 'Ctrl+I', run: invertSelection },
  { id: 'copy', label: 'edit.copy', key: 'Ctrl+C', run: () => copyToClipboard(false) },
  { id: 'cut', label: 'edit.cut', key: 'Ctrl+X', run: () => copyToClipboard(true) },
  { id: 'paste', label: 'edit.paste', key: 'Ctrl+V', run: pasteClipboard },
  { id: 'basket', label: 'organize.addToBasket', key: 'Ctrl+B', run: () => addToBasket() },
  { id: 'edit', label: 'edit.editImage', key: 'Ctrl+E', run: () => switchMode('edit') },
  { id: 'externalEdit', label: 'external.editFirst', key: 'Ctrl+Shift+E', run: () => { const [first] = externalEditors(); if (first) openInEditor(first, targetPaths({ filesOnly: true })); else toast(t('external.none'), 'info'); } },
  { id: 'open', label: 'file.openFolder', key: 'Ctrl+O', run: openFolderDialog },
  { id: 'print', label: 'file.print', key: 'Ctrl+P', run: () => printDialog(selectedFiles().length ? selectedFiles() : app.state.list) },
  { id: 'search', label: 'shortcut.search', key: 'Ctrl+F', run: () => document.querySelector('#quick-search')?.focus() },
  { id: 'newFolder', label: 'file.newFolder', key: 'Ctrl+Shift+N', run: newFolder },
  { id: 'slideshow', label: 'view.slideshow', key: 'Ctrl+Shift+S', run: slideshowFromManage },
  { id: 'import', label: 'import.title', key: 'Ctrl+Shift+I', run: importDialog },
  { id: 'copyImage', label: 'share.copyImage', key: 'Ctrl+Shift+C', run: () => copyImageToClipboard(targetPaths({ filesOnly: true })[0]) },
  { id: 'rotateLeft', label: 'view.rotateLeft', key: 'Ctrl+[', run: () => rotateAndRefresh(targetPaths({ filesOnly: true }), -1) },
  { id: 'rotateRight', label: 'view.rotateRight', key: 'Ctrl+]', run: () => rotateAndRefresh(targetPaths({ filesOnly: true }), 1) },
  { id: 'back', label: 'nav.back', key: 'Alt+ArrowLeft', run: goBack },
  { id: 'forward', label: 'nav.forward', key: 'Alt+ArrowRight', run: goForward },
  { id: 'up', label: 'nav.up', key: 'Backspace', run: goUp },
  { id: 'upAlt', label: 'nav.up', key: 'Alt+ArrowUp', run: goUp },
  { id: 'refresh', label: 'nav.refresh', key: 'F5', run: () => reload() },
  { id: 'rename', label: 'file.rename', key: 'F2', run: () => renameSelection() },
  { id: 'delete', label: 'file.delete', key: 'Delete', run: () => deleteItems() },
  { id: 'compare', label: 'tools.compare', key: 'Ctrl+Shift+M', run: () => openCompare(selectedFiles()) },
  { id: 'exif', label: 'metadata.editExif', key: '', run: () => exifEditor() },
  { id: 'writeMeta', label: 'metadata.writeToFiles', key: '', run: () => writeMetadataCommand() },
  { id: 'private', label: 'private.open', key: '', run: openPrivateFolder },
  { id: 'people', label: 'people.scanList', key: '', run: () => scanFaces(app.state.list) },
  { id: 'dashboard', label: 'mode.dashboard', key: 'Ctrl+Shift+D', run: () => switchMode('dashboard') },
]);

// Typing in the catalog of Tauri: Ctrl+R / F5 must not reload the page.
window.addEventListener('beforeunload', () => { saveCatalogNow(); });

// ───────────────────────── start-up

async function start() {
  setColorManagement(app.settings.colorManagement);
  updateTheme();
  if (isDesktop()) {
    const fileSettings = await loadSettingsFile();
    if (fileSettings) { app.settings = fileSettings; setLanguage(app.settings.language); updateTheme(); }
    invoke('set_language', { language: getLanguage() }).catch(() => {});
    onLanguageChange((language) => invoke('set_language', { language }).catch(() => {}));
  } else {
    await webFs.restore();
  }
  await loadCatalog();
  modeHost.append(manage);
  document.body.dataset.mode = 'manage';
  renderAll();
  await folderPane.render();
  const startup = isDesktop() ? await invoke('startup_paths').catch(() => []) : [];
  if (!startup.length) setMode('start');
  showWindow();

  // What to show first. A folder opened for the command line replaces the start page.
  let opened = false;
  if (isDesktop()) {
    const paths = startup;
    if (paths.length) { await openPaths(paths); opened = true; }
    listen('open-paths', (list) => openPaths(list));
    onFileDrop(async (paths) => {
      const stats = await fs.stat(paths);
      if (app.state.source.type === 'folder' && !stats.some((s) => s?.isDir) && (await confirmDialog(plural('drop.copyHere', paths.length), { ok: t('drop.copy') }))) {
        await transfer(paths, app.state.source.path, { move: false });
      } else {
        openPaths(paths);
      }
    }, (hover) => document.body.classList.toggle('dropping', hover));
    listen('fatal-error', (error) => toast(`${error.message} (${error.location})`, 'error', 15000));
    if (!opened) {
      const places = await fs.places().catch(() => []);
      const pick = (kind) => places.find((p) => p.kind === kind)?.path;
      const candidates = app.settings.startup === 'last' ? [app.settings.lastFolder, pick('pictures'), pick('home')] : app.settings.startup === 'pictures' ? [pick('pictures'), pick('home')] : [pick('home')];
      keepStart = true;
      try {
        for (const folder of candidates.filter(Boolean)) {
          try { await openFolder(folder, { history: false }); opened = true; break; } catch { /* try the next */ }
        }
      } finally { keepStart = false; }
      if (!opened || app.state.error) { app.state.source = { type: 'welcome' }; renderAll(); }
    }
  } else {
    const places = await fs.places();
    const last = places.find((p) => p.path === app.settings.lastFolder && p.granted) ?? places.find((p) => p.granted);
    keepStart = true;
    try {
      if (last) await openFolder(app.settings.lastFolder && app.settings.lastFolder.startsWith(last.path) ? app.settings.lastFolder : last.path, { history: false }).catch(() => {});
    } finally { keepStart = false; }
    if (app.state.error) { app.state.source = { type: 'welcome' }; renderAll(); }
  }
  if (app.state.mode !== 'start') fileList.focus();
  const warmStart = () => startPage.warm();
  if (typeof requestIdleCallback === 'function') requestIdleCallback(warmStart, { timeout: 1500 });
  else setTimeout(warmStart, 400);
  document.body.classList.add('ready');
}

// Runs a menu item the way a click would: menu('organize', 'people.scanList'),
// submenus by more keys. Fails when the item is missing or disabled.
const MENUS = { file: fileMenu, edit: editMenu, view: viewMenu, organize: organizeMenu, create: createMenu, tools: toolsMenu, help: helpMenu, private: privateMenu };
function runMenu(menuId, ...keys) {
  let items = MENUS[menuId]();
  for (const [i, key] of keys.entries()) {
    const item = items.filter((x) => x && typeof x === 'object').find((x) => x.label === t(key));
    if (!item) throw new Error(`menu item not found: ${menuId} › ${keys.slice(0, i + 1).join(' › ')}`);
    if (item.disabled) throw new Error(`menu item disabled: ${key}`);
    if (i === keys.length - 1) return item.action?.();
    items = item.submenu;
  }
  return undefined;
}

// Test hook (E2E): the app's state and actions.
const minWidth = watchMinWidth();
globalThis.__myphoto = { app, t, minWidth, analysis, organizer: () => import('./ui/organize.js'), actions: { openFolder, openSource, openPaths, selectItem, setSelection, setMode, viewItem, rate, setLabel, toggleTag, reload, openSamples, editPath, switchMode, showLeftTab, showRightTab }, menu: runMenu, fs, viewer, topDialog, dq: (selector) => { for (const doc of dialogDocuments().reverse()) { const el = doc.querySelector(selector); if (el) return el; } return null; }, dqa: (selector) => dialogDocuments().flatMap((doc) => [...doc.querySelectorAll(selector)]), editor, thumbs, closeAllDialogs, fileList, mapPane };

start().catch((error) => {
  console.error(error);
  toast(errorText(error), 'error', 15000);
  showWindow();
});
