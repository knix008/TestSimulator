// Main window: menu bar, toolbar, board tabs, tool panel (left), board,
// properties panel (right) and status bar.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import * as B from './domain/board.js';
import { cardsFromClipboard, cardsToClipboard } from './domain/clipboard.js';
import { BoardDocument } from './domain/document.js';
import {
  baseName, directoryOf, FormatError, isBoardFileName, isImageFileName, isTextFileName, parseFile, serialize, stripExtension, withExtension,
} from './domain/format.js';
import { attachmentIcon, AttachmentStore, MAX_ATTACHMENT, mimeFor, splitDataUrl, toDataUrl } from './domain/attachments.js';
import {
  createProject, dbConfig, isProjectFileName, parseProject, serializeProject, storageProblems, usesDatabase, withProjectExtension,
} from './domain/project.js';
import { addRecent, loadRecent, removeRecent, storeRecent } from './domain/recent.js';
import {
  columnTitles, loadSettings, RECENT_KEY, SESSION_KEY, STORAGE_KEY, storeSettings, ZOOM,
} from './domain/settings.js';
import { switchFlag } from './flags.js';
import { formatBytes, getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { PopupHost } from './platform/popups.js';
import { applyFont, applyTheme, resolveTheme, THEME_IDS, THEMES } from './themes.js';

const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
/** Attachment contents by id (cards keep only the metadata). */
const attachments = new AttachmentStore();
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const isMac = /Mac/i.test(navigator.platform ?? '');
const keyLabel = (key) => (isMac ? key.replace('Ctrl+', '⌘').replace('Shift+', '⇧').replace('Alt+', '⌥') : key);

const state = {
  settings: loadSettings(globalThis.localStorage),
  recent: loadRecent(globalThis.localStorage),
  docs: [],
  active: null,
  selection: { kind: null, ids: [] },
  filter: { text: '', priority: 'all', color: 'all', tag: 'all', overdue: false },
  notice: null,
  info: null,
  openMenu: null,
  lastMenuClose: { name: null, at: 0 },
  quitting: false,
  untitled: 0,
  dropActive: false,
  minWidth: 0,
  clipboard: '',
  /** Open project: { project, path, password, saved } or null. */
  project: null,
};

const activeDoc = () => state.docs.find((doc) => doc.id === state.active) ?? null;
const activeBoard = () => activeDoc()?.board ?? null;
const docName = (doc) => (doc.path ? baseName(doc.path) : doc.name ?? doc.board.title);

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
  popups.open('error', {
    title: t(titleKey),
    message,
    detail: detail ?? '',
    context,
    time: new Date().toLocaleString(),
    app: info ? `${info.name} ${info.version} (${info.web ? 'web' : `${info.os}/${info.arch}`}, ${info.commit})` : 'MyKanbanBoard',
  });
}

window.addEventListener('error', (event) => showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''));
window.addEventListener('unhandledrejection', (event) => showError('error.unexpected', event.reason));

// ───────────────────────── documents

function untitledName() {
  state.untitled += 1;
  return t('tabs.untitled', { n: state.untitled });
}

function addDocument(doc, { activate = true } = {}) {
  state.docs.push(doc);
  if (activate) activate_(doc.id);
  persistSession();
  return doc;
}

function newBoard() {
  const name = untitledName();
  const columns = columnTitles(state.settings.newBoardColumns);
  const board = B.createBoard({ title: name, columns: columns.length ? columns : [t('board.newColumn')] });
  addDocument(new BoardDocument(board, { name }));
  renderAll();
  return board;
}

function welcomeBoard() {
  const en = getLanguage() === 'en';
  const board = B.createBoard({ title: t('board.welcomeTitle'), columns: columnTitles(state.settings.newBoardColumns) });
  const [todo, doing, done] = board.columns;
  const add = (column, data) => column && B.addCard(board, column.id, data);
  add(todo, { title: en ? 'Drag me to another column' : '저를 다른 열로 끌어 보세요', color: 'blue', priority: 'medium', tags: [en ? 'tutorial' : '안내'] });
  add(todo, { title: en ? 'Right-click a card for its menu' : '카드를 오른쪽 클릭하면 메뉴가 열립니다', color: 'yellow', tags: [en ? 'tutorial' : '안내'] });
  add(todo, { title: en ? 'Ctrl + mouse wheel zooms the board' : 'Ctrl + 마우스 휠로 확대/축소', color: 'teal', priority: 'low' });
  add(doing, {
    title: en ? 'Edit the selected card in the properties panel' : '선택한 카드는 오른쪽 속성 패널에서 수정합니다',
    description: en ? 'Title, description, colour, priority, due date, tags and a checklist.' : '제목, 설명, 색, 우선순위, 마감일, 태그, 체크리스트를 바꿀 수 있습니다.',
    color: 'purple', priority: 'high',
    checklist: [{ text: en ? 'Select a card' : '카드 선택', done: true }, { text: en ? 'Change its colour' : '색 바꾸기', done: false }],
  });
  add(done, { title: en ? 'Install MyKanbanBoard' : 'MyKanbanBoard 설치', color: 'green', priority: 'none' });
  const doc = new BoardDocument(board, { name: board.title });
  doc.markSaved(null);
  return doc;
}

function activate_(id) {
  state.active = id;
  state.selection = { kind: null, ids: [] };
}

function activateDoc(id) {
  if (state.active === id) return;
  activate_(id);
  renderAll();
  scrollActiveTabIntoView();
}

/** Applies a change to the active board as one undo step and redraws. */
function change(labelKey, mutate, { right = false } = {}) {
  const doc = activeDoc();
  if (!doc) return undefined;
  const result = doc.apply(t(labelKey), mutate);
  renderBoard();
  renderTabs();
  renderLeft();
  renderStatus();
  renderToolbarState();
  if (right) renderRight();
  return result;
}

function persistSession() {
  try {
    globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify({ files: state.docs.filter((doc) => doc.path && !doc.projectId).map((doc) => doc.path), project: state.project?.path ?? null }));
  } catch { /* ignore */ }
}

// ───────────────────────── selection

const selectedCards = () => (state.selection.kind === 'card' ? state.selection.ids : []);

function select(kind, ids, { toggle = false } = {}) {
  if (toggle && kind === 'card' && state.selection.kind === 'card') {
    const set = new Set(state.selection.ids);
    for (const id of ids) (set.has(id) ? set.delete(id) : set.add(id));
    state.selection = { kind: set.size ? 'card' : null, ids: [...set] };
  } else {
    state.selection = { kind, ids };
  }
  renderSelection();
  renderRight();
  renderStatus();
  renderToolbarState();
}

function renderSelection() {
  const ids = new Set(state.selection.ids);
  for (const element of root.querySelectorAll('.card')) element.classList.toggle('selected', state.selection.kind === 'card' && ids.has(element.dataset.cardId));
  for (const element of root.querySelectorAll('.column')) element.classList.toggle('selected', state.selection.kind === 'column' && ids.has(element.dataset.columnId));
}

// ───────────────────────── commands

const hasDoc = () => Boolean(activeDoc());
const hasCards = () => selectedCards().length > 0;

const commands = {
  new: { icon: 'newBoard', label: 'action.new', key: 'Ctrl+N', run: () => newBoard() },
  open: { icon: 'open', label: 'action.open', key: 'Ctrl+O', run: () => openWithDialog() },
  save: { icon: 'save', label: 'action.save', key: 'Ctrl+S', enabled: hasDoc, run: () => saveDoc(activeDoc()) },
  saveAs: { icon: 'saveAs', label: 'action.saveAs', key: 'Ctrl+Shift+S', enabled: hasDoc, run: () => saveDoc(activeDoc(), { saveAs: true }) },
  saveAll: { icon: 'save', label: 'action.saveAll', key: 'Ctrl+Alt+S', enabled: () => state.docs.some((doc) => doc.dirty), run: () => saveAll() },
  recent: { icon: 'recent', label: 'action.recent', key: 'Ctrl+R', run: () => openRecentPopup() },
  projectMenu: { icon: 'project', label: 'action.projectMenu', run: (context) => openProjectMenu(context?.anchor) },
  newProject: { icon: 'project', label: 'action.newProject', run: () => newProject() },
  openProject: { icon: 'open', label: 'action.openProject', key: 'Ctrl+Shift+O', run: () => openProjectWithDialog() },
  saveProject: { icon: 'save', label: 'action.saveProject', enabled: () => Boolean(state.project), run: () => saveProject() },
  saveProjectAs: { icon: 'saveAs', label: 'action.saveProjectAs', enabled: () => Boolean(state.project), run: () => saveProject({ saveAs: true }) },
  projectSettings: { icon: 'database', label: 'action.projectSettings', enabled: () => Boolean(state.project), run: () => editProject() },
  addToProject: { icon: 'plus', label: 'action.addToProject', enabled: () => Boolean(state.project && activeDoc() && !activeDoc().projectId), run: () => addToProject(activeDoc()) },
  removeFromProject: { icon: 'minus', label: 'action.removeFromProject', enabled: () => Boolean(activeDoc()?.projectId), run: () => removeFromProject(activeDoc()) },
  closeProject: { icon: 'close', label: 'action.closeProject', enabled: () => Boolean(state.project), run: () => closeProject() },
  attach: { icon: 'paperclip', label: 'action.attach', key: 'Ctrl+Shift+A', enabled: () => selectedCards().length === 1, run: () => chooseAttachments(selectedCards()[0]) },
  closeTab: { icon: 'close', label: 'action.closeTab', key: 'Ctrl+W', enabled: hasDoc, run: () => closeDoc(activeDoc()) },
  closeOthers: { icon: 'close', label: 'action.closeOthers', enabled: () => state.docs.length > 1, run: () => closeOthers(activeDoc()) },
  exit: { icon: 'exit', label: 'action.exit', key: isMac ? 'Ctrl+Q' : 'Alt+F4', run: () => requestExit() },
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: () => Boolean(activeDoc()?.history.canUndo), run: () => undo() },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: () => Boolean(activeDoc()?.history.canRedo), run: () => redo() },
  cut: { icon: 'cut', label: 'action.cut', key: 'Ctrl+X', enabled: hasCards, run: () => cutCards() },
  copy: { icon: 'copy', label: 'action.copy', key: 'Ctrl+C', enabled: hasCards, run: () => copyCards() },
  paste: { icon: 'paste', label: 'action.paste', key: 'Ctrl+V', enabled: () => Boolean(activeBoard()?.columns.length), run: (context) => pasteCards(context) },
  delete: { icon: 'trash', label: 'action.delete', key: 'Delete', enabled: () => hasCards() || state.selection.kind === 'column', run: () => deleteSelection() },
  duplicate: { icon: 'duplicate', label: 'action.duplicate', key: 'Ctrl+D', enabled: hasCards, run: () => duplicateSelection() },
  selectAll: { icon: 'selectAll', label: 'action.selectAll', key: 'Ctrl+A', enabled: hasDoc, run: () => select('card', B.allCards(activeBoard()).filter((card) => B.matchesFilter(card, state.filter)).map((card) => card.id)) },
  clearSelection: { icon: 'close', label: 'action.clearSelection', key: 'Esc', enabled: () => Boolean(state.selection.kind), run: () => select(null, []) },
  addColumn: { icon: 'addColumn', label: 'action.addColumn', key: 'Ctrl+Shift+N', enabled: hasDoc, run: () => addColumn() },
  addCard: { icon: 'addCard', label: 'action.addCard', key: 'Ctrl+Enter', enabled: () => Boolean(activeBoard()?.columns.length), run: (context) => addCard(context?.columnId) },
  zoomOut: { icon: 'zoomOut', label: 'action.zoomOut', key: 'Ctrl+-', enabled: () => state.settings.zoom > ZOOM.min, run: () => setZoom(state.settings.zoom - ZOOM.step) },
  zoomReset: { icon: 'zoomReset', label: 'action.zoomReset', key: 'Ctrl+0', run: () => setZoom(100) },
  zoomIn: { icon: 'zoomIn', label: 'action.zoomIn', key: 'Ctrl+=', enabled: () => state.settings.zoom < ZOOM.max, run: () => setZoom(state.settings.zoom + ZOOM.step) },
  print: { icon: 'print', label: 'action.print', key: 'Ctrl+P', enabled: hasDoc, run: () => openPrint() },
  theme: { icon: 'palette', label: 'action.theme', run: (context) => openThemeMenu(context?.anchor) },
  language: { icon: 'globe', label: 'action.language', key: 'Ctrl+Shift+L', run: () => updateSettings({ language: getLanguage() === 'ko' ? 'en' : 'ko' }) },
  settings: { icon: 'gear', label: 'action.settings', key: 'Ctrl+,', run: () => popups.open('settings', { tab: 'general' }) },
  about: { icon: 'info', label: 'action.about', key: 'F1', run: () => popups.open('about') },
  shortcuts: { icon: 'keyboard', label: 'action.shortcuts', run: () => popups.open('settings', { tab: 'shortcuts' }) },
  leftPanel: { icon: 'panelLeft', label: 'action.leftPanel', key: 'Ctrl+Shift+1', checked: () => state.settings.showLeftPanel, run: () => updateSettings({ showLeftPanel: !state.settings.showLeftPanel }) },
  rightPanel: { icon: 'panelRight', label: 'action.rightPanel', key: 'Ctrl+Shift+2', checked: () => state.settings.showRightPanel, run: () => updateSettings({ showRightPanel: !state.settings.showRightPanel }) },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => state.settings.showStatusBar, run: () => updateSettings({ showStatusBar: !state.settings.showStatusBar }) },
  find: { icon: 'search', label: 'action.find', key: 'Ctrl+F', run: () => focusSearch() },
  clearFilter: { icon: 'filter', label: 'action.clearFilter', enabled: () => B.filterActive(state.filter), run: () => { state.filter = { text: '', priority: 'all', color: 'all', tag: 'all', overdue: false }; renderLeft(); renderBoard(); renderStatus(); } },
  background: { icon: 'image', label: 'action.background', run: () => chooseBackground() },
  clearBackground: { icon: 'clear', label: 'action.clearBackground', enabled: () => Boolean(state.settings.backgroundImage), run: () => removeBackground() },
  nextTab: { icon: 'chevronRight', label: 'action.nextTab', key: 'Ctrl+Tab', enabled: () => state.docs.length > 1, run: () => cycleTab(1) },
  prevTab: { icon: 'chevronLeft', label: 'action.prevTab', key: 'Ctrl+Shift+Tab', enabled: () => state.docs.length > 1, run: () => cycleTab(-1) },
  editCard: { icon: 'edit', label: 'action.editCard', key: 'Enter', enabled: () => selectedCards().length === 1, run: () => focusProperty('title') },
  moveLeft: { icon: 'arrowLeft', label: 'action.moveLeft', key: 'Alt+Left', enabled: hasCards, run: () => shiftSelected(-1) },
  moveRight: { icon: 'arrowRight', label: 'action.moveRight', key: 'Alt+Right', enabled: hasCards, run: () => shiftSelected(1) },
  renameBoard: { icon: 'edit', label: 'action.renameBoard', key: 'F2', enabled: hasDoc, run: () => { select('board', []); focusProperty('title'); } },
  boardProps: { icon: 'board', label: 'action.boardProps', enabled: hasDoc, run: () => select('board', []) },
};

