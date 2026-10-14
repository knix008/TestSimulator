// The application shell: menu bar, mode switcher, toolbar, panes, file list,
// status bar, the View / Edit / Dashboard modes, keyboard shortcuts, opening
// folders (desktop dialogs, web folder access, drag and drop) and start-up.
import { LABEL_COLORS, LABELS, parentOf } from './catalog/catalog.js';
import { GROUP_KEYS, SORT_KEYS } from './catalog/listing.js';
import { ARCHIVES, isArchive, isMedia, kindOf, MEDIA_EXTENSIONS } from './formats/types.js';
import { getLanguage, onLanguageChange, plural, setLanguage, t } from './i18n.js';
import { filesFromDrop, fs, hasFolderAccess, webFs } from './platform/fs.js';
import { chooseFiles, chooseFolder, errorText, invoke, isDesktop, listen, onFileDrop, setWindowTheme, setWindowTitle, showWindow } from './platform/native.js';
import { loadSettings, loadSettingsFile } from './settings.js';
import {
  addToBasket, app, catalogFolder, copyToClipboard, deleteItems, focusedItem, goBack, goForward, goUp, invertSelection, loadCatalog, newFolder, openFolder, openSource,
  pasteClipboard, rate, rebuildList, refreshList, reload, renameItem, saveCatalogNow, selectAll, selectedFiles, selectedItems, selectFilesOnly, selectItem, selectNone,
  setLabel, setMode, setSelection, targetPaths, toggleTag, transfer, viewableList, viewItem,
} from './store.js';
import { thumbs } from './thumbs/thumbs.js';
import { aboutDialog, settingsDialog, shortcutsDialog } from './ui/appdialogs.js';
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
import { closeAllDialogs, confirmDialog, dialogOpen, openDialog, toast } from './ui/dialog.js';
import { $, button, clear, h, typing } from './ui/dom.js';
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
import { createViewer } from './ui/viewer.js';
import { formatBytes } from './util/format.js';
import { applyTheme } from './themes.js';

app.settings = loadSettings();
setLanguage(app.settings.language);

// ───────────────────────── theme

const darkQuery = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
function currentTheme() {
  return app.settings.theme === 'system' ? (darkQuery?.matches ? 'dark' : 'light') : app.settings.theme;
}
function updateTheme() {
  const theme = currentTheme();
  applyTheme(theme);
  setWindowTheme(theme === 'dark');
}
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
center.append(welcome, fileList.filmPreview, fileList.el, basketBar);

const folderPane = createFolderPane({ onOpenWebFolder: openWebFolder, onOpenWebFiles: openWebFiles, folderMenuItems: () => [] });
const catalogPane = createCatalogPane();
const calendarPane = createCalendarPane();
const searchPane = createSearchPane();
const propertiesPane = createPropertiesPane({ onShowOnMap: () => showRightTab('map') });
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
const dashboard = createDashboard();

const peoplePane = createPeoplePane();
const LEFT_TABS = [['folders', 'folder', folderPane], ['catalog', 'bookmark', catalogPane], ['people', 'user', peoplePane], ['calendar', 'calendar', calendarPane], ['search', 'search', searchPane]];
const RIGHT_TABS = [['properties', 'info', propertiesPane], ['preview', 'image', previewPane], ['map', 'map', mapPane]];

function tabs(container, list, current, onPick) {
  clear(container);
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
  app.saveSettings();
  layoutPanes();
}

function showRightTab(id) {
  app.settings.panes.rightTab = id;
  app.settings.panes.right = true;
  app.saveSettings();
  layoutPanes();
}

function layoutPanes() {
  const p = app.settings.panes;
  leftPane.hidden = !p.left;
  rightPane.hidden = !p.right;
  manage.querySelector('[data-side=left]').hidden = !p.left;
  manage.querySelector('[data-side=right]').hidden = !p.right;
  leftPane.style.width = `${p.leftWidth}px`;
  rightPane.style.width = `${p.rightWidth}px`;
  if (p.left) tabs(leftPane, LEFT_TABS, p.leftTab, showLeftTab);
  if (p.right) tabs(rightPane, RIGHT_TABS, p.rightTab, showRightTab);
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
    { id: 'file', label: t('menu.file'), items: fileMenu },
    { id: 'edit', label: t('menu.edit'), items: editMenu },
    { id: 'view', label: t('menu.view'), items: viewMenu },
    { id: 'organize', label: t('menu.organize'), items: organizeMenu },
    { id: 'create', label: t('menu.create'), items: createMenu },
    { id: 'tools', label: t('menu.tools'), items: toolsMenu },
    { id: 'help', label: t('menu.help'), items: helpMenu },
  ]);
  const modes = h('div.mode-switch', { role: 'tablist' }, MODES.map(([id, iconName]) => h(`button.mode-button${app.state.mode === id ? '.on' : ''}`, {
    type: 'button', role: 'tab', dataset: { mode: id }, title: t(`mode.${id}`), onclick: () => switchMode(id),
  }, h('span', { html: icon(iconName) }), h('span.mode-label', t(`mode.${id}`)))));
  const right = h('div.header-right',
    h('button.tool', { type: 'button', title: t('menu.theme'), html: icon(currentTheme() === 'dark' ? 'moon' : 'sun'), onclick: (e) => themeMenu(e.currentTarget) }),
    h('button.tool', { type: 'button', title: t('menu.language'), html: icon('globe'), onclick: (e) => languageMenu(e.currentTarget) }),
    h('button.tool', { type: 'button', title: t('menu.settings'), html: icon('gear'), onclick: openSettings, id: 'open-settings' }));
  header.append(h('div.app-logo', { html: icon('images') }), bar, modes, right);
}

function themeMenu(anchor) {
  const r = anchor.getBoundingClientRect();
  showMenu(['system', 'dark', 'light'].map((id) => ({ label: t(`settings.${id}`), radio: true, checked: app.settings.theme === id, action: () => { app.settings.theme = id; app.saveSettings(); updateTheme(); renderHeader(); } })), r.right, r.bottom + 2, { alignRight: true });
}