function commandEnabled(id) {
  const command = commands[id];
  return !command.enabled || command.enabled();
}

function commandTip(id) {
  const command = commands[id];
  let label = t(command.label).replace(/…$/, '');
  if (id === 'undo' && activeDoc()?.history.canUndo) label = t('tip.undoWith', { label: activeDoc().history.undoLabel });
  if (id === 'redo' && activeDoc()?.history.canRedo) label = t('tip.redoWith', { label: activeDoc().history.redoLabel });
  if (id === 'language') label = t('tip.language');
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
  file: ['new', 'open', 'recent', '-', 'save', 'saveAs', 'saveAll', '-', 'print', '-', 'closeTab', 'closeOthers', '-', 'exit'],
  edit: ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'duplicate', 'delete', '-', 'selectAll', 'clearSelection', '-', 'find', 'clearFilter'],
  view: ['zoomIn', 'zoomOut', 'zoomReset', '-', 'leftPanel', 'rightPanel', 'statusBar', '-', 'theme', 'language', '-', 'background', 'clearBackground'],
  board: ['addColumn', 'addCard', 'attach', '-', 'editCard', 'moveLeft', 'moveRight', '-', 'renameBoard', 'boardProps', '-', 'nextTab', 'prevTab'],
  project: ['newProject', 'openProject', '-', 'saveProject', 'saveProjectAs', '-', 'projectSettings', 'addToProject', 'removeFromProject', '-', 'closeProject'],
  help: ['shortcuts', 'settings', '-', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', view: 'eye', board: 'board', project: 'project', help: 'info' };

const TOOLBAR = [
  ['new', 'open', 'save', 'saveAs', 'recent', 'projectMenu'],
  ['undo', 'redo'],
  ['cut', 'copy', 'paste', 'delete'],
  ['addColumn', 'addCard'],
  ['zoomOut', 'zoomReset', 'zoomIn'],
  ['print'],
  ['leftPanel', 'rightPanel'],
  ['theme', 'language'],
];
/** Right end of the toolbar. */
const TOOLBAR_RIGHT = ['settings', 'about'];

function renderShell() {
  root.innerHTML = `
    <nav id="menubar" role="menubar"></nav>
    <div id="toolbar" role="toolbar"></div>
    <div id="tabs"></div>
    <main id="workspace">
      <aside id="left-panel" class="side-panel"></aside>
      <section id="board-area" tabindex="-1">
        <div class="board-bg" aria-hidden="true"></div>
        <div id="board"></div>
        <div class="drop-overlay" aria-hidden="true"><div>${icon('drop')}<span></span></div></div>
      </section>
      <aside id="right-panel" class="side-panel"></aside>
    </main>
    <footer id="statusbar" role="status"></footer>`;
}

function renderMenubar() {
  const menubar = root.querySelector('#menubar');
  menubar.innerHTML = Object.keys(MENUS).map((name) => `
    <button class="menubar-item ${state.openMenu === name ? 'open' : ''}" data-menu="${name}" role="menuitem" aria-haspopup="true" title="${escapeHtml(t(`menu.${name}`))}">${icon(MENU_ICONS[name])}<span>${escapeHtml(t(`menu.${name}`))}</span></button>`).join('');
}

function renderToolbar() {
  const toolbar = root.querySelector('#toolbar');
  const button = (id) => {
    const command = commands[id];
    const glyph = id === 'language' ? switchFlag(getLanguage()) : icon(command.icon);
    return `<button class="tool-button" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(command.label))}">${glyph}</button>`;
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
    const checked = commands[id].checked?.();
    element.classList.toggle('active', Boolean(checked));
    if (checked !== undefined) element.setAttribute('aria-pressed', String(Boolean(checked)));
  }
}

/** The window can never be so narrow that toolbar buttons are hidden. */
function updateMinimumWidth() {
  const left = root.querySelector('.toolbar-left');
  const right = root.querySelector('.toolbar-right');
  if (!left || !right) return;
  requestAnimationFrame(() => {
    const toolbar = root.querySelector('#toolbar');
    const style = getComputedStyle(toolbar);
    // Left groups + right group + a minimum gap between them.
    const width = Math.ceil(left.scrollWidth + right.scrollWidth + 24 + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2);
    if (Math.abs(width - state.minWidth) < 1) return;
    state.minWidth = width;
    document.documentElement.style.setProperty('--min-width', `${width}px`);
    native.setMinimumSize(width, 560).catch(() => {});
  });
}

// ───────────────────────── tabs

function renderTabs() {
  const tabs = root.querySelector('#tabs');
  const scroll = tabs.querySelector('.tab-strip')?.scrollLeft ?? 0;
  tabs.innerHTML = `
    <div class="tab-strip"><div class="tab-list" role="tablist">
      ${state.docs.map((doc) => `
        <div class="tab ${doc.id === state.active ? 'active' : ''} ${doc.dirty ? 'dirty' : ''} ${doc.projectId ? 'in-project' : ''}" role="tab" aria-selected="${doc.id === state.active}" data-doc="${doc.id}" title="${escapeHtml(doc.projectId ? `${state.project?.project.name ?? ''} › ${docName(doc)}` : doc.path ?? docName(doc))}">
          ${icon(doc.projectId ? 'project' : 'board')}<span class="tab-name">${escapeHtml(docName(doc))}</span>
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

// ───────────────────────── left panel (tools)

const TOOLS = [
  { tool: 'card', icon: 'addCard', label: 'tool.addCard', tip: 'tool.addCardTip' },
  { tool: 'column', icon: 'addColumn', label: 'tool.addColumn', tip: 'tool.addColumnTip' },
  { tool: 'template:task', icon: 'task', label: 'tool.task' },
  { tool: 'template:bug', icon: 'bug', label: 'tool.bug' },
  { tool: 'template:feature', icon: 'star', label: 'tool.feature' },
  { tool: 'template:idea', icon: 'bulb', label: 'tool.idea' },
];

function renderLeft() {
  const panel = root.querySelector('#left-panel');
  root.querySelector('#workspace').classList.toggle('no-left', !state.settings.showLeftPanel);
  const board = activeBoard();
  if (!state.settings.showLeftPanel) {
    // Collapsed: a narrow rail of icons — the tools still work (click or drag).
    panel.innerHTML = `<div class="panel-rail">
      <button class="rail-button" data-panel-toggle="left" title="${escapeHtml(t('panel.expandLeft'))}" aria-label="${escapeHtml(t('panel.expandLeft'))}">${icon('chevronRight')}</button>
      <span class="rail-sep"></span>
      ${TOOLS.map((tool) => `<button class="rail-button" data-tool="${tool.tool}" title="${escapeHtml(tool.tip ? t(tool.tip) : t('tool.templateTip', { name: t(tool.label) }))}" aria-label="${escapeHtml(t(tool.label))}" ${board ? '' : 'disabled'}>${icon(tool.icon)}</button>`).join('')}
      <span class="rail-sep"></span>
      <button class="rail-button ${state.project ? 'active' : ''}" data-panel-section="left:project" title="${escapeHtml(state.project ? `${t('panel.project')}: ${state.project.project.name}` : t('panel.project'))}" aria-label="${escapeHtml(t('panel.project'))}">${icon('project')}</button>
      <button class="rail-button ${B.filterActive(state.filter) ? 'active' : ''}" data-panel-section="left:filter" title="${escapeHtml(t('panel.filter'))}" aria-label="${escapeHtml(t('panel.filter'))}">${icon('filter')}</button>
      <button class="rail-button" data-panel-section="left:overview" title="${escapeHtml(t('panel.overview'))}" aria-label="${escapeHtml(t('panel.overview'))}">${icon('list')}</button>
    </div>`;
    return;
  }
  const focused = document.activeElement?.id === 'filter-text';
  const all = board ? B.allCards(board) : [];
  const shown = all.filter((card) => B.matchesFilter(card, state.filter)).length;
  const tags = board ? B.allTags(board) : [];
  panel.innerHTML = `
    <div class="panel-header">${icon('panelLeft')}<span>${t('panel.leftTitle')}</span>
      <button class="icon-button" data-panel-toggle="left" title="${escapeHtml(t('panel.collapseLeft'))}" aria-label="${escapeHtml(t('panel.collapseLeft'))}">${icon('chevronLeft')}</button></div>
    ${projectSectionHtml()}
    <section class="panel-section" data-section="tools">
      <h3>${icon('addCard')}<span>${t('panel.tools')}</span></h3>
      <div class="tool-grid">
        ${TOOLS.map((tool) => `<button class="tool-tile" data-tool="${tool.tool}" title="${escapeHtml(tool.tip ? t(tool.tip) : t('tool.templateTip', { name: t(tool.label) }))}" ${board ? '' : 'disabled'}>${icon(tool.icon)}<span>${t(tool.label)}</span></button>`).join('')}
      </div>
      <p class="panel-hint">${t('tool.hint')}</p>
    </section>
    <section class="panel-section" data-section="filter">
      <h3>${icon('filter')}<span>${t('panel.filter')}</span></h3>
      <label class="search-box" title="${escapeHtml(t('filter.search'))}">${icon('search')}<input id="filter-text" type="search" placeholder="${escapeHtml(t('filter.search'))}" value="${escapeHtml(state.filter.text)}" /></label>
      <label class="field-row"><span>${icon('flag')}${t('filter.priority')}</span>
        <select data-filter="priority" title="${escapeHtml(t('filter.priority'))}"><option value="all">${t('filter.all')}</option>${B.PRIORITIES.map((p) => `<option value="${p}" ${state.filter.priority === p ? 'selected' : ''}>${t(`priority.${p}`)}</option>`).join('')}</select></label>
      <label class="field-row"><span>${icon('palette')}${t('filter.color')}</span>
        <select data-filter="color" title="${escapeHtml(t('filter.color'))}"><option value="all">${t('filter.all')}</option>${B.CARD_COLORS.map((c) => `<option value="${c}" ${state.filter.color === c ? 'selected' : ''}>${t(`color.${c}`)}</option>`).join('')}</select></label>
      <label class="field-row"><span>${icon('tag')}${t('filter.tag')}</span>
        <select data-filter="tag" title="${escapeHtml(t('filter.tag'))}"><option value="all">${t('filter.all')}</option>${tags.map((tag) => `<option value="${escapeHtml(tag)}" ${state.filter.tag === tag ? 'selected' : ''}>${escapeHtml(tag)}</option>`).join('')}</select></label>
      <label class="check-row" title="${escapeHtml(t('filter.overdue'))}"><input type="checkbox" data-filter="overdue" ${state.filter.overdue ? 'checked' : ''} /><span>${t('filter.overdue')}</span></label>
      <div class="filter-foot"><span class="muted">${t('filter.matches', { shown, total: all.length })}</span>
        <button class="small-button" data-command="clearFilter" title="${escapeHtml(t('filter.clear'))}" ${B.filterActive(state.filter) ? '' : 'disabled'}>${icon('clear')}<span>${t('filter.clear')}</span></button></div>
    </section>
    <section class="panel-section" data-section="overview">
      <h3>${icon('list')}<span>${t('panel.overview')}</span></h3>
      <ul class="column-list">
        ${(board?.columns ?? []).map((column) => `<li><button class="column-link" data-goto-column="${column.id}" title="${escapeHtml(column.title)}"><i class="dot" style="background:${B.COLOR_HEX[column.color] === 'transparent' ? 'var(--muted)' : B.COLOR_HEX[column.color]}"></i><span>${escapeHtml(column.title || '—')}</span><b class="${column.wip && column.cards.length > column.wip ? 'over' : ''}">${column.cards.length}${column.wip ? `/${column.wip}` : ''}</b></button></li>`).join('')}
      </ul>
    </section>`;
  if (focused) {
    const input = panel.querySelector('#filter-text');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function focusSearch() {
  if (!state.settings.showLeftPanel) updateSettings({ showLeftPanel: true });
  const input = root.querySelector('#filter-text');
  input?.focus();
  input?.select();
}

// ───────────────────────── board

function cardHtml(card) {
  const details = state.settings.showCardDetails;
  const done = card.checklist.filter((item) => item.done).length;
  const overdue = B.isOverdue(card);
  const meta = [
    card.priority !== 'none' ? `<span class="badge priority-${card.priority}" title="${escapeHtml(t('field.priority'))}">${icon('flag')}${t(`priority.${card.priority}`)}</span>` : '',
    card.due ? `<span class="badge ${overdue ? 'overdue' : ''}" title="${escapeHtml(t('field.due'))}">${icon('calendar')}${escapeHtml(card.due)}</span>` : '',
    card.assignee ? `<span class="badge" title="${escapeHtml(t('field.assignee'))}">${icon('user')}${escapeHtml(card.assignee)}</span>` : '',
    card.checklist.length ? `<span class="badge ${done === card.checklist.length ? 'complete' : ''}" title="${escapeHtml(t('field.checklist'))}">${icon('checklist')}${done}/${card.checklist.length}</span>` : '',
  ].join('');
  const hidden = !B.matchesFilter(card, state.filter);
  return `<article class="card color-${card.color} ${hidden ? 'filtered' : ''}" data-card-id="${card.id}" tabindex="0" title="${escapeHtml(t('board.cardTip'))}">
    <div class="card-stripe" style="background:${B.COLOR_HEX[card.color]}"></div>
    <div class="card-title">${escapeHtml(card.title || '—')}</div>
    ${details && card.description ? `<div class="card-desc">${escapeHtml(card.description)}</div>` : ''}
    ${details && card.tags.length ? `<div class="card-tags">${card.tags.map((tag) => `<span class="chip">${icon('tag')}${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    ${cardAttachmentsHtml(card)}
    ${meta ? `<div class="card-meta">${meta}</div>` : ''}
  </article>`;
}

function columnHtml(column) {
  const over = column.wip > 0 && column.cards.length > column.wip;
  return `<section class="column ${over ? 'over-wip' : ''}" data-column-id="${column.id}">
    <header class="column-head" title="${escapeHtml(t('board.renameHint'))}">
      <i class="column-color" style="background:${B.COLOR_HEX[column.color] === 'transparent' ? 'var(--border)' : B.COLOR_HEX[column.color]}"></i>
      <span class="column-title">${escapeHtml(column.title || '—')}</span>
      <span class="column-count" title="${escapeHtml(over ? t('board.wipOver', { wip: column.wip }) : t('field.cards'))}">${column.cards.length}${column.wip ? ` / ${column.wip}` : ''}</span>
      <button class="icon-button" data-column-add="${column.id}" title="${escapeHtml(t('board.addCard'))}" aria-label="${escapeHtml(t('board.addCard'))}">${icon('plus')}</button>
      <button class="icon-button" data-column-menu="${column.id}" title="${escapeHtml(t('board.columnMenu'))}" aria-label="${escapeHtml(t('board.columnMenu'))}">${icon('chevronDown')}</button>
    </header>
    <div class="cards" data-column-id="${column.id}">
      ${column.cards.map(cardHtml).join('')}
      ${column.cards.length ? '' : `<div class="column-empty">${t('board.empty')}</div>`}
    </div>
    <button class="add-card-button" data-column-add="${column.id}" title="${escapeHtml(t('board.addCard'))}">${icon('plus')}<span>${t('board.addCard')}</span></button>
  </section>`;
}

function renderBoard() {
  const container = root.querySelector('#board');
  const area = root.querySelector('#board-area');
  const board = activeBoard();
  const scroll = { left: area.scrollLeft, top: area.scrollTop };
  const cardScroll = Object.fromEntries([...container.querySelectorAll('.cards')].map((element) => [element.dataset.columnId, element.scrollTop]));
  container.style.zoom = String(state.settings.zoom / 100);
  container.className = `density-${state.settings.cardDensity}`;
  if (!board) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = board.columns.length
    ? board.columns.map(columnHtml).join('')
    : `<div class="board-empty">${icon('board')}<p>${t('board.noColumns')}</p></div>`;
  area.scrollLeft = scroll.left;
  area.scrollTop = scroll.top;
  for (const element of container.querySelectorAll('.cards')) element.scrollTop = cardScroll[element.dataset.columnId] ?? 0;
  renderSelection();
}

function startColumnRename(columnId) {
  const head = root.querySelector(`.column[data-column-id="${columnId}"] .column-title`);
  const column = B.findColumn(activeBoard(), columnId);
  if (!head || !column) return;
  const input = document.createElement('input');
  input.className = 'column-title-input';
  input.value = column.title;
  input.setAttribute('aria-label', t('action.renameColumn'));
  head.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    if (commit && input.value.trim() !== column.title) change('op.editColumn', (board) => B.updateColumn(board, columnId, { title: input.value.trim() }), { right: true });
    else renderBoard();
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') finish(true);
    if (event.key === 'Escape') finish(false);
    event.stopPropagation();
  });
  input.addEventListener('blur', () => finish(true));
}

// ───────────────────────── right panel (properties)

const colorPicker = (current, attribute) => `<div class="swatches" role="radiogroup">${B.CARD_COLORS.map((color) => `
  <button class="swatch ${current === color ? 'active' : ''} swatch-${color}" ${attribute}="${color}" role="radio" aria-checked="${current === color}" title="${escapeHtml(t(`color.${color}`))}" style="--swatch:${B.COLOR_HEX[color]}"></button>`).join('')}</div>`;

function renderRight() {
  const outer = root.querySelector('#right-panel');
  root.querySelector('#workspace').classList.toggle('no-right', !state.settings.showRightPanel);
  const { kind } = state.selection;
  const glyph = kind === 'card' ? 'addCard' : kind === 'column' ? 'addColumn' : 'board';
  const title = kind === 'card' ? t('props.card') : kind === 'column' ? t('props.column') : t('props.board');
  if (!state.settings.showRightPanel) {
    // Collapsed: a narrow rail of icons.
    outer.innerHTML = `<div class="panel-rail">
      <button class="rail-button" data-panel-toggle="right" title="${escapeHtml(t('panel.expandRight'))}" aria-label="${escapeHtml(t('panel.expandRight'))}">${icon('chevronLeft')}</button>
      <span class="rail-sep"></span>
      <button class="rail-button active" data-panel-section="right:props" title="${escapeHtml(t('panel.properties') + ': ' + title)}" aria-label="${escapeHtml(t('panel.properties'))}">${icon(glyph)}</button>
      <button class="rail-button" data-command="boardProps" title="${escapeHtml(t('action.boardProps'))}" aria-label="${escapeHtml(t('action.boardProps'))}">${icon('info')}</button>
    </div>`;
    return;
  }
  outer.innerHTML = `<div class="panel-header">${icon('panelRight')}<span>${t('panel.rightTitle')}</span>
      <button class="icon-button" data-panel-toggle="right" title="${escapeHtml(t('panel.collapseRight'))}" aria-label="${escapeHtml(t('panel.collapseRight'))}">${icon('chevronRight')}</button></div><div class="panel-content"></div>`;
  renderRightContent(outer.querySelector('.panel-content'));
}

function renderRightContent(panel) {
  const board = activeBoard();
  if (!board) { panel.innerHTML = ''; return; }
  const { kind, ids } = state.selection;
  const head = (glyph, title) => `<h3>${icon(glyph)}<span>${title}</span></h3>`;
  const row = (glyph, label, control) => `<label class="prop-row"><span class="prop-label">${icon(glyph)}${label}</span>${control}</label>`;

  if (kind === 'card' && ids.length === 1 && B.findCard(board, ids[0])) {
    const { card, column } = B.findCard(board, ids[0]);
    panel.innerHTML = `<section class="panel-section props" data-props="card">
      ${head('addCard', t('props.card'))}
      ${row('edit', t('field.title'), `<input data-card-field="title" value="${escapeHtml(card.title)}" title="${escapeHtml(t('field.title'))}" />`)}
      <label class="prop-row tall"><span class="prop-label">${icon('list')}${t('field.description')}</span><textarea data-card-field="description" rows="4" title="${escapeHtml(t('field.description'))}">${escapeHtml(card.description)}</textarea></label>
      <div class="prop-row"><span class="prop-label">${icon('palette')}${t('field.color')}</span>${colorPicker(card.color, 'data-card-color')}</div>
      ${row('flag', t('field.priority'), `<select data-card-field="priority" title="${escapeHtml(t('field.priority'))}">${B.PRIORITIES.map((p) => `<option value="${p}" ${card.priority === p ? 'selected' : ''}>${t(`priority.${p}`)}</option>`).join('')}</select>`)}
      ${row('calendar', t('field.due'), `<input type="date" data-card-field="due" value="${escapeHtml(card.due)}" title="${escapeHtml(t('field.due'))}" />`)}
      ${row('user', t('field.assignee'), `<input data-card-field="assignee" value="${escapeHtml(card.assignee)}" title="${escapeHtml(t('field.assignee'))}" />`)}
      ${row('tag', t('field.tags'), `<input data-card-field="tags" value="${escapeHtml(card.tags.join(', '))}" title="${escapeHtml(t('field.tags'))}" />`)}
      ${row('moveCol', t('field.column'), `<select data-card-column title="${escapeHtml(t('field.column'))}">${board.columns.map((c) => `<option value="${c.id}" ${c.id === column.id ? 'selected' : ''}>${escapeHtml(c.title || '—')}</option>`).join('')}</select>`)}
      <div class="prop-block"><span class="prop-label">${icon('checklist')}${t('field.checklist')} (${card.checklist.filter((i) => i.done).length}/${card.checklist.length})</span>
        <ul class="checklist">${card.checklist.map((item) => `<li>
          <input type="checkbox" data-check-toggle="${item.id}" ${item.done ? 'checked' : ''} title="${escapeHtml(item.text)}" />
          <input class="check-text ${item.done ? 'done' : ''}" data-check-text="${item.id}" value="${escapeHtml(item.text)}" title="${escapeHtml(item.text)}" />
          <button class="icon-button" data-check-remove="${item.id}" title="${escapeHtml(t('action.delete'))}" aria-label="${escapeHtml(t('action.delete'))}">${icon('close')}</button></li>`).join('')}</ul>
        <input class="check-add" data-check-add placeholder="${escapeHtml(t('field.addItem'))}" title="${escapeHtml(t('field.addItem'))}" />
      </div>
      ${attachmentListHtml(card)}
      <p class="prop-meta">${t('field.created')}: ${new Date(card.created).toLocaleString()}<br />${t('field.updated')}: ${new Date(card.updated).toLocaleString()}</p>
      <div class="prop-actions">
        <button class="small-button" data-command="duplicate" title="${escapeHtml(commandTip('duplicate'))}">${icon('duplicate')}<span>${t('action.duplicate')}</span></button>
        <button class="small-button danger" data-command="delete" title="${escapeHtml(commandTip('delete'))}">${icon('trash')}<span>${t('action.delete')}</span></button>
      </div>
    </section>`;
    return;
  }
  if (kind === 'card' && ids.length > 1) {
    panel.innerHTML = `<section class="panel-section props" data-props="multi">
      ${head('selectAll', t('props.multi', { count: ids.length }))}
      <div class="prop-row"><span class="prop-label">${icon('palette')}${t('field.color')}</span>${colorPicker('', 'data-multi-color')}</div>
      ${row('flag', t('field.priority'), `<select data-multi-priority title="${escapeHtml(t('field.priority'))}"><option value="">—</option>${B.PRIORITIES.map((p) => `<option value="${p}">${t(`priority.${p}`)}</option>`).join('')}</select>`)}
      <div class="prop-actions">
        <button class="small-button" data-command="copy" title="${escapeHtml(commandTip('copy'))}">${icon('copy')}<span>${t('action.copy')}</span></button>
        <button class="small-button" data-command="duplicate" title="${escapeHtml(commandTip('duplicate'))}">${icon('duplicate')}<span>${t('action.duplicate')}</span></button>
        <button class="small-button danger" data-command="delete" title="${escapeHtml(commandTip('delete'))}">${icon('trash')}<span>${t('action.delete')}</span></button>
      </div>
    </section>`;
    return;
  }
  if (kind === 'column' && B.findColumn(board, ids[0])) {
    const column = B.findColumn(board, ids[0]);
    panel.innerHTML = `<section class="panel-section props" data-props="column">
      ${head('addColumn', t('props.column'))}
      ${row('edit', t('field.title'), `<input data-column-field="title" value="${escapeHtml(column.title)}" title="${escapeHtml(t('field.title'))}" />`)}
      <div class="prop-row"><span class="prop-label">${icon('palette')}${t('field.color')}</span>${colorPicker(column.color, 'data-column-color')}</div>
      ${row('wip', t('field.wip'), `<input type="number" min="0" max="999" data-column-field="wip" value="${column.wip}" title="${escapeHtml(t('field.wip'))}" />`)}
      <p class="prop-meta">${t('field.cards')}: ${column.cards.length}</p>
      <div class="prop-actions">
        <button class="small-button" data-column-add="${column.id}" title="${escapeHtml(t('board.addCard'))}">${icon('plus')}<span>${t('board.addCard')}</span></button>
        <button class="small-button danger" data-command="delete" title="${escapeHtml(t('action.deleteColumn'))}">${icon('trash')}<span>${t('action.deleteColumn')}</span></button>
      </div>
    </section>`;
    return;
  }
  const s = B.stats(board);
  panel.innerHTML = `<section class="panel-section props" data-props="board">
    ${head('board', t('props.board'))}
    ${row('edit', t('field.title'), `<input data-board-field="title" value="${escapeHtml(board.title)}" title="${escapeHtml(t('field.title'))}" />`)}
    <label class="prop-row tall"><span class="prop-label">${icon('list')}${t('field.description')}</span><textarea data-board-field="description" rows="4" title="${escapeHtml(t('field.description'))}">${escapeHtml(board.description)}</textarea></label>
    <p class="prop-meta">${icon('info')} ${t('stats.line', s)}</p>
    <p class="prop-meta">${t('field.created')}: ${new Date(board.created).toLocaleString()}<br />${t('field.updated')}: ${new Date(board.updated).toLocaleString()}</p>
    <p class="panel-hint">${t('props.hint')}</p>
  </section>`;
}

function focusProperty(field) {
  if (!state.settings.showRightPanel) updateSettings({ showRightPanel: true });
  const input = root.querySelector(`#right-panel [data-card-field="${field}"], #right-panel [data-board-field="${field}"], #right-panel [data-column-field="${field}"]`);
  input?.focus();
  input?.select?.();
}

// ───────────────────────── status bar

function renderStatus() {
  const bar = root.querySelector('#statusbar');
  root.classList.toggle('no-status', !state.settings.showStatusBar);
  const doc = activeDoc();
  const board = doc?.board;
  const s = board ? B.stats(board) : null;
  const theme = resolveTheme(state.settings.theme, prefersDark());
  const notice = state.notice;
  const item = (glyph, text, title = text, extra = '') => `<span class="status-item ${extra}" title="${escapeHtml(title)}">${icon(glyph)}<span>${escapeHtml(text)}</span></span>`;
  bar.innerHTML = `
    ${doc ? item(doc.dirty ? 'edit' : 'check', doc.dirty ? t('status.modified') : t('status.saved'), doc.dirty ? t('status.modified') : t('status.saved'), doc.dirty ? 'modified' : 'saved') : ''}
    ${state.project ? item('project', `${state.project.project.name} · ${t(`storage.${state.project.project.storage.kind}`)}${projectDirty() ? ' *' : ''}`, `${t('panel.project')}: ${state.project.project.name} — ${state.project.path ?? t('project.unsaved')}`, 'project') : ''}
    ${doc ? item('file', doc.projectId ? `${state.project?.project.name ?? ''} › ${docName(doc)}` : doc.path ?? t('status.unsavedFile'), doc.path ?? t('status.unsavedFile'), 'path') : ''}
    ${s ? item('board', `${t('status.columns', { count: s.columns })} · ${t('status.cards', { count: s.cards })}`) : ''}
    ${item('selectAll', t('status.selected', { count: state.selection.kind === 'card' ? state.selection.ids.length : 0 }))}
    ${B.filterActive(state.filter) ? item('filter', t('status.filter'), t('status.filter'), 'warn') : ''}
    ${item('zoomIn', t('status.zoom', { value: state.settings.zoom }))}
    ${doc ? item('undo', t('status.history', { undo: doc.history.undoStack.length, redo: doc.history.redoStack.length })) : ''}
    ${item('palette', t('status.theme', { name: t(`theme.${state.settings.theme === 'system' ? 'system' : theme.id}`) }))}
    ${item('globe', t('status.language'))}
    ${item(desktop ? 'board' : 'globe', `${desktop ? t('status.desktop') : t('status.web')} · ${t('status.boards', { count: state.docs.length })}`)}
    <span class="status-notice ${notice?.kind ?? ''}" title="${escapeHtml(notice?.text ?? t('status.ready'))}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(notice?.text ?? t('status.ready'))}</span></span>
    ${state.settings.statusClock ? `<span class="status-item clock" title="${escapeHtml(new Date().toLocaleString())}">${icon('recent')}<span id="status-clock">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span>` : ''}`;
}

setInterval(() => {
  const clock = root.querySelector('#status-clock');
  if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}, 15000);

function renderAll() {
  renderMenubar();
  renderToolbar();
  renderTabs();
  renderLeft();
  renderBoard();
  renderRight();
  renderStatus();
  applyBackgroundStyle();
  document.title = `MyKanbanBoard v${state.info?.version ?? ''}${activeDoc() ? ` — ${docName(activeDoc())}` : ''}`;
}

// ───────────────────────── board operations

function targetColumnId(preferred) {
  const board = activeBoard();
  if (!board?.columns.length) return null;
  if (preferred && B.findColumn(board, preferred)) return preferred;
  if (state.selection.kind === 'column') return state.selection.ids[0];
  if (state.selection.kind === 'card') return B.findCard(board, state.selection.ids[0])?.column.id ?? board.columns[0].id;
  return board.columns[0].id;
}

function addCard(columnId, data = {}, index) {
  const target = targetColumnId(columnId);
  if (!target) return null;
  const card = change('op.addCard', (board) => B.addCard(board, target, { title: t('board.newCard'), ...data }, index));
  select('card', [card.id]);
  root.querySelector(`.card[data-card-id="${card.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  focusProperty('title');
  return card;
}

function addColumn(index, data = {}) {
  const column = change('op.addColumn', (board) => B.addColumn(board, { title: t('board.newColumn'), ...data }, index));
  select('column', [column.id]);
  root.querySelector(`.column[data-column-id="${column.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  focusProperty('title');
  return column;
}

function addFromTool(tool, columnId, index) {
  if (tool === 'column') return addColumn(index);
  const template = tool.startsWith('template:') ? tool.slice(9) : null;
  const data = template ? { ...B.TEMPLATES[template], title: t(`tool.${template}`) } : {};
  return addCard(columnId, data, index);
}

async function deleteSelection() {
  const board = activeBoard();
  if (state.selection.kind === 'column') {
    const column = B.findColumn(board, state.selection.ids[0]);
    if (!column) return;
    if (state.settings.confirmDelete && column.cards.length) {
      const choice = await ask({ icon: 'trash', title: t('confirm.deleteTitle'), message: t('confirm.deleteColumn', { name: column.title, count: column.cards.length }), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'delete', label: t('confirm.delete'), icon: 'trash', danger: true, primary: true }] });
      if (choice !== 'delete') return;
    }
    change('op.deleteColumn', (draft) => B.removeColumn(draft, column.id));
    select(null, []);
    return;
  }
  const ids = selectedCards();
  if (!ids.length) return;
  if (state.settings.confirmDelete && ids.length > 1) {
    const choice = await ask({ icon: 'trash', title: t('confirm.deleteTitle'), message: t('confirm.deleteCards', { count: ids.length }), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'delete', label: t('confirm.delete'), icon: 'trash', danger: true, primary: true }] });
    if (choice !== 'delete') return;
  }
  const removed = change('op.deleteCards', (draft) => B.removeCards(draft, ids));
  select(null, []);
  notify('success', t('notice.deleted', { count: removed }));
}

function duplicateSelection() {
  const ids = selectedCards();
  const copies = change('op.duplicate', (board) => B.duplicateCards(board, ids));
  select('card', copies.map((card) => card.id));
  notify('success', t('notice.duplicated', { count: copies.length }));
}

function shiftSelected(direction) {
  const ids = selectedCards();
  change('op.moveCard', (board) => ids.forEach((id) => B.shiftCard(board, id, direction)), { right: true });
}

function undo() {
  const doc = activeDoc();
  const label = doc?.undo();
  if (!label) return notify('info', t('notice.nothingUndo'));
  pruneSelection();
  renderAfterHistory();
  notify('success', t('notice.undone', { label }));
}

function redo() {
  const doc = activeDoc();
  const label = doc?.redo();
  if (!label) return notify('info', t('notice.nothingRedo'));
  pruneSelection();
  renderAfterHistory();
  notify('success', t('notice.redone', { label }));
}

function pruneSelection() {
  const board = activeBoard();
  if (state.selection.kind === 'card') state.selection.ids = state.selection.ids.filter((id) => B.findCard(board, id));
  if (state.selection.kind === 'column') state.selection.ids = state.selection.ids.filter((id) => B.findColumn(board, id));
  if (!state.selection.ids.length && state.selection.kind !== 'board') state.selection.kind = null;
}

function renderAfterHistory() {
  renderBoard();
  renderTabs();
  renderLeft();
  renderRight();
  renderStatus();
  renderToolbarState();
}

// ───────────────────────── clipboard

async function copyCards({ silent = false } = {}) {
  const board = activeBoard();
  const cards = selectedCards().map((id) => B.findCard(board, id)?.card).filter(Boolean);
  if (!cards.length) return 0;
  const text = cardsToClipboard(cards);
  state.clipboard = text;
  try {
    await native.clipboardWrite(text);
  } catch (error) {
    if (desktop) throw error;
  }
  if (!silent) notify('success', t('notice.copied', { count: cards.length }));
  renderToolbarState();
  return cards.length;
}

async function cutCards() {
  const ids = selectedCards();
  const count = await copyCards({ silent: true });
  if (!count) return;
  change('op.cut', (board) => B.removeCards(board, ids));
  select(null, []);
  notify('success', t('notice.cut', { count }));
}

async function pasteCards(context = {}) {
  let text = '';
  try {
    text = await native.clipboardRead();
  } catch (error) {
    if (desktop) return showError('error.paste', error);
    text = state.clipboard;
  }
  const cards = cardsFromClipboard(text || (desktop ? '' : state.clipboard));
  if (!cards.length) return notify('info', t('notice.clipboardEmpty'));
  const board = activeBoard();
  let columnId = context.columnId ?? targetColumnId();
  let index;
  if (!context.columnId && state.selection.kind === 'card') {
    const found = B.findCard(board, state.selection.ids.at(-1));
    if (found) { columnId = found.column.id; index = found.index + 1; }
  }
  const copies = change('op.paste', (draft) => B.insertCards(draft, columnId, cards, index));
  select('card', copies.map((card) => card.id));
  notify('success', t('notice.pasted', { count: copies.length }));
}

// ───────────────────────── zoom, settings, theme

function setZoom(value) {
  const zoom = Math.max(ZOOM.min, Math.min(ZOOM.max, Math.round(value / ZOOM.step) * ZOOM.step));
  if (zoom === state.settings.zoom) return;
  updateSettings({ zoom });
}

function updateSettings(patch) {
  const previous = state.settings;
  state.settings = { ...state.settings, ...patch };
  storeSettings(globalThis.localStorage, state.settings);
  applySettings(previous);
}

/** Applies settings after a change (from this window or from the settings popup). */
function applySettings(previous = {}) {
  const s = state.settings;
  const theme = resolveTheme(s.theme, prefersDark());
  applyTheme(theme);
  applyFont(s);
  native.setWindowTheme(theme.dark);
  if (s.language !== getLanguage()) {
    setLanguage(s.language);
    native.setBackendLanguage(s.language);
    if (previous.language) notify('info', t('notice.language'));
  }
  if (s.backgroundImage !== previous.backgroundImage) loadBackground();
  if (s.theme !== previous.theme && previous.theme) notify('info', t('notice.theme', { name: t(`theme.${s.theme}`) }));
  root.classList.toggle('no-status', !s.showStatusBar);
  renderAll();
}

function openThemeMenu(anchor) {
  const items = THEME_IDS.map((id) => ({ id: `theme:${id}`, label: t(`theme.${id}`), icon: id === 'system' ? 'sun' : (THEMES.find((theme) => theme.id === id)?.dark ? 'moon' : 'sun'), checked: state.settings.theme === id }));
  const element = root.querySelector('[data-command="theme"]');
  showMenu(items, anchor ?? anchorBelow(element), 'theme', { header: { icon: 'palette', title: t('action.theme') } });
}

// ───────────────────────── background image

async function loadBackground() {
  const layer = root.querySelector('.board-bg');
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
  const layer = root.querySelector('.board-bg');
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
  await withProgress('progress.background', file.name, async () => native.storeWebBackground(file));
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

/**
 * Runs a file task; when it takes longer than a moment, a progress popup shows
 * how far it got (bytes read/written, reported by the backend).
 */
async function withProgress(titleKey, name, task) {
  const op = B.newId('op');
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

const findOpenDoc = (path) => state.docs.find((doc) => doc.path && doc.path.replace(/\\/g, '/').toLowerCase() === path.replace(/\\/g, '/').toLowerCase());

function rememberRecent(entry) {
  state.recent = addRecent(state.recent, entry);
  storeRecent(globalThis.localStorage, state.recent);
}

async function openPath(path, { quiet = false } = {}) {
  const existing = findOpenDoc(path);
  if (existing) {
    activateDoc(existing.id);
    if (!quiet) notify('info', t('notice.alreadyOpen', { name: baseName(path) }));
    return existing;
  }
  if (isProjectFileName(path)) return openProject(path, { quiet });
  try {
    const text = await withProgress('progress.open', baseName(path), (op) => native.readTextFile(path, op));
    const { board, attachments: contents } = parseFile(text);
    attachments.merge(contents);
    const doc = addDocument(new BoardDocument(board, { path }));
    rememberRecent({ path, title: board.title });
    updateSettings({ lastDirectory: directoryOf(path) || state.settings.lastDirectory });
    if (!quiet) notify('success', t('notice.opened', { name: baseName(path) }));
    return doc;
  } catch (error) {
    if (!quiet) showError('error.open', error, path);
    return null;
  }
}

function openText(name, text, handle = null) {
  if (isProjectFileName(name)) return openProjectText(name, text, handle);
  const { board, attachments: contents } = parseFile(text);
  attachments.merge(contents);
  const doc = addDocument(new BoardDocument(board, { name, handle }));
  if (handle) {
    const key = `${name}`;
    native.storeWebHandle(key, handle);
    rememberRecent({ path: key, title: board.title, web: true });
  }
  renderAll();
  notify('success', t('notice.opened', { name }));
  return doc;
}

async function openWithDialog() {
  try {
    if (desktop) {
      const paths = await native.chooseBoardToOpen(state.settings.lastDirectory);
      for (const path of paths) await openPath(path);
    } else {
      const files = await native.pickBoardFilesWeb();
      for (const file of files) {
        try {
          await withProgress('progress.open', file.name, async (op, report) => { report({ done: file.size ?? 0, total: file.size ?? 0 }); });
          await openText(file.name, file.text, file.handle);
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
  if (doc.projectId && !saveAs) return saveProject();
  const text = serialize(doc.board, attachments.collect(doc.board));
  try {
    if (desktop) {
      let path = doc.path;
      if (!path || saveAs) {
        const suggested = `${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${stripExtension(docName(doc)).replace(/[\\/:*?"<>|]/g, '_') || 'board'}.mkanban`;
        path = await native.chooseBoardToSave(suggested);
        if (!path) return false;
        path = withExtension(path);
      }
      await withProgress('progress.save', baseName(path), (op) => native.writeTextFile(path, text, op));
      doc.markSaved(path);
      rememberRecent({ path, title: doc.board.title });
      updateSettings({ lastDirectory: directoryOf(path) || state.settings.lastDirectory });
    } else {
      const name = `${stripExtension(docName(doc)) || 'board'}.mkanban`;
      const saved = await withProgress('progress.save', name, () => native.saveBoardWeb(text, { name, handle: doc.handle, saveAs }));
      if (!saved) return false;
      doc.handle = saved.handle;
      doc.name = saved.name;
      doc.markSaved(null);
      if (saved.handle) {
        native.storeWebHandle(saved.name, saved.handle);
        rememberRecent({ path: saved.name, title: doc.board.title, web: true });
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
  if (projectDirty() && !(await saveProject())) return false;
  for (const doc of state.docs.filter((item) => item.dirty && !item.projectId)) {
    if (!(await saveDoc(doc))) return false;
  }
  return true;
}

async function closeDoc(doc, { force = false } = {}) {
  if (!doc) return true;
  if (doc.projectId && !force) return removeFromProject(doc, { close: true });
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
    return;
  }
  const [exists] = await native.pathsExist([path]);
  if (!exists) {
    showError('error.open', new Error(t('error.recentMissing', { path })), path);
    return;
  }
  await openPath(path);
  renderAll();
}

function openRecentPopup() {
  popups.open('recent', { desktop });
}

// ───────────────────────── print

function openPrint() {
  const doc = activeDoc();
  popups.open('print', {
    boards: state.docs.map((item) => item.board),
    names: state.docs.map(docName),
    current: state.docs.indexOf(doc),
    selected: selectedCards(),
  });
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

/** Before the window closes: unsaved boards → save / don't save / cancel. */
async function confirmExit() {
  const dirty = state.docs.filter((doc) => doc.dirty && !doc.projectId);
  const projectChanged = projectDirty();
  if (!dirty.length && !projectChanged) return true;
  const choice = await ask({
    kind: 'exit', icon: 'save', title: t('confirm.exitTitle'), message: t('confirm.exitMessage'),
    items: [...(projectChanged ? [`${t('panel.project')}: ${state.project.project.name}`] : []), ...dirty.map(docName)],
    buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }],
  });
  if (choice === 'save') return (!projectChanged || (await saveProject())) && saveAll();
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
  const header = context.header ?? (MENUS[name] ? { icon: MENU_ICONS[name], title: t(`menu.${name}`) } : { icon: 'board', title: 'MyKanbanBoard' });
  const result = await popups.open('menu', { items, name, header }, { anchor });
  if (state.openMenu === name) {
    state.openMenu = null;
    state.lastMenuClose = { name, at: Date.now() };
    renderMenubar();
  }
  const id = result?.id;
  if (!id) return;
  if (id.startsWith('theme:')) return updateSettings({ theme: id.slice(6) });
  if (id.startsWith('custom:')) return context.handlers?.[id]?.();
  return run(id, context);
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
  const card = target.closest('.card');
  const column = target.closest('.column');
  const tab = target.closest('.tab');
  const editable = target.closest('input, textarea, [contenteditable="true"]');
  if (editable) return textContextMenu(editable, anchor);
  if (tab) {
    activateDoc(tab.dataset.doc);
    return showMenu(menuItems(['save', 'saveAs', '-', 'renameBoard', 'print', '-', 'closeTab', 'closeOthers', '-', 'new']), anchor, 'context', { header: { icon: 'board', title: docName(activeDoc()) } });
  }
  if (card) {
    const id = card.dataset.cardId;
    if (!selectedCards().includes(id)) select('card', [id]);
    const colors = B.CARD_COLORS.map((color) => ({ id: `custom:color:${color}`, label: `${t('action.colorCard')}: ${t(`color.${color}`)}`, icon: 'palette', swatch: B.COLOR_HEX[color] }));
    const handlers = Object.fromEntries(B.CARD_COLORS.map((color) => [`custom:color:${color}`, () => change('op.editCard', (board) => selectedCards().forEach((cardId) => B.updateCard(board, cardId, { color })), { right: true })]));
    return showMenu([...menuItems(['editCard', '-', 'cut', 'copy', 'paste', 'duplicate', '-', 'moveLeft', 'moveRight', '-']), ...colors.slice(1, 6), { separator: true }, ...menuItems(['delete'])], anchor, 'context', { handlers, header: { icon: 'addCard', title: selectedCards().length > 1 ? t('props.multi', { count: selectedCards().length }) : t('props.card') } });
  }
  if (column) {
    const id = column.dataset.columnId;
    select('column', [id]);
    const board = activeBoard();
    const index = board.columns.findIndex((item) => item.id === id);
    const handlers = {
      'custom:addCard': () => addCard(id),
      'custom:addLeft': () => addColumn(index),
      'custom:addRight': () => addColumn(index + 1),
      'custom:rename': () => startColumnRename(id),
      'custom:left': () => change('op.moveColumn', (draft) => B.moveColumn(draft, id, index - 1)),
      'custom:right': () => change('op.moveColumn', (draft) => B.moveColumn(draft, id, index + 1)),
      'custom:sortTitle': () => change('op.sort', (draft) => B.sortColumn(draft, id, 'title')),
      'custom:sortPriority': () => change('op.sort', (draft) => B.sortColumn(draft, id, 'priority')),
      'custom:sortDue': () => change('op.sort', (draft) => B.sortColumn(draft, id, 'due')),
      'custom:clear': () => change('op.clearColumn', (draft) => B.clearColumn(draft, id), { right: true }),
      'custom:paste': () => pasteCards({ columnId: id }),
    };
    const items = [
      { id: 'custom:addCard', label: t('action.newCardHere'), icon: 'addCard' },
      { id: 'custom:paste', label: t('action.paste'), icon: 'paste', shortcut: keyLabel('Ctrl+V') },
      { separator: true },
      { id: 'custom:addLeft', label: t('action.addColumnLeft'), icon: 'addColumn' },
      { id: 'custom:addRight', label: t('action.addColumnRight'), icon: 'addColumn' },
      { id: 'custom:rename', label: t('action.renameColumn'), icon: 'edit' },
      { id: 'custom:left', label: t('action.columnLeft'), icon: 'arrowLeft', disabled: index <= 0 },
      { id: 'custom:right', label: t('action.columnRight'), icon: 'arrowRight', disabled: index >= board.columns.length - 1 },
      { separator: true },
      { id: 'custom:sortTitle', label: t('action.sortTitle'), icon: 'sort' },
      { id: 'custom:sortPriority', label: t('action.sortPriority'), icon: 'flag' },
      { id: 'custom:sortDue', label: t('action.sortDue'), icon: 'calendar' },
      { separator: true },
      { id: 'custom:clear', label: t('action.clearColumn'), icon: 'clear', disabled: !B.findColumn(board, id)?.cards.length },
      ...menuItems(['delete']).map((item) => ({ ...item, label: t('action.deleteColumn') })),
    ];
    return showMenu(items, anchor, 'context', { handlers, columnId: id, header: { icon: 'addColumn', title: `${t('props.column')}: ${B.findColumn(board, id)?.title ?? ''}` } });
  }
  if (target.closest('#board-area')) {
    return showMenu(menuItems(['addColumn', 'addCard', 'paste', '-', 'selectAll', 'boardProps', '-', 'zoomIn', 'zoomOut', 'zoomReset', '-', 'background', 'clearBackground', '-', 'print']), anchor, 'context', { header: { icon: 'board', title: `${t('props.board')}: ${activeBoard()?.title ?? ''}` } });
  }
  return showMenu(menuItems(['new', 'open', 'save', '-', 'undo', 'redo', '-', 'settings', 'about']), anchor, 'context', { header: { icon: 'board', title: 'MyKanbanBoard' } });
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
  const hasSelection = element.selectionStart !== element.selectionEnd;
  showMenu([
    { id: 'custom:undo', label: t('action.undo'), icon: 'undo', shortcut: keyLabel('Ctrl+Z') },
    { separator: true },
    { id: 'custom:cut', label: t('action.cut'), icon: 'cut', shortcut: keyLabel('Ctrl+X'), disabled: !hasSelection },
    { id: 'custom:copy', label: t('action.copy'), icon: 'copy', shortcut: keyLabel('Ctrl+C'), disabled: !hasSelection },
    { id: 'custom:paste', label: t('action.paste'), icon: 'paste', shortcut: keyLabel('Ctrl+V') },
    { separator: true },
    { id: 'custom:selectAll', label: t('action.selectText'), icon: 'selectAll', shortcut: keyLabel('Ctrl+A') },
  ], anchor, 'context', { handlers, header: { icon: 'edit', title: t('menu.edit') } });
}

// ───────────────────────── dragging (cards, columns, tools)

let drag = null;
let suppressClick = false;

function beginPointerDrag(event, info) {
  drag = { ...info, startX: event.clientX, startY: event.clientY, started: false, pointerId: event.pointerId };
}

function startDrag() {
  drag.started = true;
  document.body.classList.add('dragging');
  const ghost = document.createElement('div');
  ghost.className = `drag-ghost drag-${drag.type}`;
  if (drag.type === 'card') ghost.append(root.querySelector(`.card[data-card-id="${drag.id}"]`).cloneNode(true));
  else if (drag.type === 'column') ghost.innerHTML = `<div class="ghost-column">${icon('addColumn')}<span>${escapeHtml(B.findColumn(activeBoard(), drag.id)?.title ?? '')}</span></div>`;
  else ghost.innerHTML = `<div class="ghost-tool">${root.querySelector(`[data-tool="${drag.tool}"]`)?.innerHTML ?? ''}</div>`;
  document.body.append(ghost);
  drag.ghost = ghost;
  root.querySelector(`.card[data-card-id="${drag.id}"]`)?.classList.add('drag-source');
  root.querySelector(`.column[data-column-id="${drag.id}"]`)?.classList.add('drag-source');
}

function dropTarget(event) {
  const element = document.elementFromPoint(event.clientX, event.clientY);
  const placingColumn = drag.type === 'column' || drag.tool === 'column';
  const board = activeBoard();
  if (!element?.closest('#board-area') || !board) return null;
  if (placingColumn) {
    const columns = [...root.querySelectorAll('.column')].filter((column) => column.dataset.columnId !== drag.id);
    let index = columns.length;
    for (let i = 0; i < columns.length; i++) {
      const rect = columns[i].getBoundingClientRect();
      if (event.clientX < rect.left + rect.width / 2) { index = i; break; }
    }
    return { kind: 'column', index, before: columns[index] ?? null };
  }
  const columnElement = element.closest('.column') ?? nearestColumn(event.clientX);
  if (!columnElement) return null;
  const cards = [...columnElement.querySelectorAll('.card')].filter((card) => card.dataset.cardId !== drag.id && !card.classList.contains('filtered'));
  let index = cards.length;
  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect();
    if (event.clientY < rect.top + rect.height / 2) { index = i; break; }
  }
  // Index among all cards of the column (filtered ones included), without the dragged card.
  const column = B.findColumn(board, columnElement.dataset.columnId);
  const others = column.cards.filter((card) => card.id !== drag.id);
  const realIndex = index < cards.length ? others.findIndex((card) => card.id === cards[index].dataset.cardId) : others.length;
  return { kind: 'card', columnId: column.id, index: realIndex, before: cards[index] ?? null, container: columnElement.querySelector('.cards') };
}

function nearestColumn(x) {
  let best = null;
  let distance = Infinity;
  for (const column of root.querySelectorAll('.column')) {
    const rect = column.getBoundingClientRect();
    const d = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    if (d < distance) { distance = d; best = column; }
  }
  return distance < 60 ? best : null;
}

function showPlaceholder(target) {
  root.querySelector('.drop-placeholder')?.remove();
  if (!target) return;
  const placeholder = document.createElement('div');
  placeholder.className = `drop-placeholder ${target.kind === 'column' ? 'vertical' : ''}`;
  if (target.kind === 'column') {
    const board = root.querySelector('#board');
    board.insertBefore(placeholder, target.before);
  } else {
    target.container.insertBefore(placeholder, target.before ?? target.container.querySelector('.column-empty'));
  }
}

function autoScroll(event) {
  const area = root.querySelector('#board-area');
  const rect = area.getBoundingClientRect();
  const edge = 40;
  if (event.clientX > rect.right - edge) area.scrollLeft += 18;
  else if (event.clientX < rect.left + edge) area.scrollLeft -= 18;
  const list = document.elementFromPoint(event.clientX, event.clientY)?.closest('.cards');
  if (list) {
    const listRect = list.getBoundingClientRect();
    if (event.clientY > listRect.bottom - edge) list.scrollTop += 14;
    else if (event.clientY < listRect.top + edge) list.scrollTop -= 14;
  }
}

window.addEventListener('pointermove', (event) => {
  if (!drag) return;
  if (!drag.started) {
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
    startDrag();
  }
  drag.ghost.style.transform = `translate(${event.clientX + 8}px, ${event.clientY + 8}px)`;
  drag.target = dropTarget(event);
  showPlaceholder(drag.target);
  autoScroll(event);
});

function endDrag(cancel = false) {
  const current = drag;
  drag = null;
  if (!current?.started) return;
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  current.ghost?.remove();
  root.querySelector('.drop-placeholder')?.remove();
  document.body.classList.remove('dragging');
  root.querySelectorAll('.drag-source').forEach((element) => element.classList.remove('drag-source'));
  const target = current.target;
  if (cancel || !target) return;
  if (current.type === 'card' && target.kind === 'card') {
    change('op.moveCard', (board) => B.moveCard(board, current.id, target.columnId, target.index), { right: true });
    select('card', [current.id]);
  } else if (current.type === 'column' && target.kind === 'column') {
    change('op.moveColumn', (board) => B.moveColumn(board, current.id, target.index));
  } else if (current.type === 'tool') {
    if (target.kind === 'column') addFromTool('column', null, target.index);
    else addFromTool(current.tool, target.columnId, target.index);
  }
}

window.addEventListener('pointerup', () => endDrag(false));
window.addEventListener('pointercancel', () => endDrag(true));

// ───────────────────────── external drag & drop

async function handleDroppedPaths(paths, point) {
  const columnId = point ? columnAt(point) : null;
  const cardId = point ? cardAt(point) : null;
  if (cardId) return attachPaths(cardId, paths);
  for (const path of paths) {
    const name = baseName(path);
    try {
      if (isBoardFileName(name) || isProjectFileName(name)) await openPath(path);
      else if (isImageFileName(name)) await setBackgroundFromPath(path);
      else if (isTextFileName(name)) {
        const text = await withProgress('progress.import', name, (op) => native.readTextFile(path, op));
        importTextAsCards(text, columnId);
      } else notify('error', t('notice.unsupportedDrop', { name }));
    } catch (error) {
      showError('error.drop', error, path);
    }
  }
  renderAll();
}

async function handleDroppedFiles(files, text, point) {
  const columnId = point ? columnAt(point) : null;
  const cardId = point ? cardAt(point) : null;
  if (cardId && files.length) return attachWebFiles(cardId, files);
  for (const file of files) {
    try {
      if (isBoardFileName(file.name) || isProjectFileName(file.name)) await openText(file.name, await file.text());
      else if (isImageFileName(file.name) || file.type.startsWith('image/')) await setBackgroundFromFile(file);
      else if (isTextFileName(file.name) || file.type.startsWith('text/')) importTextAsCards(await file.text(), columnId);
      else notify('error', t('notice.unsupportedDrop', { name: file.name }));
    } catch (error) {
      showError('error.drop', error, file.name);
    }
  }
  if (!files.length && text) importTextAsCards(text, columnId);
}

function cardAt(point) {
  return document.elementFromPoint(point.x, point.y)?.closest('.card')?.dataset.cardId ?? null;
}

function columnAt(point) {
  const element = document.elementFromPoint(point.x, point.y);
  return element?.closest('.column')?.dataset.columnId ?? null;
}

function importTextAsCards(text, columnId) {
  if (!activeDoc()) newBoard();
  const cards = cardsFromClipboard(text);
  if (!cards.length) return;
  const target = targetColumnId(columnId);
  const copies = change('op.import', (board) => B.insertCards(board, target, cards));
  select('card', copies.map((card) => card.id));
  notify('success', t('notice.imported', { count: copies.length }));
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
    if (suppressClick) return;
    const target = event.target;
    const menu = target.closest('[data-menu]');
    if (menu) {
      const name = menu.dataset.menu;
      if (state.lastMenuClose.name === name && Date.now() - state.lastMenuClose.at < 300) return;
      return openMenubarMenu(name);
    }
    const command = target.closest('[data-command]');
    if (command && !command.disabled) {
      const anchor = ['theme', 'projectMenu'].includes(command.dataset.command) ? anchorBelow(command) : undefined;
      return run(command.dataset.command, { anchor });
    }
    const closeDocButton = target.closest('[data-close-doc]');
    if (closeDocButton) return closeDoc(state.docs.find((doc) => doc.id === closeDocButton.dataset.closeDoc));
    const tab = target.closest('.tab');
    if (tab) return activateDoc(tab.dataset.doc);
    const projectBoard = target.closest('[data-project-board]');
    if (projectBoard) return activateDoc(projectBoard.dataset.projectBoard);
    const thumb = target.closest('[data-att-view]');
    if (thumb) return viewAttachment(thumb.dataset.card ?? state.selection.ids[0], thumb.dataset.attView);
    const attAction = target.closest('[data-att-open], [data-att-save], [data-att-remove]');
    if (attAction) return attachmentAction(attAction);
    const panelToggle = target.closest('[data-panel-toggle]');
    if (panelToggle) return run(panelToggle.dataset.panelToggle === 'left' ? 'leftPanel' : 'rightPanel');
    const section = target.closest('[data-panel-section]');
    if (section) {
      const [side, name] = section.dataset.panelSection.split(':');
      updateSettings(side === 'left' ? { showLeftPanel: true } : { showRightPanel: true });
      if (name === 'filter') return focusSearch();
      return root.querySelector(`#${side}-panel [data-section="${name}"]`)?.scrollIntoView({ block: 'start' });
    }
    const scroll = target.closest('[data-tab-scroll]');
    if (scroll) return scrollTabs(Number(scroll.dataset.tabScroll));
    const tool = target.closest('[data-tool]');
    if (tool && !tool.disabled) return addFromTool(tool.dataset.tool);
    const columnAdd = target.closest('[data-column-add]');
    if (columnAdd) return addCard(columnAdd.dataset.columnAdd);
    const columnMenu = target.closest('[data-column-menu]');
    if (columnMenu) {
      const rect = columnMenu.getBoundingClientRect();
      return contextMenuFor({ target: columnMenu, clientX: rect.left, clientY: rect.bottom });
    }
    const gotoColumn = target.closest('[data-goto-column]');
    if (gotoColumn) {
      root.querySelector(`.column[data-column-id="${gotoColumn.dataset.gotoColumn}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
      return select('column', [gotoColumn.dataset.gotoColumn]);
    }
    const swatch = target.closest('[data-card-color], [data-column-color], [data-multi-color]');
    if (swatch) return onSwatch(swatch);
    const checkRemove = target.closest('[data-check-remove]');
    if (checkRemove) return editChecklist((list) => list.filter((item) => item.id !== checkRemove.dataset.checkRemove));
    const card = target.closest('.card');
    if (card) return select('card', [card.dataset.cardId], { toggle: event.ctrlKey || event.metaKey });
    const column = target.closest('.column-head');
    if (column) return select('column', [column.closest('.column').dataset.columnId]);
    if (target.closest('#board-area') && !target.closest('.column')) return select(null, []);
    return undefined;
  });

  root.addEventListener('dblclick', (event) => {
    const title = event.target.closest('.column-title');
    if (title) return startColumnRename(title.closest('.column').dataset.columnId);
    const card = event.target.closest('.card');
    if (card) { select('card', [card.dataset.cardId]); return focusProperty('title'); }
    const tab = event.target.closest('.tab');
    if (tab) return run('renameBoard');
    if (event.target.closest('#tabs') && !tab) return run('new');
    return undefined;
  });

  root.addEventListener('auxclick', (event) => {
    const tab = event.target.closest('.tab');
    if (tab && event.button === 1) closeDoc(state.docs.find((doc) => doc.id === tab.dataset.doc));
  });

  root.addEventListener('pointerdown', (event) => {
    // A click in the main window closes an open menu (it normally closes itself on losing focus).
    if (state.openMenu && desktop) native.invoke('hide_popup', { kind: 'menu' }).catch(() => {});
    if (event.button !== 0) return;
    const target = event.target;
    if (target.closest('button:not([data-tool]), input, textarea, select')) return;
    const tool = target.closest('[data-tool]');
    if (tool && !tool.disabled) return beginPointerDrag(event, { type: 'tool', tool: tool.dataset.tool });
    const card = target.closest('.card');
    if (card) return beginPointerDrag(event, { type: 'card', id: card.dataset.cardId });
    const head = target.closest('.column-head');
    if (head) return beginPointerDrag(event, { type: 'column', id: head.closest('.column').dataset.columnId });
    return undefined;
  });

  root.addEventListener('pointerover', (event) => {
    const menu = event.target.closest('[data-menu]');
    if (menu && state.openMenu && MENUS[state.openMenu] && state.openMenu !== menu.dataset.menu) openMenubarMenu(menu.dataset.menu);
  });

  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (drag) return;
    contextMenuFor(event);
  });

  // Properties panel and filters.
  root.addEventListener('change', (event) => {
    const target = event.target;
    const board = activeBoard();
    if (!board) return;
    if (target.dataset.cardField) {
      const id = state.selection.ids[0];
      change('op.editCard', (draft) => B.updateCard(draft, id, { [target.dataset.cardField]: target.value }));
    } else if ('cardColumn' in target.dataset) {
      const id = state.selection.ids[0];
      change('op.moveCard', (draft) => B.moveCard(draft, id, target.value, Infinity));
    } else if (target.dataset.columnField) {
      change('op.editColumn', (draft) => B.updateColumn(draft, state.selection.ids[0], { [target.dataset.columnField]: target.value }));
    } else if (target.dataset.boardField) {
      change('op.editBoard', (draft) => { draft[target.dataset.boardField] = target.value; draft.updated = new Date().toISOString(); });
    } else if ('multiPriority' in target.dataset && target.value) {
      change('op.editCard', (draft) => state.selection.ids.forEach((id) => B.updateCard(draft, id, { priority: target.value })));
    } else if ('checkToggle' in target.dataset) {
      editChecklist((list) => list.map((item) => (item.id === target.dataset.checkToggle ? { ...item, done: target.checked } : item)));
    } else if ('checkText' in target.dataset) {
      editChecklist((list) => list.map((item) => (item.id === target.dataset.checkText ? { ...item, text: target.value } : item)), false);
    } else if (target.dataset.filter) {
      state.filter[target.dataset.filter] = target.type === 'checkbox' ? target.checked : target.value;
      renderBoard();
      renderLeft();
      renderStatus();
    }
  });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (target.id === 'filter-text') {
      state.filter.text = target.value;
      renderBoard();
      renderStatus();
      const count = root.querySelector('.filter-foot .muted');
      const all = B.allCards(activeBoard() ?? { columns: [] });
      if (count) count.textContent = t('filter.matches', { shown: all.filter((card) => B.matchesFilter(card, state.filter)).length, total: all.length });
      root.querySelector('[data-command="clearFilter"]')?.toggleAttribute('disabled', !B.filterActive(state.filter));
    }
  });

  root.addEventListener('keydown', (event) => {
    if (event.target.matches('[data-check-add]') && event.key === 'Enter' && event.target.value.trim()) {
      const text = event.target.value.trim();
      editChecklist((list) => [...list, { text, done: false }]);
      root.querySelector('[data-check-add]')?.focus();
    }
  });

  root.querySelector('#board-area').addEventListener('wheel', (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    setZoom(state.settings.zoom + (event.deltaY < 0 ? ZOOM.step : -ZOOM.step));
  }, { passive: false });

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
    if (desktop && state.minWidth && window.innerWidth < state.minWidth - 1) native.setMinimumSize(state.minWidth, 560).catch(() => {});
  });

  document.addEventListener('keydown', onKeyDown, true);

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

function editChecklist(transform, rerender = true) {
  const id = state.selection.ids[0];
  const card = B.findCard(activeBoard(), id)?.card;
  if (!card) return;
  change('op.checklist', (board) => B.updateCard(board, id, { checklist: transform(card.checklist.map((item) => ({ ...item }))) }), { right: rerender });
}

function onSwatch(swatch) {
  if (swatch.dataset.cardColor) change('op.editCard', (board) => B.updateCard(board, state.selection.ids[0], { color: swatch.dataset.cardColor }), { right: true });
  else if (swatch.dataset.columnColor) change('op.editColumn', (board) => B.updateColumn(board, state.selection.ids[0], { color: swatch.dataset.columnColor }), { right: true });
  else if (swatch.dataset.multiColor) change('op.editCard', (board) => state.selection.ids.forEach((id) => B.updateCard(board, id, { color: swatch.dataset.multiColor })));
}

const SHORTCUTS = [
  ['n', false, 'new'], ['o', false, 'open'], ['s', false, 'save'], ['s', true, 'saveAs'], ['r', false, 'recent'], ['w', false, 'closeTab'],
  ['z', false, 'undo'], ['y', false, 'redo'], ['z', true, 'redo'], ['x', false, 'cut'], ['c', false, 'copy'], ['v', false, 'paste'],
  ['d', false, 'duplicate'], ['a', false, 'selectAll'], ['n', true, 'addColumn'], ['enter', false, 'addCard'], ['p', false, 'print'],
  ['=', false, 'zoomIn'], ['+', false, 'zoomIn'], ['+', true, 'zoomIn'], ['-', false, 'zoomOut'], ['0', false, 'zoomReset'], ['f', false, 'find'],
  [',', false, 'settings'], ['l', true, 'language'], ['tab', false, 'nextTab'], ['tab', true, 'prevTab'], ['!', true, 'leftPanel'], ['1', true, 'leftPanel'],
  ['@', true, 'rightPanel'], ['2', true, 'rightPanel'], ['q', false, 'exit'],
];

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  const editing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  if (drag && key === 'escape') { endDrag(true); return; }
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
  if (key === 'f1') { event.preventDefault(); run('about'); return; }
  if (key === 'f2' && !editing) { event.preventDefault(); run('renameBoard'); return; }
  if (editing) {
    if (key === 'escape') event.target.blur();
    return;
  }
  if (key === 'delete' || (isMac && key === 'backspace')) { event.preventDefault(); run('delete'); }
  else if (key === 'escape') run('clearSelection');
  else if (key === 'enter' && selectedCards().length === 1) { event.preventDefault(); run('editCard'); }
  else if (event.altKey && key === 'arrowleft') { event.preventDefault(); run('moveLeft'); }
  else if (event.altKey && key === 'arrowright') { event.preventDefault(); run('moveRight'); }
}

// ───────────────────────── projects

/** The open project's boards, in project order. */
function projectDocs() {
  const p = state.project;
  if (!p) return [];
  return p.project.boards
    .map((entry) => state.docs.find((doc) => doc.projectId === p.project.id && doc.board.id === entry.id))
    .filter(Boolean);
}

/** What makes the project itself "changed": metadata, storage and the board list. */
function projectKey(p) {
  const { password, ...storage } = p.project.storage;
  return JSON.stringify({ name: p.project.name, description: p.project.description, storage, boards: p.project.boards.map((entry) => entry.id) });
}

function projectDirty() {
  const p = state.project;
  if (!p) return false;
  return !p.path || projectKey(p) !== p.saved || projectDocs().some((doc) => doc.dirty);
}

function projectSectionHtml() {
  const p = state.project;
  if (!p) {
    return `<section class="panel-section project-section" data-section="project">
      <h3>${icon('project')}<span>${t('panel.project')}</span></h3>
      <p class="panel-hint">${t('project.none')}</p>
      <div class="prop-actions">
        <button class="small-button" data-command="newProject" title="${escapeHtml(t('action.newProject'))}">${icon('plus')}<span>${t('project.new')}</span></button>
        <button class="small-button" data-command="openProject" title="${escapeHtml(commandTip('openProject'))}">${icon('open')}<span>${t('project.open')}</span></button>
      </div>
    </section>`;
  }
  const kind = p.project.storage.kind;
  return `<section class="panel-section project-section" data-section="project">
    <h3>${icon('project')}<span>${t('panel.project')}</span></h3>
    <div class="project-name" title="${escapeHtml(p.path ?? t('project.unsaved'))}">${icon('project')}<b>${escapeHtml(p.project.name)}</b>${projectDirty() ? '<i class="dirty-dot" title="' + escapeHtml(t('status.modified')) + '">●</i>' : ''}</div>
    <div class="project-storage" title="${escapeHtml(t('project.storage'))}">${icon(kind === 'local' ? 'file' : 'database')}<span>${t(`storage.${kind}`)}</span></div>
    <ul class="column-list project-boards">
      ${projectDocs().map((doc) => `<li><button class="column-link ${doc.id === state.active ? 'current' : ''}" data-project-board="${doc.id}" title="${escapeHtml(docName(doc))}">${icon('board')}<span>${escapeHtml(docName(doc))}</span>${doc.dirty ? '<b class="over">●</b>' : ''}</button></li>`).join('')}
    </ul>
    <div class="prop-actions">
      <button class="small-button" data-command="addToProject" title="${escapeHtml(t('action.addToProject'))}" ${commandEnabled('addToProject') ? '' : 'disabled'}>${icon('plus')}<span>${t('project.addBoard')}</span></button>
      <button class="small-button" data-command="projectSettings" title="${escapeHtml(t('action.projectSettings'))}">${icon('database')}<span>${t('project.settings')}</span></button>
      <button class="small-button" data-command="saveProject" title="${escapeHtml(t('action.saveProject'))}">${icon('save')}<span>${t('confirm.save')}</span></button>
    </div>
  </section>`;
}

function openProjectMenu(anchor) {
  const element = root.querySelector('[data-command="projectMenu"]');
  showMenu(menuItems(MENUS.project), anchor ?? anchorBelow(element), 'project');
}

/** New project (asks for its name and storage first). An open project is closed. */
async function newProject() {
  if (state.project && !(await closeProject())) return null;
  const draft = createProject({ name: t('project.defaultName') });
  const result = await popups.open('project', { mode: 'new', project: draft, path: null, desktop });
  if (result?.action !== 'apply') return null;
  state.project = { project: draft, path: null, password: '', saved: '' };
  applyProjectEdit(result);
  const name = t('tabs.untitled', { n: state.untitled + 1 });
  state.untitled += 1;
  const columns = columnTitles(state.settings.newBoardColumns);
  const doc = new BoardDocument(B.createBoard({ title: name, columns: columns.length ? columns : [t('board.newColumn')] }), { name });
  addToProject(doc, { add: true });
  renderAll();
  notify('success', t('notice.projectCreated', { name: draft.name }));
  return state.project;
}

async function editProject(tab = 'general') {
  const p = state.project;
  if (!p) return;
  const result = await popups.open('project', {
    mode: 'edit', tab, project: p.project, password: p.password, path: p.path, desktop,
    boards: projectDocs().map((doc) => ({ id: doc.board.id, title: docName(doc), dirty: doc.dirty })),
  });
  if (result?.action === 'apply') {
    applyProjectEdit(result);
    renderAll();
  }
}

/** Takes the project popup's answer: name, description, storage, password, board order. */
function applyProjectEdit(result) {
  const p = state.project;
  if (!p) return;
  if (result.project) {
    p.project.name = String(result.project.name ?? p.project.name).trim() || p.project.name;
    p.project.description = String(result.project.description ?? '');
    if (result.project.storage) p.project.storage = { ...p.project.storage, ...result.project.storage };
  }
  if (typeof result.password === 'string') p.password = result.password;
  p.project.storage.password = p.project.storage.savePassword ? p.password : '';
  if (Array.isArray(result.boards)) {
    const keep = new Set(result.boards);
    for (const doc of projectDocs()) if (!keep.has(doc.board.id)) removeFromProject(doc, { quiet: true });
    p.project.boards = result.boards.map((id) => p.project.boards.find((entry) => entry.id === id)).filter(Boolean);
  }
  p.project.updated = new Date().toISOString();
}

/** Adds a board (tab) to the open project. */
function addToProject(doc, { add = false } = {}) {
  const p = state.project;
  if (!p || !doc || doc.projectId) return false;
  if (p.project.boards.some((entry) => entry.id === doc.board.id)) doc.board.id = B.newId('board');
  doc.projectId = p.project.id;
  doc.path = null;
  doc.handle = null;
  p.project.boards.push({ id: doc.board.id, title: doc.board.title });
  if (add) addDocument(doc);
  persistSession();
  renderAll();
  return true;
}

/** Takes a board out of the project (it stays open as an unsaved board, or closes). */
async function removeFromProject(doc, { close = false, quiet = false } = {}) {
  const p = state.project;
  if (!p || !doc?.projectId) return false;
  if (!quiet) {
    const choice = await ask({
      icon: 'project', title: t('project.removeTitle'), message: t(close ? 'project.closeBoard' : 'project.removeBoard', { name: docName(doc), project: p.project.name }),
      buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'remove', label: t(close ? 'action.closeTab' : 'action.removeFromProject'), icon: close ? 'close' : 'minus', primary: true }],
    });
    if (choice !== 'remove') return false;
  }
  p.project.boards = p.project.boards.filter((entry) => entry.id !== doc.board.id);
  doc.projectId = null;
  doc.name = docName(doc);
  doc.saved = '';
  if (close) await closeDoc(doc, { force: true });
  renderAll();
  return true;
}

async function closeProject({ force = false } = {}) {
  const p = state.project;
  if (!p) return true;
  if (!force && projectDirty()) {
    const choice = await ask({
      icon: 'project', title: t('confirm.exitTitle'), message: t('project.closeMessage', { name: p.project.name }),
      items: projectDocs().filter((doc) => doc.dirty).map(docName),
      buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }],
    });
    if (choice === 'save' && !(await saveProject())) return false;
    if (choice !== 'save' && choice !== 'discard') return false;
  }
  for (const doc of projectDocs()) await closeDoc(doc, { force: true });
  state.project = null;
  persistSession();
  renderAll();
  return true;
}

async function openProjectWithDialog() {
  try {
    if (desktop) {
      const path = await native.chooseProjectToOpen(state.settings.lastDirectory);
      if (path) await openProject(path);
    } else {
      const [file] = await native.pickBoardFilesWeb({ project: true });
      if (file) await openProjectText(file.name, file.text, file.handle);
    }
  } catch (error) {
    showError('error.openProject', error);
  }
}

/** Asks for the database password when it is not saved in the project file. */
async function askPassword(project, path) {
  const result = await popups.open('project', { mode: 'connect', tab: 'storage', project, path, desktop });
  return result?.action === 'apply' ? result.password ?? '' : null;
}

/** Boards stored in the project's database → board objects in project order. */
async function loadDatabaseBoards(project, path, password) {
  const loaded = await withProgress('progress.dbLoad', project.storage.kind, () => native.dbLoad(dbConfig(project.storage, { projectPath: path, password }), project.id));
  if (!loaded.project && project.boards.length) throw new Error(t('project.notInDatabase', { name: project.name }));
  const byId = new Map(loaded.boards.map((row) => {
    const { board, attachments: contents } = parseFile(row.data);
    attachments.merge(contents);
    board.id = row.id;
    return [row.id, board];
  }));
  const ordered = project.boards.map((entry) => byId.get(entry.id)).filter(Boolean);
  // Boards that are in the database but not in the file's list (saved by another copy) are kept too.
  for (const [id, board] of byId) if (!project.boards.some((entry) => entry.id === id)) { ordered.push(board); }
  project.boards = ordered.map((board) => ({ id: board.id, title: board.title }));
  return ordered;
}

async function openProject(path, { quiet = false } = {}) {
  if (state.project?.path && state.project.path.toLowerCase() === path.toLowerCase()) {
    if (!quiet) notify('info', t('notice.alreadyOpen', { name: baseName(path) }));
    return state.project;
  }
  if (state.project && !(await closeProject())) return null;
  try {
    const text = await withProgress('progress.open', baseName(path), (op) => native.readTextFile(path, op));
    const opened = await loadProject(text, path);
    if (!opened) return null;
    rememberRecent({ path, title: opened.project.name });
    updateSettings({ lastDirectory: directoryOf(path) || state.settings.lastDirectory });
    if (!quiet) notify('success', t('notice.projectOpened', { name: opened.project.name }));
    return opened;
  } catch (error) {
    if (!quiet) showError('error.openProject', error, path);
    return null;
  }
}

async function openProjectText(name, text, handle = null) {
  if (state.project && !(await closeProject())) return null;
  try {
    const opened = await loadProject(text, null, handle);
    if (opened) notify('success', t('notice.projectOpened', { name: opened.project.name }));
    return opened;
  } catch (error) {
    showError('error.openProject', error, name);
    return null;
  }
}

async function loadProject(text, path, handle = null) {
  const { project, boards: localBoards, attachments: contents } = parseProject(text);
  attachments.merge(contents);
  let password = project.storage.savePassword ? project.storage.password : '';
  let boards = localBoards;
  if (usesDatabase(project.storage.kind)) {
    if (!desktop) throw new Error(t('web.desktopOnly'));
    if (project.storage.kind !== 'sqlite' && !project.storage.savePassword) {
      password = await askPassword(project, path);
      if (password === null) return null;
    }
    boards = await loadDatabaseBoards(project, path, password);
  }
  state.project = { project, path, password, saved: '', handle };
  for (const board of boards) {
    const doc = new BoardDocument(board, { name: board.title });
    doc.projectId = project.id;
    state.docs.push(doc);
  }
  state.project.saved = projectKey(state.project);
  const first = projectDocs()[0];
  if (first) activate_(first.id);
  persistSession();
  renderAll();
  return state.project;
}

/** Saves the project: its file, and the boards (in the file, or in the database). */
async function saveProject({ saveAs = false } = {}) {
  const p = state.project;
  if (!p) return false;
  const problems = storageProblems(p.project.storage);
  if (problems.length) {
    notify('error', problems.map((code) => t(code)).join(' · '));
    await editProject('storage');
    return false;
  }
  const docs = projectDocs();
  const boards = docs.map((doc) => doc.board);
  p.project.boards = boards.map((board) => ({ id: board.id, title: board.title }));
  try {
    if (!desktop) {
      const text = serializeProject(p.project, boards, attachments.collect(...boards));
      const name = `${p.project.name.replace(/[\\/:*?"<>|]/g, '_') || 'project'}.mkproj`;
      const saved = await withProgress('progress.save', name, () => native.saveBoardWeb(text, { name, handle: p.handle, saveAs, project: true }));
      if (!saved) return false;
      p.handle = saved.handle;
    } else {
      let path = p.path;
      if (!path || saveAs) {
        const suggested = `${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${p.project.name.replace(/[\\/:*?"<>|]/g, '_') || 'project'}.mkproj`;
        path = await native.chooseProjectToSave(suggested);
        if (!path) return false;
        path = withProjectExtension(path);
      }
      if (usesDatabase(p.project.storage.kind)) {
        const config = dbConfig(p.project.storage, { projectPath: path, password: p.password });
        const { password, ...meta } = p.project;
        await withProgress('progress.dbSave', p.project.storage.kind, () => native.dbSave(config, { id: p.project.id, name: p.project.name, data: JSON.stringify({ ...meta, storage: { ...meta.storage, password: undefined } }) },
          boards.map((board) => ({ id: board.id, title: board.title, data: serialize(board, attachments.collect(board)) }))));
      }
      const text = serializeProject(p.project, boards, attachments.collect(...boards));
      await withProgress('progress.save', baseName(path), (op) => native.writeTextFile(path, text, op));
      p.path = path;
      rememberRecent({ path, title: p.project.name });
      updateSettings({ lastDirectory: directoryOf(path) || state.settings.lastDirectory });
    }
    for (const doc of docs) doc.markSaved(null);
    p.saved = projectKey(p);
    persistSession();
    renderAll();
    notify('success', t('notice.projectSaved', { name: p.project.name, storage: t(`storage.${p.project.storage.kind}`) }));
    return true;
  } catch (error) {
    showError('error.saveProject', error, p.path ?? p.project.name);
    return false;
  }
}

// ───────────────────────── attachments

function cardAttachmentsHtml(card) {
  const list = card.attachments ?? [];
  if (!list.length) return '';
  const images = list.filter(B.isImageAttachment).filter((item) => item.thumb);
  const others = list.length - images.length;
  return `<div class="card-attachments">
    ${images.slice(0, 3).map((item) => `<img class="card-thumb" src="${item.thumb}" alt="${escapeHtml(item.name)}" title="${escapeHtml(`${item.name} (${formatBytes(item.size)})`)}" data-att-view="${item.id}" data-card="${card.id}" draggable="false" />`).join('')}
    ${images.length > 3 ? `<span class="badge">+${images.length - 3}</span>` : ''}
    ${others ? `<span class="badge" title="${escapeHtml(t('field.attachments'))}">${icon('paperclip')}${others}</span>` : ''}
  </div>`;
}

function attachmentListHtml(card) {
  const list = card.attachments ?? [];
  return `<div class="prop-block attachments-block"><span class="prop-label">${icon('paperclip')}${t('field.attachments')} (${list.length})</span>
    <ul class="attachment-list">${list.map((item) => {
      const missing = !attachments.has(item.id);
      return `<li class="${missing ? 'missing' : ''}" title="${escapeHtml(`${item.name} · ${formatBytes(item.size)}${item.width ? ` · ${item.width}×${item.height}` : ''}${missing ? ` · ${t('attachment.missing')}` : ''}`)}">
        ${item.thumb ? `<img class="attachment-thumb" src="${item.thumb}" alt="" data-att-view="${item.id}" data-card="${card.id}" />` : `<span class="attachment-icon">${icon(attachmentIcon(item.type))}</span>`}
        <span class="attachment-name">${escapeHtml(item.name)}<small>${formatBytes(item.size)}</small></span>
        ${B.isImageAttachment(item) ? `<button class="icon-button" data-att-view="${item.id}" data-card="${card.id}" title="${escapeHtml(t('attachment.view'))}" aria-label="${escapeHtml(t('attachment.view'))}">${icon('eye')}</button>` : ''}
        <button class="icon-button" data-att-open="${item.id}" title="${escapeHtml(t('attachment.open'))}" aria-label="${escapeHtml(t('attachment.open'))}" ${missing ? 'disabled' : ''}>${icon('open')}</button>
        <button class="icon-button" data-att-save="${item.id}" title="${escapeHtml(t('attachment.save'))}" aria-label="${escapeHtml(t('attachment.save'))}" ${missing ? 'disabled' : ''}>${icon('save')}</button>
        <button class="icon-button" data-att-remove="${item.id}" title="${escapeHtml(t('attachment.remove'))}" aria-label="${escapeHtml(t('attachment.remove'))}">${icon('trash')}</button>
      </li>`;
    }).join('')}</ul>
    <button class="small-button" data-command="attach" title="${escapeHtml(commandTip('attach'))}">${icon('paperclip')}<span>${t('action.attach')}</span></button>
    <p class="panel-hint">${t('attachment.hint')}</p>
  </div>`;
}

/** Thumbnail (≤ 320 px) and size of an image. Unknown formats get none. */
function makeThumb(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || 1;
      const height = image.naturalHeight || 1;
      const scale = Math.min(1, 320 / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      let thumb = canvas.toDataURL('image/webp', 0.82);
      if (!thumb.startsWith('data:image/webp')) thumb = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ thumb, width, height });
    };
    image.onerror = () => resolve({ thumb: '', width: 0, height: 0 });
    image.src = dataUrl;
  });
}

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

/** Adds files ([{ name, size, type, data: data URL }]) to a card as one undo step. */
async function attachFiles(cardId, files) {
  const board = activeBoard();
  if (!board || !B.findCard(board, cardId) || !files.length) return [];
  const added = [];
  for (const file of files) {
    const type = file.type || mimeFor(file.name);
    const data = file.data.startsWith('data:application/octet-stream') || file.data.startsWith('data:;') ? toDataUrl(type, splitDataUrl(file.data).base64) : file.data;
    const meta = { id: attachments.add(data), name: file.name, size: file.size, type, added: new Date().toISOString() };
    if (type.startsWith('image/')) Object.assign(meta, await makeThumb(data));
    added.push(meta);
  }
  change('op.attach', (draft) => {
    const card = B.findCard(draft, cardId).card;
    B.updateCard(draft, cardId, { attachments: [...card.attachments, ...added] });
  }, { right: true });
  notify('success', t('notice.attached', { count: added.length }));
  return added;
}

async function attachPaths(cardId, paths) {
  const files = [];
  for (const path of paths) {
    try {
      const file = await withProgress('progress.attach', baseName(path), (op) => native.readFileBase64(path, op));
      files.push({ name: file.name, size: file.size, type: mimeFor(file.name), data: toDataUrl(mimeFor(file.name), file.data) });
    } catch (error) {
      showError('error.attach', error, path);
    }
  }
  return attachFiles(cardId, files);
}

async function attachWebFiles(cardId, list) {
  const files = [];
  for (const file of list) {
    if (file.size > MAX_ATTACHMENT) {
      showError('error.attach', new Error(t('attachment.tooLarge', { name: file.name })), file.name);
      continue;
    }
    files.push({ name: file.name, size: file.size, type: file.type || mimeFor(file.name), data: await withProgress('progress.attach', file.name, () => readFileAsDataUrl(file)) });
  }
  return attachFiles(cardId, files);
}

async function chooseAttachments(cardId) {
  if (!cardId) return notify('info', t('notice.selectFirst'));
  try {
    if (desktop) {
      const paths = await native.chooseAnyFiles(state.settings.lastDirectory);
      if (paths.length) await attachPaths(cardId, paths);
    } else {
      const files = await native.pickWithInput('*/*', true);
      if (files.length) await attachWebFiles(cardId, files);
    }
  } catch (error) {
    showError('error.attach', error);
  }
  return undefined;
}

function findAttachment(attId) {
  for (const card of B.allCards(activeBoard() ?? { columns: [] })) {
    const item = card.attachments.find((att) => att.id === attId);
    if (item) return { card, item };
  }
  return null;
}

/** Shows a card's images in the image viewer (starting with `attId`). */
function viewAttachment(cardId, attId) {
  const found = findAttachment(attId);
  if (!found) return;
  const card = B.findCard(activeBoard(), cardId)?.card ?? found.card;
  const items = card.attachments.filter(B.isImageAttachment);
  popups.open('image', { title: card.title, items, index: Math.max(0, items.findIndex((item) => item.id === attId)) });
}

function attachmentAction(element) {
  const id = element.dataset.attOpen ?? element.dataset.attSave ?? element.dataset.attRemove;
  const found = findAttachment(id);
  if (!found) return undefined;
  if (element.dataset.attOpen) return openAttachment(found.item);
  if (element.dataset.attSave) return saveAttachment(found.item);
  return change('op.detach', (board) => B.updateCard(board, found.card.id, { attachments: found.card.attachments.filter((item) => item.id !== id) }), { right: true });
}

async function saveAttachment(item) {
  const data = attachments.get(item.id);
  if (!data) return notify('error', t('attachment.missing'));
  try {
    if (desktop) {
      const path = await native.chooseFileToSave(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${item.name}`);
      if (!path) return undefined;
      await withProgress('progress.save', baseName(path), (op) => native.writeBase64File(path, splitDataUrl(data).base64, op));
      notify('success', t('notice.saved', { name: baseName(path) }));
    } else {
      const link = Object.assign(document.createElement('a'), { href: data, download: item.name });
      document.body.append(link);
      link.click();
      link.remove();
    }
  } catch (error) {
    showError('error.save', error, item.name);
  }
  return undefined;
}

async function openAttachment(item) {
  const data = attachments.get(item.id);
  if (!data) return notify('error', t('attachment.missing'));
  try {
    if (desktop) await native.openAttachment(item.name, splitDataUrl(data).base64);
    else window.open(URL.createObjectURL(await (await fetch(data)).blob()), '_blank');
  } catch (error) {
    showError('error.attach', error, item.name);
  }
  return undefined;
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
  popups.on('attachment-data', (data, kind) => popups.post(kind, { type: 'attachment', id: data.id, data: attachments.get(data.id) }));
  popups.on('attachment-save', (data) => saveAttachment(data.item));
  popups.on('attachment-open', (data) => openAttachment(data.item));
}

// ───────────────────────── start-up

async function restoreSession() {
  if (!desktop || !state.settings.restoreSession) return;
  let files = [];
  let project = null;
  try {
    const session = JSON.parse(globalThis.localStorage?.getItem(SESSION_KEY) ?? '{}');
    files = session.files ?? [];
    project = session.project ?? null;
  } catch { /* none */ }
  if (project && (await native.pathsExist([project]))[0]) await openProject(project, { quiet: true });
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
  await popups.init();
  state.info = await native.appInfo().catch(() => null);
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
    native.listen('open-files', async (paths) => {
      for (const path of paths) await openPath(path);
      renderAll();
    });
  }

  await restoreSession();
  for (const path of await native.startupFiles().catch(() => [])) await openPath(path);
  if (!state.docs.length) addDocument(welcomeBoard());
  if (!state.active && state.docs.length) activate_(state.docs[0].id);
  renderAll();
  if (desktop) {
    await appWindow.show();
    await appWindow.setFocus();
    setTimeout(() => popups.prewarm('menu'), 300);
  }
}

// Test hook: the E2E suites drive the app through this (no effect on normal use).
window.__mykanban = {
  state,
  debug: () => ({ drag: drag && { type: drag.type, started: drag.started }, openMenu: state.openMenu, focus: document.activeElement?.outerHTML?.slice(0, 80) ?? null, pending: [...popups.pending.keys()] }),
  t,
  commands,
  popups,
  run,
  actions: {
    openPath, openText, saveDoc, closeDoc, newBoard, addCard, addColumn, select, change, undo, redo,
    copyCards, cutCards, pasteCards, setZoom, updateSettings, handleDroppedPaths, handleDroppedFiles, importTextAsCards,
    setBackgroundFromPath, removeBackground, confirmExit, openRecent, showError, openMenubarMenu, contextMenuFor, activeDoc, activeBoard,
    toScreen, docName, scrollTabs, withProgress,
    newProject, openProject, saveProject, closeProject, addToProject, removeFromProject, applyProjectEdit, projectDirty, projectDocs,
    attachFiles, attachPaths, viewAttachment, saveAttachment, openAttachment, attachmentStore: () => attachments,
  },
  board: B,
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => {
    // The main window starts hidden (no flash of an empty page); show it even if start-up failed.
    if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {});
  });