function languageMenu(anchor) {
  const r = anchor.getBoundingClientRect();
  showMenu([['system', t('settings.system')], ['ko', '한국어'], ['en', 'English']].map(([id, label]) => ({ label, checked: app.settings.language === id, action: () => { app.settings.language = id; app.saveSettings(); setLanguage(id); } })), r.right, r.bottom + 2, { alignRight: true });
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

app.on('mode', async (mode) => {
  closeMenus();
  if (mode !== 'view') viewer.exitFullscreen();
  clear(modeHost);
  document.body.dataset.mode = mode;
  // Panes skipped their updates while hidden: draw them for the current selection.
  if (mode === 'manage') { modeHost.append(manage); if (app.settings.panes.right) RIGHT_TABS.find(([id]) => id === app.settings.panes.rightTab)?.[2].render(); fileList.rebuild(); if (app.state.focus) fileList.scrollIntoView(app.state.focus); fileList.focus(); }
  if (mode === 'view') { modeHost.append(viewer.el); viewer.open(app.state.viewPath); }
  if (mode === 'edit') {
    modeHost.append(editor.el);
    const item = app.state.list.find((i) => i.path === app.state.viewPath) ?? { path: app.state.viewPath, name: app.state.viewPath.split(/[\\/]/).pop() };
    editor.open(item);
  }
  if (mode === 'dashboard') { modeHost.append(dashboard.el); dashboard.render(); }
  renderHeader();
  renderToolbar();
  renderStatus();
});

app.on('edited', (path) => { if (editReturn === 'view') { app.state.viewPath = path; } });

// ───────────────────────── toolbar

function renderToolbar() {
  clear(toolbar);
  toolbar.hidden = app.state.mode !== 'manage';
  if (app.state.mode !== 'manage') return;
  const { history, source } = app.state;
  const s = app.settings;
  const nav = h('div.tool-group',
    button('back', t('nav.back'), goBack, { title: `${t('nav.back')} (Alt+←)`, disabled: !history.back.length }),
    button('forward', t('nav.forward'), goForward, { title: `${t('nav.forward')} (Alt+→)`, disabled: !history.forward.length }),
    button('up', t('nav.up'), goUp, { title: `${t('nav.up')} (Backspace)`, disabled: source.type !== 'folder' || !parentOf(source.path) }),
    button('refresh', t('nav.refresh'), () => reload(), { title: `${t('nav.refresh')} (F5)` }));
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
  toolbar.append(nav, address, h('div.tool-group', sort, group, filter), views, size, search, panes);
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
    { label: t('filter.kind'), submenu: [
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
  return [0, 1, 2, 3, 4, 5].map((n) => ({ label: n ? '★'.repeat(n) : t('organize.noRating'), shortcut: `Ctrl+${n}`, action: () => rate(n, paths) }));
}

function labelSubmenu(paths) {
  return [...LABELS.map((l, i) => ({ label: t(`label.${l}`), swatch: LABEL_COLORS[l], shortcut: `Alt+${i + 1}`, action: () => setLabel(l, paths) })), { label: t('organize.noLabel'), shortcut: 'Alt+0', action: () => setLabel(null, paths) }];
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

function fileMenu() {
  const recent = app.settings.recentFolders.map((path) => ({ label: path.replace(/^@\d+:/, ''), action: () => openFolder(path).catch(() => {}) }));
  return [
    { label: t('file.openFolder'), icon: 'folderOpen', shortcut: 'Ctrl+O', action: openFolderDialog },
    !isDesktop() ? { label: t('web.openFiles'), icon: 'images', action: openWebFiles } : { label: t('file.openFiles'), icon: 'images', action: openFilesDesktop },
    { label: t('file.recent'), icon: 'clock', submenu: recent.length ? recent : [{ label: t('file.noRecent'), disabled: true }] },
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
    { label: t('edit.cut'), shortcut: 'Ctrl+X', disabled: !has() || !fs.caps.move, action: () => copyToClipboard(true) },
    { label: t('edit.copy'), shortcut: 'Ctrl+C', disabled: !has() || !fs.caps.write, action: () => copyToClipboard(false) },
    { label: t('edit.paste'), shortcut: 'Ctrl+V', disabled: !app.state.clipboard || !inFolder(), action: pasteClipboard },
    'separator',
    { label: t('edit.selectAll'), shortcut: 'Ctrl+A', action: selectAll },
    { label: t('edit.selectFiles'), action: selectFilesOnly },
    { label: t('edit.selectNone'), shortcut: 'Ctrl+D', action: selectNone },
    { label: t('edit.invertSelection'), shortcut: 'Ctrl+I', action: invertSelection },
    'separator',
    { label: t('edit.editImage'), icon: 'pencil', shortcut: 'Ctrl+E', disabled: !hasFiles(), action: () => switchMode('edit') },
    { label: t('edit.restoreOriginal'), icon: 'undo', disabled: !hasFiles() || !fs.caps.originals, action: restoreOriginals },
    { label: t('edit.pasteSettings'), icon: 'copy', disabled: !hasFiles() || !editClipboard.preset, action: () => batchApplyPreset(targetPaths({ filesOnly: true }), editClipboard.preset) },
  ];
}

function viewMenu() {
  const s = app.settings;
  return [
    ...MODES.map(([id, iconName]) => ({ label: t(`mode.${id}`), icon: iconName, checked: app.state.mode === id, action: () => switchMode(id) })),
    'separator',
    { label: t('menu.viewStyle'), submenu: VIEW_STYLES.map(([id]) => ({ label: t(`viewStyle.${id}`), checked: s.view === id, action: () => { s.view = id; app.saveSettings(); renderToolbar(); fileList.rebuild(); } })) },
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
    { label: t('organize.clearBasket'), disabled: !app.catalog.basket.length, action: () => app.catalog.clearBasket() },
    'separator',
    { label: t('organize.showTagged'), icon: 'checkSquare', action: () => openSource({ type: 'filter', filters: [{ type: 'tagged' }], title: t('catalog.tagged') }) },
    { label: t('catalog.indexFolder'), icon: 'layers', disabled: !inFolder(), action: () => catalogFolder(app.state.source.path) },
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
    !item.isDir && kindOf(item.name) !== 'video' ? { label: t('edit.editImage'), icon: 'pencil', shortcut: 'Ctrl+E', action: () => editPath(item.path) } : null,
    fs.caps.open ? { label: t('file.openExternal'), icon: 'external', action: () => fs.openExternal(item.path).catch((e) => toast(errorText(e), 'error')) } : null,
    fs.caps.reveal ? { label: t('file.reveal'), icon: 'reveal', action: () => fs.reveal(item.path).catch((e) => toast(errorText(e), 'error')) } : null,
    'separator',
    files.length ? { label: t('organize.setRating'), icon: 'star', submenu: ratingSubmenu(files) } : null,
    files.length ? { label: t('organize.setLabel'), icon: 'tag', submenu: labelSubmenu(files) } : null,
    files.length ? { label: t('organize.tag'), icon: 'checkSquare', shortcut: '`', action: () => toggleTag(files) } : null,
    files.length ? { label: t('organize.addToBasket'), icon: 'basket', action: () => addToBasket(files) } : null,
    app.state.source.type === 'basket' ? { label: t('organize.removeFromBasket'), icon: 'close', action: () => { app.catalog.removeFromBasket(files); reload(); } } : null,
    files.length ? { label: t('view.rotateLeft'), icon: 'rotateLeft', action: () => rotateAndRefresh(files, -1) } : null,
    files.length ? { label: t('view.rotateRight'), icon: 'rotateRight', action: () => rotateAndRefresh(files, 1) } : null,
    'separator',
    { label: t('edit.cut'), shortcut: 'Ctrl+X', disabled: !fs.caps.move, action: () => copyToClipboard(true) },
    { label: t('edit.copy'), shortcut: 'Ctrl+C', disabled: !fs.caps.write, action: () => copyToClipboard(false) },
    { label: t('file.copyTo'), icon: 'copy', disabled: !fs.caps.write, action: () => copyMoveTo(false) },
    { label: t('file.moveTo'), icon: 'move', disabled: !fs.caps.move, action: () => copyMoveTo(true) },
    { label: t('file.rename'), icon: 'rename', shortcut: 'F2', disabled: !fs.caps.rename, action: renameSelection },
    { label: t('file.delete'), icon: 'trash', shortcut: 'Del', danger: true, action: () => deleteItems(paths) },
    'separator',
    files.length >= 2 && files.length <= 4 ? { label: t('tools.compare'), icon: 'compare', action: () => openCompare(selectedFiles()) } : null,
    files.length ? { label: t('menu.batch'), icon: 'layers', submenu: [
      { label: t('tools.batchRename'), action: () => batchRename(files), disabled: !fs.caps.rename },
      { label: t('tools.batchResize'), action: () => batchResize(files) },
      { label: t('tools.convert'), action: () => batchConvert(files) },
      { label: t('tools.autoAdjust'), action: () => batchAdjust(files) },
      { label: t('tools.dates'), action: () => adjustDates(files) },
    ] } : null,
    files.length ? { label: t('view.slideshow'), icon: 'play', action: () => startSlideshow(selectedFiles().length > 1 ? selectedFiles() : viewableList(), selectedFiles().length > 1 ? 0 : Math.max(0, viewableList().findIndex((i) => i.path === item.path))) } : null,
    files.length ? { label: t('file.print'), icon: 'print', action: () => printDialog(selectedFiles()) } : null,
    files.length && fs.caps.wallpaper ? { label: t('file.wallpaper'), icon: 'wallpaper', action: setWallpaper } : null,
    item.isDir ? { label: t('catalog.indexFolder'), icon: 'layers', action: () => catalogFolder(item.path) } : null,
  ] : [
    { label: t('edit.paste'), shortcut: 'Ctrl+V', disabled: !app.state.clipboard || !inFolder(), action: pasteClipboard },
    { label: t('file.newFolder'), icon: 'folderPlus', disabled: !inFolder() || !fs.caps.mkdir, action: newFolder },
    'separator',
    { label: t('edit.selectAll'), shortcut: 'Ctrl+A', action: selectAll },
    { label: t('toolbar.sort'), icon: 'sort', submenu: sortMenu() },
    { label: t('toolbar.group'), icon: 'layers', submenu: groupMenu() },
    { label: t('menu.viewStyle'), submenu: VIEW_STYLES.map(([id]) => ({ label: t(`viewStyle.${id}`), checked: app.settings.view === id, action: () => { app.settings.view = id; app.saveSettings(); renderToolbar(); fileList.rebuild(); } })) },
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
      updateTheme();
      reload();
      renderAll();
    },
  });
}

async function quit() {
  if (!(await leaveEditor())) return;
  await saveCatalogNow();
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
    thumbsRemaining ? h('span.status-item', h('span.spinner-dot'), t('status.thumbnails', { n: thumbsRemaining })) : '',
    app.state.source.type === 'folder' ? h('span.status-item.path', { title: app.state.source.path }, app.state.source.path.replace(/^@\d+:/, '')) : '',
    fs.kind === 'web' && app.state.source.type === 'folder' && webFs.isReadOnly(app.state.source.path) ? h('span.status-item.warn', t('web.readOnly')) : '');
}

thumbs.onProgress = (remaining) => {
  const before = thumbsRemaining;
  thumbsRemaining = remaining;
  if (Boolean(before) !== Boolean(remaining) || remaining % 20 === 0) renderStatus();
};

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
  if (app.state.mode === 'dashboard' || app.state.mode === 'view') setMode('manage');
  renderWelcome();
  renderToolbar();
  updateTitle();
});
app.on('items', () => { renderStatus(); renderToolbar(); });
app.on('selection', renderStatus);
app.on('resort', () => { refreshList(); renderToolbar(); });
app.on('catalog', (change) => {
  if (['basket'].includes(change?.what) || !change?.what) renderBasket();
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
onLanguageChange(() => { renderAll(); if (app.state.mode !== 'manage') app.emit('mode', app.state.mode); });

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
  if (ctrl && /^[0-5]$/.test(key)) { handled(); rate(Number(key)); return; }
  if (event.altKey && /^[0-5]$/.test(key)) { handled(); setLabel(key === '0' ? null : LABELS[Number(key) - 1]); return; }
  if (key === '`' && !ctrl) { handled(); toggleTag(); return; }
  const command = commandFor(event);
  if (command) { handled(); command.run(); return; }
  if (key === 'Escape' && app.state.source.type !== 'folder' && app.state.history.back.length) { handled(); goBack(); }
});

// Manage-mode commands with their default keys (users can reassign them: Help → Customize shortcuts).
registerCommands([
  { id: 'selectAll', label: 'edit.selectAll', key: 'Ctrl+A', run: selectAll },
  { id: 'selectNone', label: 'edit.selectNone', key: 'Ctrl+D', run: selectNone },
  { id: 'invertSelection', label: 'edit.invertSelection', key: 'Ctrl+I', run: invertSelection },
  { id: 'copy', label: 'edit.copy', key: 'Ctrl+C', run: () => copyToClipboard(false) },
  { id: 'cut', label: 'edit.cut', key: 'Ctrl+X', run: () => copyToClipboard(true) },
  { id: 'paste', label: 'edit.paste', key: 'Ctrl+V', run: pasteClipboard },
  { id: 'basket', label: 'organize.addToBasket', key: 'Ctrl+B', run: () => addToBasket() },
  { id: 'edit', label: 'edit.editImage', key: 'Ctrl+E', run: () => switchMode('edit') },
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
  showWindow();

  // What to show first.
  let opened = false;
  if (isDesktop()) {
    const paths = await invoke('startup_paths').catch(() => []);
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
      for (const folder of candidates.filter(Boolean)) {
        try { await openFolder(folder, { history: false }); opened = true; break; } catch { /* try the next */ }
      }
      if (!opened || app.state.error) { app.state.source = { type: 'welcome' }; renderAll(); }
    }
  } else {
    const places = await fs.places();
    const last = places.find((p) => p.path === app.settings.lastFolder && p.granted) ?? places.find((p) => p.granted);
    if (last) await openFolder(app.settings.lastFolder && app.settings.lastFolder.startsWith(last.path) ? app.settings.lastFolder : last.path, { history: false }).catch(() => {});
    if (app.state.error) { app.state.source = { type: 'welcome' }; renderAll(); }
  }
  fileList.focus();
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
globalThis.__myphoto = { app, t, actions: { openFolder, openSource, openPaths, selectItem, setSelection, setMode, viewItem, rate, setLabel, toggleTag, reload, openSamples, editPath, switchMode, showLeftTab, showRightTab }, menu: runMenu, fs, viewer, editor, thumbs, closeAllDialogs, fileList, mapPane };

start().catch((error) => {
  console.error(error);
  toast(errorText(error), 'error', 15000);
  showWindow();
});
