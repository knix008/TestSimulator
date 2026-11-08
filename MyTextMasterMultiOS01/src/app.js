// MyTextMaster: the main window. Menu bar (as the title bar), toolbar, document tabs, side panels
// (Explorer / Outline / Documents · Information / Bookmarks / Find in files), the editor with its
// preview or WYSIWYG view, viewers (pictures, video, audio, PDF, hex, the user's guide), the bottom
// panel (Problems / Log), the status bar and the start page. State lives in `state`; render*() draw it.
import DOMPurify from 'dompurify';
import { Text } from '@codemirror/state';
import appIconUrl from '../assets/icon-256.png';
import { TextEditor, LANGUAGE_NAMES, languageName } from './editor/cm.js';
import { misspelledAt, misspellings, setUserWords, suggest } from './editor/spell.js';
import { bookmarkLines, clearBookmarks, gotoBookmark, toggleBookmark } from './editor/bookmarks.js';
import { inlineImages, imageMarkup, isImageFile } from './editor/images.js';
import { Preview } from './ui/preview.js';
import { Wysiwyg } from './ui/wysiwyg.js';
import { HexEditor, toHex } from './ui/hexeditor.js';
import { showViewer } from './ui/viewers.js';
import { showGuide } from './ui/guide.js';
import { renderLeft, renderRight, renderBottom } from './ui/panels.js';
import { mdTagBarHtml, mdTagById } from './ui/mdtags.js';
import { showThemePicker, closeThemePicker } from './ui/themepicker.js';
import { showMenu, closeMenu, menuOpen, menuKey } from './ui/menu.js';
import { openDialog, confirmDialog, alertDialog, formDialog, dialogOpen } from './ui/dialog.js';
import { startPageHtml } from './ui/startpage.js';
import { startBoard } from './ui/startboard.js';
import { AnimatedBackground } from './ui/background.js';
import { escapeHtml, keyLabel } from './ui/dom.js';
import { icon } from './icons.js';
import { switchFlag } from './flags.js';
import { t, getLanguage, setLanguage } from './i18n.js';
import { applyFont, applyTheme, resolveTheme, themeName, randomThemeId, customFrom } from './themes.js';
import { loadSettings, storeSettings, ANIMATIONS } from './domain/settings.js';
import { KINDS, baseName, dirName, kindOf, untitledName, withExt, decodeText, encodeText, defaultExt, isTextKind, isViewerKind, formatSize } from './domain/doctypes.js';
import { outlineOf, textStats } from './domain/outline.js';
import { standaloneHtml, textPage, titleOf, markdownToHtml } from './domain/render.js';
import { minimalChange } from './domain/htmltomd.js';
import { lint } from './domain/lint.js';
import * as tools from './domain/texttools.js';
import { addWords, loadUserDictionary, storeUserDictionary } from './domain/userdict.js';
import { addRecent, removeRecent, loadRecent, storeRecent, loadRecentDirs, storeRecentDirs, sessionOf, loadSession, storeSession } from './domain/recent.js';
import { TEMPLATES, templateById, templateText } from './domain/templates.js';
import { sampleById } from './domain/samples.js';
import * as native from './platform/native.js';
import { openSettings, openAbout, openStats, openShortcuts, openUserDictionary } from './ui/appdialogs.js';
import { helpText } from './help.js';

const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const root = document.querySelector('#app');
const desktop = native.desktop;
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const store = globalThis.localStorage;

const initialSettings = loadSettings(store);
const state = {
  settings: initialSettings,
  docs: [],
  activeId: null,
  showStart: true,
  recent: loadRecent(store),
  recentDirs: loadRecentDirs(store),
  maximized: false,
  minWidth: 0,
  notice: null,
  focusMode: false,
  explorer: { root: initialSettings.explorerRoot, expanded: new Set(), cache: new Map(), places: null, showHidden: initialSettings.showHidden },
  search: { query: '', dir: '', ext: '', caseSensitive: false, wholeWord: false, hits: null, files: 0, busy: false, truncated: false },
  details: new Map(),
  hashes: new Map(),
  problems: [],
  log: [],
  userWords: loadUserDictionary(store),
  hexInfo: null,
};
setUserWords(state.userWords);

let nextId = 1;
let editor = null;
let preview = null;
let wysiwyg = null;
let hexEditor = null;
let viewerHandle = null;
let startCards = null;
let startBackground = null;

const activeDoc = () => state.docs.find((doc) => doc.id === state.activeId) ?? null;
const onDoc = () => !state.showStart && Boolean(activeDoc());
const onText = () => onDoc() && isTextKind(activeDoc().kind);
const isDark = () => resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme).dark;
const lang = () => getLanguage();
const fileLabels = () => ({ all: t('filter.all'), markdown: t('filter.markdown'), html: t('filter.html'), text: t('filter.text'), any: t('filter.any') });
const docName = (doc) => doc?.name ?? '';
/** Unsaved: the text (or the bytes) differ from the last saved ones, or it was never saved. */
function isDirty(doc) {
  if (!doc) return false;
  if (doc.kind === 'hex') return (doc.hexVersion ?? 0) !== (doc.savedHexVersion ?? 0) || doc.unsavedHex === true;
  return Boolean(doc.state && (!doc.savedDoc || !doc.state.doc.eq(doc.savedDoc)));
}
const markUnsaved = (doc) => { doc.savedDoc = null; };
const textOf = (string) => Text.of(String(string).split('\n'));
const samePath = (a, b) => String(a).replace(/\\/g, '/').toLowerCase() === String(b).replace(/\\/g, '/').toLowerCase();
const joinPath = (dir, name) => `${dir}${dir.includes('\\') ? '\\' : '/'}${name.replace(/\//g, dir.includes('\\') ? '\\' : '/')}`;

/** The view a text document shows: WYSIWYG is for Markdown only, the preview for Markdown and HTML. */
function modeFor(doc) {
  if (!doc || !isTextKind(doc.kind) || !KINDS[doc.kind].preview) return 'editor';
  const mode = state.settings.viewMode;
  return mode === 'wysiwyg' && doc.kind !== 'markdown' ? 'split' : mode;
}

// The editor, the preview, the WYSIWYG view and the viewer area live for the whole run; a rebuilt
// shell (another language) takes them back in.
const editorHost = Object.assign(document.createElement('div'), { id: 'editor-host' });
const previewHost = Object.assign(document.createElement('div'), { id: 'preview-host' });
const wysiwygHost = Object.assign(document.createElement('div'), { id: 'wysiwyg-host' });
const viewerHost = Object.assign(document.createElement('div'), { id: 'viewer-host' });
const hexHost = Object.assign(document.createElement('div'), { id: 'hex-host', className: 'hex-editor' });

// ───────────────────────── settings

function updateSettings(patch, { quiet = false } = {}) {
  const before = state.settings;
  state.settings = { ...state.settings, ...patch };
  storeSettings(store, state.settings);
  if ('language' in patch && patch.language !== before.language) {
    setLanguage(state.settings.language);
    renderShell();
  }
  if ('theme' in patch || 'customTheme' in patch) {
    applyTheme(resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme));
    if (!quiet && 'theme' in patch) notify('info', t('notice.theme', { name: themeName(state.settings.theme, lang()) }));
  }
  if (['fontFamily', 'fontSize', 'fontWeight', 'fontStyle'].some((key) => key in patch)) applyFont(state.settings);
  if ('alwaysOnTop' in patch) native.setAlwaysOnTop(state.settings.alwaysOnTop).catch(showError);
  if ('showHidden' in patch) { state.explorer.showHidden = state.settings.showHidden; state.explorer.cache.clear(); }
  const doc = activeDoc();
  if (doc && editor && !state.showStart && isTextKind(doc.kind)) editor.apply(state.settings, isDark());
  if (['previewStyle', 'previewScripts', 'theme', 'customTheme'].some((key) => key in patch)) { preview?.clear(); wysiwyg?.clear(); }
  if ('inlineImages' in patch || 'spellCheck' in patch) for (const d of state.docs) if (d.state && d !== editor.doc) d.stale = true;
  if (['viewMode'].some((key) => key in patch) && editor.doc && state.settings.viewMode === 'wysiwyg') wysiwyg?.clear();
  renderAll();
}

// ───────────────────────── notices (status bar) and the log

let noticeTimer = 0;
function notify(kind, text) {
  state.notice = { kind, text, at: Date.now() };
  log(kind, text);
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { state.notice = null; renderStatus(); }, kind === 'error' ? 9000 : 4500);
  renderStatus();
}

function log(kind, text) {
  state.log.push({ kind, text, at: Date.now() });
  if (state.log.length > 500) state.log.shift();
  if (state.settings.bottomOpen && state.settings.bottomTab === 'log') renderBottomPanel();
  else updatePanelBadges();
}

async function showError(error, title = t('error.title')) {
  const message = String(error?.message ?? error ?? '');
  notify('error', message);
  await alertDialog({ title, message, error: true });
}

// ───────────────────────── commands

const canFormat = () => onText() && activeDoc().kind !== 'text' && !activeDoc().readOnly;
const canEdit = () => onText() && !activeDoc().readOnly;
const hasPreview = () => onText() && KINDS[activeDoc().kind].preview;
const inWysiwyg = () => onText() && modeFor(activeDoc()) === 'wysiwyg';
const isHex = () => onDoc() && activeDoc().kind === 'hex';
const canSave = () => onDoc() && (isTextKind(activeDoc().kind) || activeDoc().kind === 'hex') && !activeDoc().readOnly && !activeDoc().guide;

const commands = {
  // file
  new: { icon: 'fileNew', label: 'action.new', key: 'Ctrl+N', run: () => newDocument(state.settings.defaultKind) },
  newMarkdown: { icon: 'mdFile', label: 'action.newMarkdown', run: () => newDocument('markdown') },
  newHtml: { icon: 'htmlFile', label: 'action.newHtml', run: () => newFromTemplate('html') },
  newText: { icon: 'txtFile', label: 'action.newText', run: () => newDocument('text') },
  pasteNew: { icon: 'paste', label: 'action.pasteNew', run: () => pasteAsNew() },
  open: { icon: 'folderOpen', label: 'action.open', key: 'Ctrl+O', run: () => openWithDialog() },
  openFolder: { icon: 'explorer', label: 'action.openFolder', key: 'Ctrl+Shift+F2', enabled: () => desktop, run: () => chooseExplorerRoot() },
  openAsHex: { icon: 'openAsHex', label: 'action.openAsHex', enabled: () => onDoc() && activeDoc().kind !== 'hex' && !activeDoc().guide, run: () => openAsHex(activeDoc()) },
  reload: { icon: 'reload', label: 'action.reload', enabled: () => onDoc() && Boolean(activeDoc().path) && desktop && !activeDoc().web && isTextKind(activeDoc().kind), run: () => reloadDocument(activeDoc(), true) },
  save: { icon: 'save', label: 'action.save', key: 'Ctrl+S', enabled: canSave, run: () => saveDocument(activeDoc()) },
  saveAs: { icon: 'saveAs', label: 'action.saveAs', key: 'Ctrl+Shift+S', enabled: () => onDoc() && (isTextKind(activeDoc().kind) || activeDoc().kind === 'hex'), run: () => saveDocument(activeDoc(), { as: true }) },
  saveAll: { icon: 'saveAll', label: 'action.saveAll', key: 'Ctrl+Alt+S', enabled: () => state.docs.some(isDirty), run: () => saveAll() },
  exportHtml: { icon: 'exportHtml', label: 'action.exportHtml', key: 'Ctrl+Shift+E', enabled: () => onText() && activeDoc().kind !== 'text', run: () => exportHtml() },
  copyHtml: { icon: 'copyHtml', label: 'action.copyHtml', enabled: () => onText() && activeDoc().kind === 'markdown', run: () => copyHtml() },
  openInBrowser: { icon: 'browser', label: 'action.openInBrowser', enabled: () => onDoc() && desktop && Boolean(activeDoc().path) && !activeDoc().web && ['html', 'pdf', 'image', 'video', 'audio'].includes(activeDoc().kind), run: () => native.openExternal(activeDoc().path).catch(showError) },
  print: { icon: 'print', label: 'action.print', key: 'Ctrl+P', enabled: () => onText() || (onDoc() && activeDoc().kind === 'image'), run: () => printDocument() },
  closeTab: { icon: 'closeTab', label: 'action.closeTab', key: 'Ctrl+W', enabled: onDoc, run: () => closeDocument(activeDoc()) },
  closeAll: { icon: 'closeAll', label: 'action.closeAll', enabled: () => state.docs.length > 0, run: () => closeAll() },
  home: { icon: 'home', label: 'menu.home', run: () => showStartPage(!state.showStart || !state.docs.length) },
  exit: { icon: 'exit', label: 'action.exit', key: 'Alt+F4', run: () => requestExit() },
  // edit
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: () => canEdit() || isHex(), run: () => (isHex() ? hexEditor.undo() : inWysiwyg() ? wysiwyg.command('undo') : editor.run('undo')) },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: () => canEdit() || isHex(), run: () => (isHex() ? hexEditor.undo(true) : inWysiwyg() ? wysiwyg.command('redo') : editor.run('redo')) },
  cut: { icon: 'cut', label: 'action.cut', key: 'Ctrl+X', enabled: canEdit, run: () => clipboardCommand('cut') },
  copy: { icon: 'copy', label: 'action.copy', key: 'Ctrl+C', enabled: () => onText() || isHex(), run: () => clipboardCommand('copy') },
  paste: { icon: 'paste', label: 'action.paste', key: 'Ctrl+V', enabled: canEdit, run: () => clipboardCommand('paste') },
  selectAll: { icon: 'selectAll', label: 'action.selectAll', key: 'Ctrl+A', enabled: onText, run: () => (inWysiwyg() ? wysiwyg.command('selectAll') : editor.run('selectAll')) },
  find: { icon: 'search', label: 'action.find', key: 'Ctrl+F', enabled: () => onText() || isHex(), run: () => findCommand() },
  replace: { icon: 'replace', label: 'action.replace', key: 'Ctrl+H', enabled: canEdit, run: () => { leaveWysiwyg(); editor.run('replace'); } },
  findInFiles: { icon: 'findInFiles', label: 'action.findInFiles', key: 'Ctrl+Shift+F', enabled: () => desktop, run: () => openFindInFiles() },
  gotoLine: { icon: 'goTo', label: 'action.gotoLine', key: 'Ctrl+G', enabled: () => onText() || isHex(), run: () => gotoLineDialog() },
  duplicateLine: { icon: 'duplicateLine', label: 'action.duplicateLine', key: 'Shift+Alt+↓', enabled: canEdit, run: () => editor.run('copyLineDown') },
  toggleComment: { icon: 'toggleComment', label: 'action.toggleComment', key: 'Ctrl+/', enabled: canEdit, run: () => editor.run('toggleComment') },
  indentMore: { icon: 'indentMore', label: 'action.indentMore', key: 'Ctrl+]', enabled: canEdit, run: () => editor.run('indentMore') },
  indentLess: { icon: 'indentLess', label: 'action.indentLess', key: 'Ctrl+[', enabled: canEdit, run: () => editor.run('indentLess') },
  bookmarkToggle: { icon: 'bookmark', label: 'action.bookmarkToggle', key: 'Ctrl+F2', enabled: onText, run: () => { leaveWysiwyg(); toggleBookmark(editor.view); afterBookmarks(); } },
  bookmarkNext: { icon: 'bookmarkNext', label: 'action.bookmarkNext', key: 'F2', enabled: onText, run: () => { leaveWysiwyg(); if (!gotoBookmark(editor.view, 1)) notify('info', t('bookmarks.empty')); } },
  bookmarkPrev: { icon: 'bookmarkPrev', label: 'action.bookmarkPrev', key: 'Shift+F2', enabled: onText, run: () => { leaveWysiwyg(); if (!gotoBookmark(editor.view, -1)) notify('info', t('bookmarks.empty')); } },
  bookmarkClear: { icon: 'bookmarkClear', label: 'action.bookmarkClear', enabled: onText, run: () => { clearBookmarks(editor.view); afterBookmarks(); } },
  readOnly: { icon: 'lock', label: 'action.readOnly', enabled: () => onText() && !activeDoc().guide, checked: () => Boolean(activeDoc()?.readOnly), run: () => toggleReadOnly() },
  // format
  bold: { icon: 'bold', label: 'action.bold', key: 'Ctrl+B', enabled: canFormat, run: () => format('bold') },
  italic: { icon: 'italic', label: 'action.italic', key: 'Ctrl+I', enabled: canFormat, run: () => format('italic') },
  strike: { icon: 'strike', label: 'action.strike', key: 'Ctrl+Shift+X', enabled: canFormat, run: () => format('strike') },
  inlineCode: { icon: 'codeInline', label: 'action.inlineCode', key: 'Ctrl+`', enabled: canFormat, run: () => format('code') },
  heading1: { icon: 'heading1', label: 'action.heading1', key: 'Ctrl+1', enabled: canFormat, run: () => format('h1') },
  heading2: { icon: 'heading2', label: 'action.heading2', key: 'Ctrl+2', enabled: canFormat, run: () => format('h2') },
  heading3: { icon: 'heading3', label: 'action.heading3', key: 'Ctrl+3', enabled: canFormat, run: () => format('h3') },
  heading4: { icon: 'heading', label: 'action.heading4', key: 'Ctrl+4', enabled: canFormat, run: () => format('h4') },
  headingMenu: { icon: 'heading', label: 'action.heading', enabled: canFormat, run: (anchor) => showMenu(menuItems(['heading1', 'heading2', 'heading3', 'heading4', 'paragraph']), anchor ?? toolbarAnchor('headingMenu')) },
  paragraph: { icon: 'textTool', label: 'action.paragraph', key: 'Ctrl+0', enabled: canFormat, run: () => format('p') },
  bulletList: { icon: 'listBullet', label: 'action.bulletList', key: 'Ctrl+Shift+8', enabled: canFormat, run: () => format('ul') },
  orderedList: { icon: 'listOrdered', label: 'action.orderedList', key: 'Ctrl+Shift+7', enabled: canFormat, run: () => format('ol') },
  taskList: { icon: 'listTask', label: 'action.taskList', key: 'Ctrl+Shift+9', enabled: () => canFormat() && activeDoc().kind === 'markdown', run: () => format('task') },
  quote: { icon: 'quote', label: 'action.quote', key: 'Ctrl+Shift+Q', enabled: canFormat, run: () => format('quote') },
  // insert
  link: { icon: 'link', label: 'action.link', key: 'Ctrl+K', enabled: canFormat, run: () => insertLink() },
  image: { icon: 'image', label: 'action.image', key: 'Ctrl+Shift+I', enabled: canFormat, run: () => insertImage() },
  table: { icon: 'tableInsert', label: 'action.table', enabled: canFormat, run: () => insertTable() },
  codeBlock: { icon: 'codeBlock', label: 'action.codeBlock', key: 'Ctrl+Shift+C', enabled: canFormat, run: () => insertCodeBlock() },
  hr: { icon: 'horizontalRule', label: 'action.hr', enabled: canFormat, run: () => (inWysiwyg() ? wysiwyg.command('hr') : editor.insertBlock(activeDoc().kind === 'html' ? '<hr>' : '---', activeDoc().kind === 'html' ? 4 : 3)) },
  footnote: { icon: 'footnote', label: 'action.footnote', enabled: () => canFormat() && activeDoc().kind === 'markdown', run: () => { leaveWysiwyg(); insertFootnote(); } },
  dateTime: { icon: 'dateInsert', label: 'action.dateTime', key: 'F5', enabled: canEdit, run: () => insertText(new Date().toLocaleString(lang() === 'ko' ? 'ko-KR' : 'en-US')) },
  // tools
  upper: { icon: 'caseUpper', label: 'action.upper', enabled: canEdit, run: () => textTool(tools.toUpper) },
  lower: { icon: 'caseLower', label: 'action.lower', enabled: canEdit, run: () => textTool(tools.toLower) },
  titleCase: { icon: 'caseTitle', label: 'action.titleCase', enabled: canEdit, run: () => textTool(tools.toTitle) },
  sortAsc: { icon: 'sortLines', label: 'action.sortAsc', enabled: canEdit, run: () => linesTool((text) => tools.sortLines(text)) },
  sortDesc: { icon: 'sort', label: 'action.sortDesc', enabled: canEdit, run: () => linesTool((text) => tools.sortLines(text, { descending: true })) },
  sortLength: { icon: 'sortLines', label: 'action.sortLength', enabled: canEdit, run: () => linesTool(tools.sortByLength) },
  reverseLines: { icon: 'reverse', label: 'action.reverseLines', enabled: canEdit, run: () => linesTool(tools.reverseLines) },
  dedupe: { icon: 'dedupe', label: 'action.dedupe', enabled: canEdit, run: () => linesTool(tools.removeDuplicateLines) },
  trimTrailing: { icon: 'trimSpace', label: 'action.trimTrailing', enabled: canEdit, run: () => linesTool(tools.trimTrailing) },
  trimLeading: { icon: 'trimSpace', label: 'action.trimLeading', enabled: canEdit, run: () => linesTool(tools.trimLeading) },
  trimBoth: { icon: 'trimSpace', label: 'action.trimBoth', enabled: canEdit, run: () => linesTool(tools.trimBoth) },
  removeEmpty: { icon: 'clear', label: 'action.removeEmpty', enabled: canEdit, run: () => linesTool(tools.removeEmptyLines) },
  joinLines: { icon: 'joinLines', label: 'action.joinLines', key: 'Ctrl+J', enabled: canEdit, run: () => { leaveWysiwyg(); editor.transformLines(tools.joinLines); } },
  numberLines: { icon: 'lineNumbers', label: 'action.numberLines', enabled: canEdit, run: () => linesTool(tools.numberLines) },
  tabsToSpaces: { icon: 'whitespace', label: 'action.tabsToSpaces', enabled: canEdit, run: () => linesTool((text) => tools.tabsToSpaces(text, state.settings.tabSize)) },
  spacesToTabs: { icon: 'indentMore', label: 'action.spacesToTabs', enabled: canEdit, run: () => linesTool((text) => tools.spacesToTabs(text, state.settings.tabSize)) },
  base64Encode: { icon: 'encodeTool', label: 'action.base64Encode', enabled: canEdit, run: () => textTool(tools.base64Encode) },
  base64Decode: { icon: 'encodeTool', label: 'action.base64Decode', enabled: canEdit, run: () => textTool(tools.base64Decode) },
  urlEncode: { icon: 'link', label: 'action.urlEncode', enabled: canEdit, run: () => textTool(tools.urlEncode) },
  urlDecode: { icon: 'unlink', label: 'action.urlDecode', enabled: canEdit, run: () => textTool(tools.urlDecode) },
  escapeHtml: { icon: 'tag', label: 'action.escapeHtml', enabled: canEdit, run: () => textTool(tools.escapeHtmlText) },
  unescapeHtml: { icon: 'tag', label: 'action.unescapeHtml', enabled: canEdit, run: () => textTool(tools.unescapeHtmlText) },
  hashSelection: { icon: 'hashTool', label: 'action.hashSelection', enabled: onText, run: () => hashDialog() },
  formatHtml: { icon: 'htmlFormat', label: 'action.formatHtml', key: 'Shift+Alt+F', enabled: () => canEdit() && activeDoc().kind === 'html', run: () => formatHtmlDocument() },
  stats: { icon: 'docStats', label: 'action.stats', enabled: onText, run: () => openStats(appApi) },
  macroRecord: { icon: 'macroRecord', label: 'action.macroRecord', key: 'Ctrl+Shift+R', enabled: () => canEdit() && !editor.recording, run: () => { leaveWysiwyg(); editor.startMacro(); notify('info', t('notice.macroRecording')); renderAll(); } },
  macroStop: { icon: 'macroStop', label: 'action.macroStop', key: 'Ctrl+Shift+T', enabled: () => Boolean(editor?.recording), run: () => { const n = editor.stopMacro(); notify('success', t('notice.macroStopped', { n })); renderAll(); } },
  macroPlay: { icon: 'macroPlay', label: 'action.macroPlay', key: 'Ctrl+Shift+P', enabled: () => canEdit() && !editor.recording && editor.lastMacro.length > 0, run: () => { leaveWysiwyg(); editor.playMacro(1); } },
  macroRepeat: { icon: 'macroRepeat', label: 'action.macroRepeat', enabled: () => canEdit() && !editor.recording && editor.lastMacro.length > 0, run: () => macroRepeatDialog() },
  spellCheck: { icon: 'spellCheck', label: 'action.spellCheck', key: 'F7', checked: () => state.settings.spellCheck, run: () => updateSettings({ spellCheck: !state.settings.spellCheck }) },
  userDictionary: { icon: 'dictionary', label: 'action.userDictionary', run: () => openUserDictionary(appApi) },
  // view
  viewEditor: { icon: 'viewEditor', label: 'action.viewEditor', enabled: hasPreview, checked: () => hasPreview() && modeFor(activeDoc()) === 'editor', run: () => setViewMode('editor') },
  viewSplit: { icon: 'viewSplit', label: 'action.viewSplit', enabled: hasPreview, checked: () => hasPreview() && modeFor(activeDoc()) === 'split', run: () => setViewMode('split') },
  viewPreview: { icon: 'viewPreview', label: 'action.viewPreview', enabled: hasPreview, checked: () => hasPreview() && modeFor(activeDoc()) === 'preview', run: () => setViewMode('preview') },
  viewWysiwyg: { icon: 'wysiwyg', label: 'action.viewWysiwyg', key: 'Ctrl+Shift+W', enabled: () => onText() && activeDoc().kind === 'markdown', checked: () => inWysiwyg(), run: () => setViewMode('wysiwyg') },
  cycleView: { icon: 'viewSplit', label: 'action.cycleView', key: 'Ctrl+\\', enabled: hasPreview, run: () => setViewMode(nextMode()) },
  syncScroll: { icon: 'syncScroll', label: 'action.syncScroll', checked: () => state.settings.syncScroll, run: () => updateSettings({ syncScroll: !state.settings.syncScroll }) },
  leftPanel: { icon: 'panelLeft', label: 'action.leftPanel', key: 'Ctrl+Shift+B', checked: () => state.settings.leftOpen, run: () => updateSettings({ leftOpen: !state.settings.leftOpen }) },
  rightPanel: { icon: 'panelRight', label: 'action.rightPanel', key: 'Ctrl+Alt+B', checked: () => state.settings.rightOpen, run: () => updateSettings({ rightOpen: !state.settings.rightOpen }) },
  bottomPanel: { icon: 'panelBottom', label: 'action.bottomPanel', key: 'Ctrl+Shift+J', checked: () => state.settings.bottomOpen, run: () => updateSettings({ bottomOpen: !state.settings.bottomOpen }) },
  explorer: { icon: 'explorer', label: 'panel.explorer', key: 'Ctrl+Alt+E', run: () => openPanelTab('left', 'explorer') },
  outline: { icon: 'outline', label: 'action.outline', key: 'Ctrl+Shift+O', run: () => openPanelTab('left', 'outline') },
  problems: { icon: 'problems', label: 'panel.problems', key: 'Ctrl+Shift+M', run: () => openPanelTab('bottom', 'problems') },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => state.settings.showStatusBar, run: () => updateSettings({ showStatusBar: !state.settings.showStatusBar }) },
  wordWrap: { icon: 'wrap', label: 'action.wordWrap', key: 'Alt+Z', checked: () => state.settings.wordWrap, run: () => updateSettings({ wordWrap: !state.settings.wordWrap }) },
  lineNumbers: { icon: 'lineNumbers', label: 'action.lineNumbers', checked: () => state.settings.lineNumbers, run: () => updateSettings({ lineNumbers: !state.settings.lineNumbers }) },
  activeLine: { icon: 'activeLine', label: 'action.activeLine', checked: () => state.settings.highlightActiveLine, run: () => updateSettings({ highlightActiveLine: !state.settings.highlightActiveLine }) },
  whitespace: { icon: 'whitespace', label: 'action.whitespace', checked: () => state.settings.showWhitespace, run: () => updateSettings({ showWhitespace: !state.settings.showWhitespace }) },
  inlineImages: { icon: 'image', label: 'action.inlineImages', checked: () => state.settings.inlineImages, run: () => updateSettings({ inlineImages: !state.settings.inlineImages }) },
  foldAll: { icon: 'foldAll', label: 'action.foldAll', key: 'Alt+0', enabled: onText, run: () => { leaveWysiwyg(); editor.run('foldAll'); } },
  unfoldAll: { icon: 'unfoldAll', label: 'action.unfoldAll', key: 'Alt+Shift+0', enabled: onText, run: () => { leaveWysiwyg(); editor.run('unfoldAll'); } },
  zoomIn: { icon: 'fontSizeUp', label: 'action.zoomIn', key: 'Ctrl+=', run: () => (onDoc() && ['image'].includes(activeDoc().kind) ? viewerHandle?.command('zoomIn') : setEditorFontSize(state.settings.editorFontSize + 1)) },
  zoomOut: { icon: 'fontSizeDown', label: 'action.zoomOut', key: 'Ctrl+-', run: () => (onDoc() && ['image'].includes(activeDoc().kind) ? viewerHandle?.command('zoomOut') : setEditorFontSize(state.settings.editorFontSize - 1)) },
  zoomReset: { icon: 'zoomReset', label: 'action.zoomReset', key: 'Ctrl+Alt+0', run: () => setEditorFontSize(14) },
  focusMode: { icon: 'focusMode', label: 'action.focusMode', key: 'F11', checked: () => state.focusMode, run: () => toggleFocusMode() },
  alwaysOnTop: { icon: 'pinTop', label: 'action.alwaysOnTop', enabled: () => desktop, checked: () => state.settings.alwaysOnTop, run: () => updateSettings({ alwaysOnTop: !state.settings.alwaysOnTop }) },
  theme: { icon: 'palette', label: 'action.themeRandom', run: () => updateSettings({ theme: randomThemeId(state.settings.theme) }) },
  themeMenu: { icon: 'chevronDown', label: 'action.themeChoose', run: (anchor) => themeMenu(anchor ?? toolbarAnchor('themeMenu')) },
  language: { icon: 'globe', label: 'action.language', run: () => updateSettings({ language: lang() === 'ko' ? 'en' : 'ko' }) },
  settings: { icon: 'gear', label: 'action.settings', key: 'Ctrl+,', run: () => openSettings(appApi) },
  // help
  userGuide: { icon: 'userGuide', label: 'action.userGuide', key: 'F1', run: () => openGuide() },
  shortcuts: { icon: 'keyboard', label: 'action.shortcuts', run: () => openShortcuts(appApi) },
  about: { icon: 'info', label: 'action.about', run: () => openAbout(appApi) },
};

const commandEnabled = (id) => commands[id] && (commands[id].enabled ? commands[id].enabled() : true);
const commandTip = (id) => { const c = commands[id]; return `${t(c.label)}${c.key ? ` (${keyLabel(c.key)})` : ''}`; };

function run(id, anchor) {
  const command = commands[id];
  if (!command || !commandEnabled(id)) return;
  closeMenu();
  Promise.resolve(command.run(anchor)).catch((error) => showError(error)).finally(() => renderToolbarState());
}

/** Menu items from command ids ('sep' stays a separator; objects pass through). */
function menuItems(ids) {
  return ids.map((id) => {
    if (id === 'sep' || typeof id === 'object') return id;
    const c = commands[id];
    return { id, label: t(c.label), icon: c.icon, key: c.key, disabled: !commandEnabled(id), checked: c.checked ? Boolean(c.checked()) : undefined, run: () => run(id) };
  });
}

const MENU_ICONS = { file: 'file', edit: 'edit', format: 'bold', insert: 'plus', tools: 'wordCount', macro: 'macroRecord', view: 'eye', help: 'question' };

function syntaxItems() {
  const doc = activeDoc();
  const current = doc?.syntax ?? null;
  const groups = new Map();
  for (const name of LANGUAGE_NAMES) {
    const letter = name[0].toUpperCase();
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(name);
  }
  return [
    { label: t('syntax.auto'), icon: 'refresh', checked: !current, disabled: !onText(), run: () => setSyntax(null) },
    { label: t('syntax.plain'), icon: 'txtFile', checked: current === 'plain', disabled: !onText(), run: () => setSyntax('plain') },
    'sep',
    ...[...groups].map(([letter, names]) => ({ label: letter, icon: 'syntax', items: names.map((name) => ({ label: name, checked: current === name, disabled: !onText(), run: () => setSyntax(name) })) })),
  ];
}

function menus() {
  const recentItems = state.recent.length
    ? [...state.recent.slice(0, 15).map((item) => ({ label: baseName(item.path), icon: KINDS[kindOf(item.path)]?.icon ?? 'file', tip: item.path, run: () => openRecent(item.path) })), 'sep', { label: t('recent.clear'), icon: 'clearHistory', danger: true, run: () => { state.recent = []; storeRecent(store, []); renderAll(); } }]
    : [{ label: t('recent.empty'), icon: 'info', disabled: true }];
  const templateItems = TEMPLATES.map((tpl) => ({ label: tpl[lang()][0], icon: tpl.icon, tip: tpl[lang()][1], run: () => newFromTemplate(tpl.id) }));
  const encodings = ['utf-8', 'utf-8-bom', 'utf-16le', 'utf-16be', 'euc-kr'].map((enc) => ({ label: encodingLabel(enc), checked: activeDoc()?.encoding === enc, disabled: !onText(), run: () => setEncoding(enc) }));
  const eols = ['lf', 'crlf'].map((eol) => ({ label: eol.toUpperCase(), checked: activeDoc()?.eol === eol, disabled: !onText(), run: () => setEol(eol) }));
  const kinds = ['markdown', 'html', 'text'].map((kind) => ({ label: t(`kind.${kind}`), icon: KINDS[kind].icon, checked: activeDoc()?.kind === kind, disabled: !onText(), run: () => setKind(kind) }));
  const styles = ['github', 'document', 'academic', 'plain'].map((style) => ({ label: t(`previewStyle.${style}`), checked: state.settings.previewStyle === style, run: () => updateSettings({ previewStyle: style }) }));
  const spellLangs = ['both', 'en', 'ko'].map((id) => ({ label: t(`spell.${id}`), checked: state.settings.spellLanguages === id, run: () => updateSettings({ spellLanguages: id, spellCheck: true }) }));
  return {
    file: [
      ...menuItems(['new', 'newMarkdown', 'newHtml', 'newText']),
      { label: t('action.newFromTemplate'), icon: 'template', items: templateItems },
      ...menuItems(['pasteNew', 'sep', 'open', 'openFolder', 'openAsHex']),
      { label: t('action.openRecent'), icon: 'recent', items: recentItems },
      ...menuItems(['reload', 'sep', 'save', 'saveAs', 'saveAll', 'sep', 'exportHtml', 'copyHtml', 'openInBrowser', 'print', 'sep', 'closeTab', 'closeAll', 'sep', 'home', 'exit']),
    ],
    edit: [
      ...menuItems(['undo', 'redo', 'sep', 'cut', 'copy', 'paste', 'selectAll', 'sep', 'find', 'replace', 'findInFiles', 'gotoLine', 'sep', 'duplicateLine', 'toggleComment', 'indentMore', 'indentLess', 'sep']),
      { label: t('submenu.bookmarks'), icon: 'bookmark', items: menuItems(['bookmarkToggle', 'bookmarkNext', 'bookmarkPrev', 'bookmarkClear']) },
      ...menuItems(['sep', 'readOnly']),
    ],
    format: menuItems(['bold', 'italic', 'strike', 'inlineCode', 'sep', 'heading1', 'heading2', 'heading3', 'heading4', 'paragraph', 'sep', 'bulletList', 'orderedList', 'taskList', 'quote']),
    insert: menuItems(['link', 'image', 'table', 'codeBlock', 'hr', 'footnote', 'sep', 'dateTime']),
    tools: [
      { label: t('submenu.case'), icon: 'caseUpper', items: menuItems(['upper', 'lower', 'titleCase']) },
      { label: t('submenu.lines'), icon: 'sortLines', items: menuItems(['sortAsc', 'sortDesc', 'sortLength', 'reverseLines', 'dedupe', 'sep', 'trimTrailing', 'trimLeading', 'trimBoth', 'removeEmpty', 'joinLines', 'numberLines']) },
      { label: t('submenu.whitespace'), icon: 'whitespace', items: menuItems(['tabsToSpaces', 'spacesToTabs']) },
      { label: t('submenu.encode'), icon: 'encodeTool', items: menuItems(['base64Encode', 'base64Decode', 'sep', 'urlEncode', 'urlDecode', 'sep', 'escapeHtml', 'unescapeHtml', 'sep', 'hashSelection']) },
      'sep',
      ...menuItems(['formatHtml', 'stats', 'sep', 'spellCheck']),
      { label: t('submenu.spellLanguages'), icon: 'globe', items: spellLangs },
      ...menuItems(['userDictionary', 'sep']),
      { label: t('submenu.syntax'), icon: 'syntax', items: syntaxItems() },
      { label: t('submenu.kind'), icon: 'codeFile', items: kinds },
      { label: t('submenu.encoding'), icon: 'encoding', items: encodings },
      { label: t('submenu.eol'), icon: 'lineEnding', items: eols },
    ],
    macro: menuItems(['macroRecord', 'macroStop', 'sep', 'macroPlay', 'macroRepeat']),
    view: [
      ...menuItems(['viewEditor', 'viewSplit', 'viewPreview', 'viewWysiwyg', 'syncScroll', 'sep', 'leftPanel', 'rightPanel', 'bottomPanel', 'statusBar', 'sep', 'explorer', 'outline', 'problems', 'sep', 'wordWrap', 'lineNumbers', 'activeLine', 'whitespace', 'inlineImages', 'sep', 'foldAll', 'unfoldAll', 'sep', 'zoomIn', 'zoomOut', 'zoomReset', 'sep']),
      { label: t('submenu.previewStyle'), icon: 'viewPreview', items: styles },
      { label: `${t('action.themeChoose')}…`, icon: 'palette', run: () => themeMenu() },
      ...menuItems(['language', 'focusMode', 'alwaysOnTop', 'sep', 'settings']),
    ],
    help: menuItems(['userGuide', 'shortcuts', 'sep', 'about']),
  };
}

/** The custom theme starts from the current theme's colours the first time it is chosen. */
function useCustomTheme() {
  updateSettings({ theme: 'custom', customTheme: state.settings.customTheme ?? customFrom(resolveTheme(state.settings.theme, prefersDark())) });
}

/** The theme drop-down of the toolbar (as in MyUMLMaker): system and custom on top, dark | light columns, edit / random / close. */
function themeMenu(anchor) {
  closeMenu();
  const button = root.querySelector('#toolbar .split-button [data-command="themeMenu"]')?.closest('.split-button') ?? anchor ?? toolbarAnchor('themeMenu');
  showThemePicker(button, {
    theme: () => state.settings.theme,
    pick: (id) => (id === 'custom' ? useCustomTheme() : updateSettings({ theme: id })),
    editCustom: () => { if (state.settings.theme !== 'custom') useCustomTheme(); openSettings(appApi, 'appearance'); },
    random: () => run('theme'),
  });
}

// ───────────────────────── shell

const GRIP_DOTS = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="20" cy="20" r="2"/><circle cx="14" cy="20" r="2"/><circle cx="20" cy="14" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="14" cy="14" r="2"/><circle cx="20" cy="8" r="2"/></svg>';

function renderShell() {
  closeThemePicker();
  root.innerHTML = `
    <nav id="menubar" role="menubar"></nav>
    <div id="toolbar" role="toolbar"></div>
    <main id="workspace">
      <aside id="left-panel" class="side-panel" aria-label="${escapeHtml(t('panel.left'))}"></aside>
      <div class="splitter vertical panel-split" data-split="left" title="${escapeHtml(t('tip.panelSplitter'))}" role="separator" aria-orientation="vertical"></div>
      <section id="center">
        <div id="tabs"></div>
        <div id="center-body">
          <div id="editor-area">
            <div id="editor-pane"></div>
            <div class="splitter vertical" data-split="preview" title="${escapeHtml(t('tip.previewSplitter'))}" role="separator" aria-orientation="vertical"></div>
            <div id="preview-pane"><div class="pane-head">${icon('viewPreview')}<span>${escapeHtml(t('panel.preview'))}</span><span class="grow"></span><span class="pane-note"></span></div></div>
            <div id="wysiwyg-pane" title="${escapeHtml(t('wysiwyg.note'))}">${mdTagBarHtml()}</div>
          </div>
          <div id="viewer-pane"></div>
          <div id="start-page" hidden></div>
          <div class="drop-overlay" aria-hidden="true"><div>${icon('drop')}<span>${escapeHtml(t('drop.hint'))}</span></div></div>
        </div>
        <div class="splitter horizontal bottom-split" data-split="bottom" title="${escapeHtml(t('tip.bottomSplitter'))}" role="separator" aria-orientation="horizontal"></div>
        <section id="bottom-panel" aria-label="${escapeHtml(t('panel.bottom'))}"></section>
      </section>
      <div class="splitter vertical panel-split" data-split="right" title="${escapeHtml(t('tip.panelSplitter'))}" role="separator" aria-orientation="vertical"></div>
      <aside id="right-panel" class="side-panel" aria-label="${escapeHtml(t('panel.right'))}"></aside>
    </main>
    <footer id="statusbar" role="status"></footer>
    <div class="resize-grip ${desktop ? '' : 'static'}" ${desktop ? 'data-resize-grip' : 'aria-hidden="true"'} title="${escapeHtml(t('tip.resize'))}" aria-label="${escapeHtml(t('tip.resize'))}" role="separator">${GRIP_DOTS}</div>`;
  root.querySelector('#editor-pane').appendChild(editorHost);
  root.querySelector('#preview-pane').appendChild(previewHost);
  root.querySelector('#wysiwyg-pane').appendChild(wysiwygHost);
  root.querySelector('#viewer-pane').append(viewerHost, hexHost);
  if (!editor) createViews();
  else { preview.clear(); wysiwyg.clear(); }
  renderToolbar();
  const doc = activeDoc();
  if (doc && !state.showStart) mountDocument(doc);
  renderAll();
}

function createViews() {
  editor = new TextEditor(editorHost, {
    onChange: (doc) => onDocChanged(doc),
    onCursor: () => { renderStatus(); markPreviewLine(); highlightOutline(); scheduleInfo(); },
    onScroll: () => syncFromEditor(),
    onKey: (event) => handleShortcut(event),
    onSpell: (doc) => { if (doc === activeDoc()) scheduleProblems(0); },
  });
  preview = new Preview(previewHost, {
    fileUrl: (path) => native.fileUrl(path),
    onLink: (href) => followLink(href),
    onScroll: () => syncFromPreview(),
    style: () => state.settings.previewStyle,
    dark: () => isDark(),
    scripts: () => state.settings.previewScripts,
    onReload: () => schedulePreview(0),
  });
  wysiwyg = new Wysiwyg(wysiwygHost, {
    onChange: (markdown) => applyWysiwyg(markdown),
    resolve: (src) => resolveImage(activeDoc(), src),
    onKey: (event) => handleShortcut(event),
    onLink: (href) => followLink(href),
    onDropFiles: (files, insert) => insertImageFiles(files, insert),
    onSelection: () => updateTagBar(),
    style: () => state.settings.previewStyle,
    dark: () => isDark(),
    placeholder: () => t('wysiwyg.placeholder'),
  });
  hexEditor = new HexEditor(hexHost, {
    onChange: () => { const doc = activeDoc(); if (doc?.kind === 'hex') { refreshTabState(doc); renderStatus(); scheduleInfo(); } },
    onCursor: (info) => { state.hexInfo = info; renderStatus(); },
  });
  // Pictures pasted into the source (a screenshot): saved next to the document, or embedded.
  editorHost.addEventListener('paste', (event) => {
    const doc = activeDoc();
    if (!doc || !['markdown', 'html'].includes(doc.kind)) return;
    const files = [...(event.clipboardData?.files ?? [])].filter((file) => isImageFile(file.name, file.type));
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    insertImageFiles(files.map((file) => ({ file, path: file.name || 'pasted.png', web: true })));
  }, true);
}

function renderAll() {
  const doc = activeDoc();
  const onStart = state.showStart || !doc;
  const s = state.settings;
  root.classList.toggle('on-start', onStart);
  root.classList.toggle('left-closed', !s.leftOpen || state.focusMode);
  root.classList.toggle('right-closed', !s.rightOpen || state.focusMode);
  root.classList.toggle('bottom-closed', !s.bottomOpen || state.focusMode);
  root.classList.toggle('no-status', !s.showStatusBar);
  root.classList.toggle('focus-mode', state.focusMode);
  root.style.setProperty('--outline-width', `${s.outlineWidth}px`);
  root.style.setProperty('--right-width', `${s.rightWidth}px`);
  root.style.setProperty('--bottom-height', `${s.bottomHeight}px`);
  const area = root.querySelector('#editor-area');
  const textDoc = doc && isTextKind(doc.kind);
  const mode = textDoc ? modeFor(doc) : 'editor';
  area.dataset.mode = mode;
  area.style.setProperty('--split', String(s.splitRatio));
  root.querySelector('#start-page').hidden = !onStart;
  area.hidden = onStart || !textDoc;
  root.querySelector('#viewer-pane').hidden = onStart || textDoc;
  renderMenubar();
  renderToolbarState();
  renderTabs();
  renderLeftPanel();
  renderRightPanel();
  renderBottomPanel();
  renderStatus();
  if (onStart) renderStartPage(); else stopStartPage();
  if (!onStart && textDoc && (mode === 'split' || mode === 'preview')) schedulePreview(0);
  if (!onStart && textDoc && mode === 'wysiwyg') showWysiwyg(doc);
  updateTitle();
}

function updateTitle() {
  const doc = state.showStart ? null : activeDoc();
  native.setWindowTitle(doc ? `${isDirty(doc) ? '● ' : ''}${docName(doc)} — MyTextMaster` : `MyTextMaster v${VERSION}`);
}

function renderMenubar() {
  const menubar = root.querySelector('#menubar');
  const onStart = state.showStart || !activeDoc();
  const home = `<button class="menubar-item menubar-home ${onStart ? 'current' : ''}" data-command="home" title="${escapeHtml(t('tip.home'))}" aria-label="${escapeHtml(t('menu.home'))}" aria-pressed="${onStart}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button><span class="menubar-sep" aria-hidden="true"></span>`;
  const brand = `<div class="app-brand" data-window-drag title="${escapeHtml(`MyTextMaster v${VERSION}`)}"><img class="app-brand-icon" src="${appIconUrl}" alt="" data-window-drag /><span class="app-brand-name" data-window-drag>MyTextMaster</span><span class="app-brand-version" data-window-drag>v${escapeHtml(VERSION)}</span><span class="app-brand-project" data-window-drag><span class="app-brand-project-name" data-window-drag></span><span class="app-brand-dirty" data-window-drag>●</span></span></div>`;
  const button = (id, glyph, key) => `<button class="window-button ${id === 'close' ? 'close' : ''}" data-window="${id}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(glyph)}</button>`;
  const controls = desktop ? `<div class="window-controls">${button('minimize', 'winMinimize', 'window.minimize')}${state.maximized ? button('maximize', 'winRestore', 'window.restore') : button('maximize', 'winMaximize', 'window.maximize')}${button('close', 'winClose', 'window.close')}</div>` : '';
  const open = menuKey();
  const recording = editor?.recording ? `<span class="macro-recording" title="${escapeHtml(t('notice.macroRecording'))}">${icon('macroRecord')}<span>REC</span></span>` : '';
  menubar.innerHTML = brand + home + Object.keys(MENU_ICONS).map((name) => `
    <button class="menubar-item ${open === name ? 'open' : ''}" data-menu="${name}" role="menuitem" aria-haspopup="true" title="${escapeHtml(t(`menu.${name}`))}">${icon(MENU_ICONS[name])}<span>${escapeHtml(t(`menu.${name}`))}</span></button>`).join('')
    + `${recording}<div class="menubar-drag" data-window-drag></div>${controls}`;
  renderTitleDoc();
}

function renderTitleDoc() {
  const box = root.querySelector('.app-brand-project');
  if (!box) return;
  const doc = state.showStart ? null : activeDoc();
  box.classList.toggle('empty', !doc);
  box.classList.toggle('dirty', isDirty(doc));
  box.querySelector('.app-brand-project-name').textContent = doc ? docName(doc) : '';
  box.title = doc ? `${doc.path ?? docName(doc)}${isDirty(doc) ? ` (${t('status.modified')})` : ''}` : '';
}

function openMenubarMenu(name) {
  const button = root.querySelector(`[data-menu="${name}"]`);
  if (!button) return;
  const names = Object.keys(MENU_ICONS);
  showMenu(menus()[name], button, {
    key: name,
    onClose: () => root.querySelectorAll('.menubar-item.open').forEach((el) => el.classList.remove('open')),
    onSide: (direction) => openMenubarMenu(names[(names.indexOf(name) + direction + names.length) % names.length]),
  });
  root.querySelectorAll('.menubar-item.open').forEach((el) => el.classList.remove('open'));
  button.classList.add('open');
}

// ───────────────────────── toolbar

// Cut / copy / paste, replace, save all, strikethrough, quote and rules are in the menus and on keys:
// the toolbar fits a 1300 px window and is never cut off (updateMinimumWidth).
const TOOLBAR = [
  ['new', 'open', 'save', 'print'],
  ['undo', 'redo', 'find'],
  ['bold', 'italic', 'inlineCode', 'headingMenu', 'bulletList', 'orderedList', 'taskList'],
  ['link', 'image', 'table'],
  ['viewEditor', 'viewSplit', 'viewPreview', 'viewWysiwyg', 'syncScroll'],
  ['leftPanel', 'bottomPanel', 'rightPanel'],
  ['wordWrap', 'spellCheck', 'zoom', 'exportHtml'],
];
const TOOLBAR_RIGHT = ['themeSplit', 'language', 'settings', 'about'];

function toolbarAnchor(id) {
  return root.querySelector(`#toolbar [data-command="${id}"]`) ?? root.querySelector('#toolbar');
}

function renderToolbar() {
  const toolbar = root.querySelector('#toolbar');
  const plain = (id, extra = '') => {
    const command = commands[id];
    const glyph = id === 'language' ? switchFlag(lang()) : icon(command.icon);
    return `<button class="tool-button ${extra}" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(command.label))}">${glyph}</button>`;
  };
  const button = (id) => {
    if (id === 'zoom') {
      return `<span class="stepper toolbar-zoom" title="${escapeHtml(t('tip.fontSize'))}">
        <button class="tool-button stepper-button-tool" data-command="zoomOut" title="${escapeHtml(commandTip('zoomOut'))}" aria-label="${escapeHtml(t('action.zoomOut'))}">${icon('minus')}</button>
        <input class="stepper-value" id="font-size-value" type="text" inputmode="numeric" value="${state.settings.editorFontSize}px" title="${escapeHtml(t('tip.fontSize'))}" aria-label="${escapeHtml(t('tip.fontSize'))}" />
        <button class="tool-button stepper-button-tool" data-command="zoomIn" title="${escapeHtml(commandTip('zoomIn'))}" aria-label="${escapeHtml(t('action.zoomIn'))}">${icon('plus')}</button>
      </span>`;
    }
    if (id === 'headingMenu') return `<span class="split-button">${plain('heading1')}<button class="tool-button split-arrow" data-command="headingMenu" title="${escapeHtml(commandTip('headingMenu'))}" aria-label="${escapeHtml(t('action.heading'))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
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
    const checked = commands[id]?.checked?.();
    element.classList.toggle('active', Boolean(checked));
    if (checked !== undefined) element.setAttribute('aria-pressed', String(Boolean(checked)));
  }
  const size = root.querySelector('#font-size-value');
  if (size && document.activeElement !== size) size.value = `${state.settings.editorFontSize}px`;
}

/** The window can never be so narrow that toolbar buttons or menus are hidden. */
function updateMinimumWidth() {
  requestAnimationFrame(() => {
    const left = root.querySelector('.toolbar-left');
    const right = root.querySelector('.toolbar-right');
    const toolbar = root.querySelector('#toolbar');
    if (!left || !right) return;
    const style = getComputedStyle(toolbar);
    const menusWidth = [...root.querySelectorAll('.app-brand, #menubar > .menubar-item, .menubar-sep, .window-controls')].reduce((sum, el) => sum + el.offsetWidth + 2, 60);
    const width = Math.ceil(Math.max(menusWidth, left.scrollWidth + right.scrollWidth + 24 + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2));
    if (Math.abs(width - state.minWidth) < 1) return;
    state.minWidth = width;
    document.documentElement.style.setProperty('--min-width', `${width}px`);
    native.setMinimumSize(width, 600);
  });
}

// ───────────────────────── tabs

function renderTabs() {
  renderTitleDoc();
  const tabs = root.querySelector('#tabs');
  const active = activeDoc();
  tabs.hidden = state.showStart || !active;
  if (tabs.hidden) { tabs.innerHTML = ''; return; }
  const scroll = tabs.querySelector('.tab-strip')?.scrollLeft ?? 0;
  tabs.innerHTML = `
    <div class="tab-strip"><div class="tab-list" role="tablist" aria-label="${escapeHtml(t('tabs.documents'))}">
      ${state.docs.map((doc) => `<div class="tab ${doc.id === state.activeId ? 'active' : ''} ${isDirty(doc) ? 'dirty' : ''}" role="tab" aria-selected="${doc.id === state.activeId}" data-tab="${doc.id}" title="${escapeHtml(doc.path ?? doc.name)}${isDirty(doc) ? ` (${escapeHtml(t('status.modified'))})` : ''}">${icon(doc.guide ? 'userGuide' : KINDS[doc.kind]?.icon ?? 'file')}<span class="tab-name">${escapeHtml(doc.name)}</span>${doc.readOnly ? icon('lock', 'icon tiny') : ''}<span class="tab-dirty">●</span><button class="tab-close" data-tab-close="${doc.id}" title="${escapeHtml(t('action.closeTab'))}" aria-label="${escapeHtml(t('action.closeTab'))}">${icon('close')}</button></div>`).join('')}
    </div></div>
    <button class="tab-add" data-tab-add title="${escapeHtml(t('tip.newTab'))}" aria-label="${escapeHtml(t('tip.newTab'))}">${icon('plus')}</button>
    <div class="tab-nav">
      <button class="tab-scroll" data-tab-scroll="-1" title="${escapeHtml(t('tabs.left'))}" aria-label="${escapeHtml(t('tabs.left'))}">${icon('chevronLeft')}</button>
      <button class="tab-scroll" data-tab-scroll="1" title="${escapeHtml(t('tabs.right'))}" aria-label="${escapeHtml(t('tabs.right'))}">${icon('chevronRight')}</button>
    </div>`;
  const strip = tabs.querySelector('.tab-strip');
  strip.scrollLeft = scroll;
  updateTabNav();
  const tab = strip.querySelector('.tab.active');
  if (tab && renderTabs.shown !== state.activeId) {
    renderTabs.shown = state.activeId;
    if (tab.offsetLeft < strip.scrollLeft) strip.scrollLeft = tab.offsetLeft;
    else if (tab.offsetLeft + tab.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = tab.offsetLeft + tab.offsetWidth - strip.clientWidth;
    updateTabNav();
  }
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

/** Only the tab states (dirty dot, title): cheaper than drawing the tabs on every key. */
function refreshTabState(doc) {
  for (const el of root.querySelectorAll(`[data-tab="${doc.id}"]`)) el.classList.toggle('dirty', isDirty(doc));
  renderTitleDoc();
  updateTitle();
}

function tabMenu(doc, point) {
  showMenu([
    { label: t('action.closeTab'), icon: 'closeTab', run: () => closeDocument(doc) },
    { label: t('tabs.closeOthers'), icon: 'closeAll', disabled: state.docs.length < 2, run: () => closeOthers(doc) },
    { label: t('tabs.closeRight'), icon: 'chevronRight', disabled: state.docs.indexOf(doc) === state.docs.length - 1, run: () => closeRight(doc) },
    { label: t('action.closeAll'), icon: 'closeAll', run: () => closeAll() },
    'sep',
    { label: t('action.save'), icon: 'save', disabled: doc.readOnly || !(isTextKind(doc.kind) || doc.kind === 'hex'), run: () => saveDocument(doc) },
    { label: t('action.saveAs'), icon: 'saveAs', disabled: !(isTextKind(doc.kind) || doc.kind === 'hex'), run: () => saveDocument(doc, { as: true }) },
    { label: t('tabs.rename'), icon: 'edit', disabled: Boolean(doc.path) && !doc.web, run: () => renameUntitled(doc) },
    { label: t('action.openAsHex'), icon: 'openAsHex', disabled: doc.kind === 'hex' || doc.guide, run: () => openAsHex(doc) },
    'sep',
    { label: t('tabs.copyPath'), icon: 'copy', disabled: !doc.path || doc.web, run: () => copyText(doc.path).then(() => notify('success', t('notice.copied'))) },
    { label: t('tabs.copyName'), icon: 'copy', run: () => copyText(doc.name).then(() => notify('success', t('notice.copied'))) },
    { label: t('tabs.openFolder'), icon: 'folderOpen', disabled: !doc.path || doc.web || !desktop, run: () => native.openExternal(dirName(doc.path)).catch(showError) },
    { label: t('tabs.revealInExplorer'), icon: 'explorer', disabled: !doc.path || doc.web || !desktop, run: () => revealInExplorer(doc.path) },
  ], point);
}

// ───────────────────────── panels

function renderLeftPanel() { const host = root.querySelector('#left-panel'); if (host) renderLeft(appApi, host); }
function renderRightPanel() { const host = root.querySelector('#right-panel'); if (host) renderRight(appApi, host); }
function renderBottomPanel() { const host = root.querySelector('#bottom-panel'); if (host) renderBottom(appApi, host); }

/** Only the counts on the tabs of closed panels (cheap). */
function updatePanelBadges() {
  if (!state.settings.bottomOpen) return;
  const badge = root.querySelector('[data-panel-tab="bottom:log"] .panel-badge');
  if (badge) badge.textContent = String(state.log.length);
}

function openPanelTab(side, tab) {
  updateSettings({ [`${side}Open`]: true, [`${side}Tab`]: tab });
}

function highlightOutline() {
  const doc = activeDoc();
  if (!doc || state.showStart || !editor || !isTextKind(doc.kind)) return;
  const line = editor.cursorInfo().line;
  let current = null;
  for (const item of root.querySelectorAll('.outline-item[data-outline-line]')) { if (Number(item.dataset.outlineLine) <= line) current = item; }
  for (const item of root.querySelectorAll('.outline-item.current')) if (item !== current) item.classList.remove('current');
  current?.classList.add('current');
}

let infoTimer = 0;
/** The information panel follows the cursor (line counter) without redrawing on every key. */
function scheduleInfo() {
  if (!state.settings.rightOpen || state.settings.rightTab !== 'info') return;
  clearTimeout(infoTimer);
  infoTimer = setTimeout(renderRightPanel, 150);
}

function docInfo(doc) {
  const out = { syntax: isTextKind(doc.kind) ? languageName(doc.kind, doc.name, doc.syntax) : null, stats: null, lineCounter: null };
  if (isTextKind(doc.kind) && doc.state) {
    out.stats = cachedStats(doc);
    if (doc === editor.doc) {
      const c = editor.cursorInfo();
      const sel = editor.view.state.selection.main;
      const selectedLines = sel.empty ? 0 : editor.view.state.doc.lineAt(sel.to).number - editor.view.state.doc.lineAt(sel.from).number + 1;
      out.lineCounter = { line: c.line, lines: c.lines, col: c.col, selectedLines };
    } else out.lineCounter = { line: 1, lines: doc.state.doc.lines, col: 1, selectedLines: 0 };
  }
  return out;
}

async function loadDetails(path) {
  if (state.details.has(path) || !desktop) return;
  state.details.set(path, null);
  try { state.details.set(path, await native.fileDetails(path)); } catch { state.details.delete(path); return; }
  renderRightPanel();
}

async function computeHashes() {
  const doc = activeDoc();
  if (!doc) return;
  const key = doc.path ?? `doc:${doc.id}`;
  try {
    if (doc.path && !doc.web && desktop && !isDirty(doc)) state.hashes.set(key, await native.fileHashes(doc.path));
    else {
      const text = isTextKind(doc.kind) ? editor.text(doc) : '';
      state.hashes.set(key, { sha1: await tools.digest(text, 'SHA-1'), sha256: await tools.digest(text, 'SHA-256') });
    }
  } catch (error) { showError(error); }
  renderRightPanel();
}

function copyAllInfo() {
  const host = root.querySelector('#right-panel .panel-body');
  if (!host) return;
  const lines = [...host.querySelectorAll('.info-name, .info-row, .hash-row, .line-counter div')].map((el) => el.innerText.replace(/\s*\n\s*/g, ': ').trim());
  copyText(lines.join('\n')).then(() => notify('success', t('notice.copied')));
}

const bookmarkLinesOfActive = () => {
  const doc = activeDoc();
  if (!doc || !isTextKind(doc.kind) || !doc.state) return [];
  return bookmarkLines(doc === editor.doc ? editor.view.state : doc.state);
};

function afterBookmarks() {
  const doc = activeDoc();
  if (doc && doc === editor.doc) doc.state = editor.view.state;
  renderRightPanel();
}

// ───────────────────────── explorer and find in files

async function loadPlaces() {
  if (!desktop || state.explorer.places) return;
  state.explorer.places = await native.explorerPlaces().catch(() => []);
  if (!state.explorer.root) {
    const home = state.explorer.places.find((p) => p.kind === 'documents') ?? state.explorer.places[0];
    if (home) state.explorer.root = home.path;
  }
  renderLeftPanel();
}

const loading = new Set();
async function loadDir(dir) {
  if (loading.has(dir)) return;
  loading.add(dir);
  try { state.explorer.cache.set(dir, await native.listDir(dir, state.explorer.showHidden)); } catch (error) { state.explorer.cache.set(dir, Object.assign([], { error: String(error?.message ?? error) })); }
  loading.delete(dir);
  if (state.settings.leftTab === 'explorer') renderLeftPanel();
}

function setExplorerRoot(dir) {
  state.explorer.root = dir;
  state.explorer.expanded.clear();
  updateSettings({ explorerRoot: dir, leftOpen: true, leftTab: 'explorer' });
}

async function chooseExplorerRoot() {
  const dir = await native.chooseFolder(state.explorer.root);
  if (dir) setExplorerRoot(dir);
}

/** Shows a file's folder in the explorer, with the file marked. */
function revealInExplorer(path) {
  const dir = dirName(path);
  if (!state.explorer.root || !samePath(path.slice(0, state.explorer.root.length), state.explorer.root)) state.explorer.root = dir;
  // Open every folder between the root and the file.
  let current = dir;
  while (current && current.length > state.explorer.root.length) { state.explorer.expanded.add(current); current = dirName(current); }
  state.explorer.cache.delete(dir);
  updateSettings({ explorerRoot: state.explorer.root, leftOpen: true, leftTab: 'explorer' });
}

function explorerAction(action) {
  const ex = state.explorer;
  if (action === 'up' && ex.root && dirName(ex.root)) setExplorerRoot(dirName(ex.root).replace(/^([A-Za-z]:)$/, '$1\\'));
  else if (action === 'choose') chooseExplorerRoot();
  else if (action === 'docFolder' && activeDoc()?.path) revealInExplorer(activeDoc().path);
  else if (action === 'refresh') { ex.cache.clear(); ex.places = null; loadPlaces(); renderLeftPanel(); }
  else if (action === 'hidden') updateSettings({ showHidden: !state.settings.showHidden });
  else if (action === 'collapseAll') { ex.expanded.clear(); renderLeftPanel(); }
}

function openFindInFiles() {
  const selected = onText() ? editor.selection().text : '';
  if (selected && !selected.includes('\n')) state.search.query = selected;
  if (!state.search.dir) state.search.dir = state.explorer.root || (activeDoc()?.path && !activeDoc().web ? dirName(activeDoc().path) : '');
  openPanelTab('right', 'search');
  requestAnimationFrame(() => root.querySelector('[data-search-form] input[name="query"]')?.focus());
}

async function runSearch(form) {
  const data = new FormData(form);
  const s = state.search;
  s.query = String(data.get('query') ?? '');
  s.dir = String(data.get('dir') ?? '').trim();
  s.ext = String(data.get('ext') ?? '');
  s.caseSensitive = data.get('caseSensitive') === 'on';
  s.wholeWord = data.get('wholeWord') === 'on';
  if (!s.query || !s.dir) { notify('info', t('search.need')); return; }
  s.busy = true;
  renderRightPanel();
  try {
    const extensions = s.ext.split(/[,\s;]+/).map((e) => e.replace(/^\*?\./, '').trim()).filter(Boolean);
    const result = await native.searchFiles({ dir: s.dir, query: s.query, caseSensitive: s.caseSensitive, wholeWord: s.wholeWord, extensions });
    Object.assign(s, { hits: result.hits, files: result.files, truncated: result.truncated });
    log('info', t('search.summary', { hits: result.hits.length, files: new Set(result.hits.map((h) => h.path)).size, scanned: result.files }));
  } catch (error) {
    showError(error);
  } finally {
    s.busy = false;
    renderRightPanel();
  }
}

async function openAt(path, line, col = 1) {
  const doc = await openFile({ path });
  if (!doc || !isTextKind(doc.kind)) return;
  leaveWysiwyg();
  editor.goToLine(line, col);
}

// ───────────────────────── status bar

function encodingLabel(encoding) {
  return { 'utf-8': 'UTF-8', 'utf-8-bom': 'UTF-8 BOM', 'utf-16le': 'UTF-16 LE', 'utf-16be': 'UTF-16 BE', 'euc-kr': 'EUC-KR' }[encoding] ?? encoding;
}

let statsCache = { doc: null, version: null, value: null };
function cachedStats(doc) {
  const text = doc.state.doc;
  if (statsCache.doc !== doc || statsCache.version !== text) statsCache = { doc, version: text, value: textStats(text.toString()) };
  return statsCache.value;
}

function renderStatus() {
  const bar = root.querySelector('#statusbar');
  if (!bar) return;
  const doc = state.showStart ? null : activeDoc();
  const notice = state.notice ? `<span class="status-notice ${state.notice.kind}">${icon(state.notice.kind === 'error' ? 'error' : state.notice.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(state.notice.text)}</span></span>` : '<span class="status-notice"></span>';
  const problems = state.problems.length ? `<button class="status-item ${state.problems.some((p) => p.severity === 'error') ? 'warn' : ''}" data-command="problems" title="${escapeHtml(t('panel.problems'))}">${icon('problems')}<span>${state.problems.length}</span></button>` : '';
  if (!doc) {
    bar.innerHTML = `<span class="status-item">${icon('home')}<span>${escapeHtml(t('status.start'))}</span></span><span class="status-item">${icon('file')}<span>${escapeHtml(t('status.openDocs', { n: state.docs.length }))}</span></span>${notice}<span class="status-item clock">${icon('globe')}<span>${escapeHtml(desktop ? t('status.desktop') : t('status.web'))}</span></span>`;
    return;
  }
  if (doc.kind === 'hex') {
    const h = state.hexInfo;
    const v = h?.values;
    bar.innerHTML = `<span class="status-item">${icon('hexFile')}<span>${escapeHtml(t('kind.hex'))}</span></span>
      ${h ? `<button class="status-item" data-command="gotoLine" title="${escapeHtml(commandTip('gotoLine'))}">${icon('goTo')}<span>${escapeHtml(t('hex.offset', { hex: h.offset.toString(16).toUpperCase().padStart(8, '0'), dec: h.offset.toLocaleString() }))}</span></button>` : ''}
      ${h?.selected ? `<span class="status-item">${icon('selectAll')}<span>${escapeHtml(t('status.selectedBytes', { n: h.selected }))}</span></span>` : ''}
      ${v ? `<span class="status-item" title="u16 LE ${v.u16le ?? '—'} · BE ${v.u16be ?? '—'}\nu32 LE ${v.u32le ?? '—'} · BE ${v.u32be ?? '—'}\ni32 LE ${v.i32le ?? '—'} · f32 LE ${v.f32le ?? '—'}">${icon('hashTool')}<span>${v.u8} · 0x${v.u8.toString(16).toUpperCase().padStart(2, '0')} · ${v.u8.toString(2).padStart(8, '0')}</span></span>` : ''}
      ${notice}
      <span class="status-item ${isDirty(doc) ? 'modified' : 'saved'}">${icon(isDirty(doc) ? 'edit' : 'check')}<span>${escapeHtml(isDirty(doc) ? t('status.modified') : t('status.saved'))}</span></span>
      <span class="status-item">${escapeHtml(h?.insert ? 'INS' : 'OVR')}</span>
      <span class="status-item clock">${icon('hexFile')}<span>${escapeHtml(formatSize(doc.bytes.length))}</span></span>`;
    return;
  }
  if (!isTextKind(doc.kind)) {
    bar.innerHTML = `<span class="status-item">${icon(doc.guide ? 'userGuide' : KINDS[doc.kind]?.icon ?? 'file')}<span>${escapeHtml(doc.guide ? t('action.userGuide') : t(`kind.${doc.kind}`))}</span></span>${notice}${doc.size !== undefined ? `<span class="status-item clock">${icon('hexFile')}<span>${escapeHtml(formatSize(doc.size))}</span></span>` : ''}`;
    return;
  }
  const cursor = editor.cursorInfo();
  const stats = cachedStats(doc);
  const dirty = isDirty(doc);
  const syntax = languageName(doc.kind, doc.name, doc.syntax);
  bar.innerHTML = `
    <button class="status-item" data-status="kind" title="${escapeHtml(t('tip.kind'))}">${icon(KINDS[doc.kind].icon)}<span>${escapeHtml(t(`kind.${doc.kind}`))}${syntax && doc.kind === 'text' ? ` · ${escapeHtml(syntax)}` : ''}</span></button>
    <button class="status-item line-counter-status" data-command="gotoLine" title="${escapeHtml(t('info.lineCounterTip'))}">${icon('lineNumbers')}<span>${escapeHtml(t('status.cursor', { line: cursor.line.toLocaleString(), lines: cursor.lines.toLocaleString(), col: cursor.col }))}</span></button>
    ${cursor.selected ? `<span class="status-item">${icon('selectAll')}<span>${escapeHtml(t('status.selected', { n: cursor.selected }))}${cursor.ranges > 1 ? ` · ${cursor.ranges}` : ''}</span></span>` : ''}
    <button class="status-item" data-command="stats" title="${escapeHtml(t('action.stats'))}">${icon('wordCount')}<span>${escapeHtml(t('status.words', { words: stats.words.toLocaleString(), chars: stats.chars.toLocaleString() }))}</span></button>
    ${problems}
    ${notice}
    ${editor.recording ? `<button class="status-item warn" data-command="macroStop">${icon('macroRecord')}<span>REC</span></button>` : ''}
    <span class="status-item ${dirty ? 'modified' : 'saved'}">${icon(dirty ? 'edit' : 'check')}<span>${escapeHtml(dirty ? t('status.modified') : doc.path ? t('status.saved') : t('status.new'))}</span></span>
    ${doc.readOnly ? `<button class="status-item warn" data-command="readOnly" title="${escapeHtml(t('action.readOnly'))}">${icon('lock')}<span>${escapeHtml(t('status.readOnly'))}</span></button>` : ''}
    <button class="status-item" data-command="spellCheck" title="${escapeHtml(commandTip('spellCheck'))}">${icon('spellCheck')}<span>${escapeHtml(state.settings.spellCheck ? t(`spell.${state.settings.spellLanguages}`) : t('spell.off'))}</span></button>
    <button class="status-item" data-status="tab" title="${escapeHtml(t('tip.tabSize'))}">${icon('indentMore')}<span>${escapeHtml(state.settings.insertSpaces ? t('status.spaces', { n: state.settings.tabSize }) : t('status.tabs', { n: state.settings.tabSize }))}</span></button>
    <button class="status-item" data-status="eol" title="${escapeHtml(t('tip.eol'))}">${icon('lineEnding')}<span>${doc.eol.toUpperCase()}</span></button>
    <button class="status-item clock" data-status="encoding" title="${escapeHtml(t('tip.encoding'))}">${icon('encoding')}<span>${escapeHtml(encodingLabel(doc.encoding))}</span></button>`;
}

function statusMenu(kind, anchor) {
  const m = menus().tools;
  if (kind === 'kind') return showMenu([...m.find((item) => item.icon === 'codeFile').items, 'sep', { label: t('submenu.syntax'), icon: 'syntax', items: syntaxItems() }], anchor);
  if (kind === 'encoding') return showMenu(m.find((item) => item.icon === 'encoding').items, anchor);
  if (kind === 'eol') return showMenu(m.find((item) => item.icon === 'lineEnding').items, anchor);
  if (kind === 'tab') {
    return showMenu([
      ...[2, 4, 8].map((n) => ({ label: t('status.spaces', { n }), checked: state.settings.insertSpaces && state.settings.tabSize === n, run: () => updateSettings({ tabSize: n, insertSpaces: true }) })),
      'sep',
      ...[2, 4, 8].map((n) => ({ label: t('status.tabs', { n }), checked: !state.settings.insertSpaces && state.settings.tabSize === n, run: () => updateSettings({ tabSize: n, insertSpaces: false }) })),
      'sep', ...menuItems(['tabsToSpaces', 'spacesToTabs']),
    ], anchor);
  }
  return undefined;
}

// ───────────────────────── problems

let problemsTimer = 0;
function scheduleProblems(delay = 600) {
  clearTimeout(problemsTimer);
  problemsTimer = setTimeout(computeProblems, delay);
}

function computeProblems() {
  const doc = state.showStart ? null : activeDoc();
  if (!doc || !isTextKind(doc.kind) || !doc.state) state.problems = [];
  else {
    const text = editor.text(doc);
    const found = lint(doc.kind, text, doc.name);
    if (state.settings.spellCheck && doc === editor.doc) {
      const seen = new Set();
      for (const m of misspellings(editor.view)) {
        if (seen.size > 300) break;
        const line = editor.view.state.doc.lineAt(m.from);
        const key = `${m.word}@${line.number}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ line: line.number, col: m.from - line.from + 1, severity: 'info', code: 'spelling', params: { word: m.word } });
      }
    }
    state.problems = found.sort((a, b) => a.line - b.line || a.col - b.col);
  }
  if (state.settings.bottomOpen && state.settings.bottomTab === 'problems') renderBottomPanel();
  renderStatus();
}

// ───────────────────────── documents

function makeDoc({ name, path = null, kind, text = '', encoding = 'utf-8', eol = 'lf', mtime = 0, web = false, handle = null, readOnly = false }) {
  return { id: nextId++, name, path, kind: kind ?? kindOf(name), text, encoding, eol, mtime, web, handle, readOnly, state: null, savedDoc: null, scroll: null, previewRatio: 0, syntax: null };
}

/** The editor extensions that depend on the document (pictures in the source). */
function docExtras(doc) {
  return state.settings.inlineImages && ['markdown', 'html'].includes(doc.kind) ? inlineImages((src) => resolveImage(doc, src)) : [];
}

async function createDocState(doc) {
  doc.state = await editor.createState(doc, state.settings, isDark(), docExtras(doc));
}

/** Adds a document (text documents start as saved; callers mark new texts unsaved). */
async function addDocument(doc) {
  if (isTextKind(doc.kind)) {
    await createDocState(doc);
    doc.savedDoc = doc.state.doc;
    delete doc.text;
  }
  // A blank, untouched first document gives its place to an opened one.
  const first = state.docs[0];
  const blank = state.docs.length === 1 && isTextKind(first.kind) && !first.path && !isDirty(first) && editor.text(first) === '';
  if (blank && doc.path) state.docs = [];
  state.docs.push(doc);
  activate(doc);
  return doc;
}

function activate(doc) {
  if (!doc) return;
  const current = activeDoc();
  if (current && editor.doc === current && inWysiwyg()) wysiwyg.flush();
  if (current && editor.doc === current) current.previewRatio = preview.scrollRatio();
  viewerHandle?.stop?.();
  state.activeId = doc.id;
  state.showStart = false;
  mountDocument(doc);
  renderAll();
  scheduleProblems(100);
  requestAnimationFrame(() => focusDocument());
  saveSessionSoon();
}

function focusDocument() {
  const doc = activeDoc();
  if (!doc) return;
  if (doc.kind === 'hex') hexEditor.focus();
  else if (!isTextKind(doc.kind)) viewerHandle?.focus?.();
  else if (inWysiwyg()) wysiwyg.focus();
  else editor.focus();
}

async function mountDocument(doc) {
  if (isTextKind(doc.kind)) {
    if (doc.stale) { doc.stale = false; const text = editor.text(doc); const saved = doc.savedDoc; doc.text = text; await createDocState(doc); doc.savedDoc = saved; delete doc.text; }
    editor.show(doc, state.settings, isDark());
    preview.clear();
    wysiwyg.clear();
    if (doc.path && !doc.web) native.allowDirectory(dirName(doc.path));
    return;
  }
  editor.doc = editor.doc === doc ? null : editor.doc;
  hexHost.hidden = doc.kind !== 'hex';
  viewerHost.hidden = doc.kind === 'hex';
  viewerHandle = null;
  if (doc.kind === 'hex') { hexEditor.show(doc); return; }
  if (doc.guide) {
    viewerHandle = showGuide(viewerHost, {
      text: (language) => helpText('guide', language),
      settings: () => ({ ...state.settings, guideLanguage: state.settings.guideLanguage || lang() }),
      update: (patch) => { state.settings = { ...state.settings, ...patch }; storeSettings(store, state.settings); },
      dark: () => isDark(),
      openLink: (href) => followLink(href),
    });
    return;
  }
  viewerHandle = showViewer(viewerHost, doc, {
    notify,
    status: () => {},
    menu: (anchor, items) => showMenu(items, anchor),
    copyImage: (blob) => copyImageBlob(blob),
    save: (name, blob) => saveBlob(doc, name, blob),
  });
}

function onDocChanged(doc) {
  refreshTabState(doc);
  renderStatus();
  renderToolbarState();
  schedulePreview();
  scheduleOutline();
  scheduleProblems();
  scheduleInfo();
  saveSessionSoon();
  if (modeFor(doc) === 'wysiwyg' && !applyingWysiwyg) scheduleWysiwyg(doc);
}

let outlineTimer = 0;
function scheduleOutline() {
  clearTimeout(outlineTimer);
  outlineTimer = setTimeout(() => { if (state.settings.leftTab === 'outline' || state.settings.leftTab === 'documents') renderLeftPanel(); }, 300);
}

async function newDocument(kind, text = '', name = null) {
  const doc = makeDoc({ name: name ?? untitledName(kind, state.docs.map((d) => d.name), t('doc.untitled')), kind, text, eol: desktop && /Win/i.test(navigator.platform) ? 'crlf' : 'lf' });
  await addDocument(doc);
  if (text) { markUnsaved(doc); refreshTabState(doc); renderStatus(); }
  log('info', t('notice.newFrom', { name: doc.name }));
  return doc;
}

async function newFromTemplate(id) {
  const template = templateById(id);
  if (!template) return;
  const kind = template.kind;
  const text = templateText(template, lang());
  const name = ['markdown', 'html', 'text'].includes(id) ? null : `${t(`templateName.${id}`, null, template[lang()][0])}.${defaultExt(kind)}`;
  await newDocument(kind, text, name && !state.docs.some((d) => d.name === name) ? name : null);
  notify('success', t('notice.newFrom', { name: template[lang()][0] }));
}

async function openSample(id) {
  const sample = sampleById(id);
  if (!sample) return;
  const existing = state.docs.find((doc) => doc.sample === id);
  if (existing) return activate(existing);
  const doc = makeDoc({ name: sample.file, kind: kindOf(sample.file), text: sample.text });
  doc.sample = id;
  await addDocument(doc);
  notify('info', t('notice.sample', { name: sample[lang()][0] }));
  return doc;
}

async function pasteAsNew() {
  const text = await readClipboard();
  if (!text) { notify('info', t('notice.clipboardEmpty')); return; }
  const kind = /^\s*<(!doctype|html|body|div|p|h\d|table|section)\b/i.test(text) ? 'html' : /^\s{0,3}(#{1,6}\s|[-*+]\s|>\s|```)/m.test(text) ? 'markdown' : 'text';
  await newDocument(kind, text);
}

async function openWithDialog(directory) {
  const files = await native.chooseFiles(fileLabels(), directory);
  for (const file of files) await openFile(file);
}

/** Opens a file ({ path } on the desktop, { handle } / { file } in the browser); an open one is just shown. */
async function openFile(file, { quiet = false, asHex = false } = {}) {
  const kind = asHex ? 'hex' : kindOf(file.path);
  const already = state.docs.find((doc) => doc.path && !doc.web && !file.web && samePath(doc.path, file.path) && (doc.kind === 'hex') === (kind === 'hex'));
  if (already) { activate(already); return already; }
  let doc;
  try {
    if (isViewerKind(kind)) {
      const size = file.file?.size ?? (desktop && !file.web ? (await native.fileDetails(file.path).catch(() => null))?.size : undefined);
      doc = makeDoc({ name: baseName(file.path), path: file.path, kind, web: Boolean(file.web), handle: file.handle ?? null, readOnly: true });
      doc.url = await native.viewUrl(file);
      doc.size = size;
      doc.sizeText = size !== undefined ? formatSize(size) : '';
    } else if (kind === 'hex') {
      const bytes = await native.readBytes(file);
      doc = makeDoc({ name: asHex && isTextKind(kindOf(file.path)) ? `${baseName(file.path)} [HEX]` : baseName(file.path), path: file.path, kind: 'hex', web: Boolean(file.web), handle: file.handle ?? null });
      doc.bytes = bytes;
      doc.hexVersion = 0;
      doc.savedHexVersion = 0;
    } else {
      const data = await native.readFile(file);
      const decoded = decodeText(data.text);
      doc = makeDoc({ name: baseName(file.path), path: file.path, text: decoded.text, encoding: data.encoding, eol: decoded.eol, mtime: data.mtime, web: Boolean(file.web), handle: file.handle ?? null });
    }
  } catch (error) {
    // Not text: the hex editor shows it.
    if (!asHex && /binary|이진/i.test(String(error?.message ?? error))) return openFile(file, { quiet, asHex: true });
    if (!quiet) await showError(error, t('error.open', { name: baseName(file.path) }));
    if (!file.web) { state.recent = removeRecent(state.recent, file.path); storeRecent(store, state.recent); }
    renderAll();
    return null;
  }
  await addDocument(doc);
  remember(doc);
  if (!quiet) notify('success', t('notice.opened', { name: doc.name }));
  return doc;
}

/** The current document (or its file) in the hex editor. */
async function openAsHex(doc) {
  if (!doc) return;
  if (doc.path && !doc.web && desktop && !isDirty(doc)) return openFile({ path: doc.path }, { asHex: true });
  const bytes = isTextKind(doc.kind) ? new TextEncoder().encode(encodeText(editor.text(doc), { eol: doc.eol })) : new Uint8Array(0);
  const hex = makeDoc({ name: `${doc.name} [HEX]`, kind: 'hex' });
  hex.bytes = bytes;
  hex.hexVersion = 0;
  hex.savedHexVersion = 0;
  hex.unsavedHex = true;
  return addDocument(hex);
}

function remember(doc) {
  if (!doc.path) return;
  state.recent = addRecent(state.recent, { path: doc.path, web: doc.web || undefined });
  storeRecent(store, state.recent);
  if (!doc.web && dirName(doc.path)) {
    state.recentDirs = addRecent(state.recentDirs, { path: dirName(doc.path) });
    storeRecentDirs(store, state.recentDirs);
  }
}

async function openRecent(path) {
  const item = state.recent.find((entry) => samePath(entry.path, path));
  if (item?.web || !desktop) { notify('info', t('notice.webRecent')); return openWithDialog(); }
  return openFile({ path });
}

async function reloadDocument(doc, ask) {
  if (!doc?.path || doc.web || !isTextKind(doc.kind)) return;
  if (ask && isDirty(doc)) {
    const answer = await confirmDialog({ title: t('action.reload'), message: t('confirm.reload', { name: doc.name }), yes: t('action.reload'), danger: true, icon: 'reload' });
    if (answer !== 'yes') return;
  }
  const data = await native.readFile({ path: doc.path });
  const decoded = decodeText(data.text);
  editor.setText(doc, decoded.text);
  doc.savedDoc = doc.state.doc;
  doc.encoding = data.encoding;
  doc.eol = decoded.eol;
  doc.mtime = data.mtime;
  state.details.delete(doc.path);
  refreshTabState(doc);
  renderAll();
  notify('success', t('notice.reloaded', { name: doc.name }));
}

/** Saves a document; `as` asks for a new name. Returns true when it was written. */
async function saveDocument(doc, { as = false } = {}) {
  if (!doc || doc.guide) return false;
  if (doc === activeDoc() && inWysiwyg()) wysiwyg.flush();
  if (doc.kind === 'hex') return saveHex(doc, { as });
  if (!isTextKind(doc.kind)) return false;
  const text = encodeText(editor.text(doc), { eol: doc.eol });
  if (desktop) {
    let path = doc.path;
    if (as || !path) {
      path = await native.chooseSavePath(fileLabels(), doc.path ? doc.path : withExt(doc.name, doc.kind), doc.kind);
      if (!path) return false;
    }
    if (!as && doc.mtime && path === doc.path) {
      const stat = await native.fileStat(path).catch(() => null);
      if (stat && stat.mtime > doc.mtime + 1000) {
        const answer = await confirmDialog({ title: t('action.save'), message: t('confirm.overwriteChanged', { name: doc.name }), yes: t('action.overwrite'), danger: true, icon: 'warning' });
        if (answer !== 'yes') return false;
      }
    }
    try {
      const stat = await native.writeFile({ ...doc, path }, text);
      doc.mtime = stat?.mtime ?? Date.now();
    } catch (error) {
      await showError(error, t('error.save', { name: baseName(path) }));
      return false;
    }
    const renamed = path !== doc.path;
    doc.path = path;
    doc.name = baseName(path);
    state.details.delete(path);
    state.explorer.cache.delete(dirName(path));
    if (renamed) {
      const kind = kindOf(path);
      if (isTextKind(kind) && kind !== doc.kind) { doc.kind = kind; await editor.setLanguage(doc); preview.clear(); }
      native.allowDirectory(dirName(path));
    }
  } else {
    if (as) doc.handle = null;
    if (!doc.handle) doc.name = withExt(doc.name, doc.kind);
    let result;
    try { result = await native.writeFile(doc, text); } catch (error) { await showError(error, t('error.save', { name: doc.name })); return false; }
    if (!result) return false;
    doc.web = true;
    if (result.downloaded) notify('info', t('notice.downloaded', { name: doc.name }));
  }
  doc.savedDoc = doc.state.doc;
  doc.sample = null;
  remember(doc);
  refreshTabState(doc);
  renderAll();
  notify('success', t('notice.saved', { name: doc.name }));
  saveSessionSoon();
  return true;
}

async function saveHex(doc, { as }) {
  if (desktop) {
    let path = doc.path && !doc.unsavedHex ? doc.path : null;
    if (as || !path) {
      const { dialog } = { dialog: await import('@tauri-apps/plugin-dialog') };
      path = await dialog.save({ defaultPath: doc.path ?? doc.name.replace(/ \[HEX\]$/, '') });
      if (!path) return false;
    }
    try { await native.writeBytes({ ...doc, path }, doc.bytes); } catch (error) { await showError(error, t('error.save', { name: baseName(path) })); return false; }
    doc.path = path;
    doc.name = baseName(path);
  } else {
    const result = await native.writeBytes(doc, doc.bytes).catch((error) => { showError(error); return null; });
    if (!result) return false;
  }
  doc.savedHexVersion = doc.hexVersion ?? 0;
  doc.unsavedHex = false;
  remember(doc);
  refreshTabState(doc);
  renderAll();
  notify('success', t('notice.saved', { name: doc.name }));
  return true;
}

async function saveAll() {
  for (const doc of [...state.docs]) if (isDirty(doc)) { activate(doc); if (!(await saveDocument(doc))) return false; }
  return true;
}

/** Asks about unsaved changes. Returns true when the document may close. */
async function confirmClose(doc) {
  if (!isDirty(doc)) return true;
  activate(doc);
  const answer = await confirmDialog({
    title: t('confirm.unsavedTitle'), message: t('confirm.unsaved', { name: doc.name }), detail: t('confirm.unsavedDetail'), icon: 'warning',
    yes: t('action.save'), no: t('action.cancel'), extra: { label: t('action.dontSave'), icon: 'trash', danger: true },
  });
  if (answer === 'yes') return saveDocument(doc);
  if (answer === 'extra') doc.discarded = true;
  return answer === 'extra';
}

async function closeDocument(doc) {
  if (!doc || !(await confirmClose(doc))) return false;
  const index = state.docs.indexOf(doc);
  state.docs.splice(index, 1);
  if (editor.doc === doc) editor.doc = null;
  if (doc.url?.startsWith('blob:')) URL.revokeObjectURL(doc.url);
  if (state.activeId === doc.id) {
    viewerHandle?.stop?.();
    const next = state.docs[Math.min(index, state.docs.length - 1)];
    if (next) activate(next); else { state.activeId = null; state.showStart = true; preview.clear(); wysiwyg.clear(); state.problems = []; renderAll(); }
  } else renderAll();
  saveSessionSoon();
  return true;
}

async function closeOthers(keep) { for (const doc of state.docs.filter((d) => d !== keep)) if (!(await closeDocument(doc))) return; activate(keep); }
async function closeRight(doc) { for (const other of state.docs.slice(state.docs.indexOf(doc) + 1)) if (!(await closeDocument(other))) return; }
async function closeAll() { for (const doc of [...state.docs].reverse()) if (!(await closeDocument(doc))) return false; return true; }

async function renameUntitled(doc) {
  const values = await formDialog({ title: t('tabs.rename'), icon: 'edit', fields: [{ id: 'name', label: t('field.name'), icon: 'file', value: doc.name, autofocus: true }] });
  const name = values?.name?.trim();
  if (!name) return;
  doc.name = /\.[^.]+$/.test(name) ? name : `${name}.${defaultExt(doc.kind)}`;
  const kind = kindOf(doc.name);
  if (isTextKind(doc.kind) && isTextKind(kind) && kind !== doc.kind) { doc.kind = kind; await editor.setLanguage(doc); preview.clear(); }
  renderAll();
}

async function setKind(kind) {
  const doc = activeDoc();
  if (!doc || doc.kind === kind || !isTextKind(doc.kind)) return;
  if (inWysiwyg()) wysiwyg.flush();
  doc.kind = kind;
  if (!doc.path || doc.web) doc.name = withExt(doc.name, kind);
  doc.stale = true;
  await mountDocument(doc);
  preview.clear();
  renderAll();
  notify('info', t('notice.kind', { kind: t(`kind.${kind}`) }));
}

async function setSyntax(name) {
  const doc = activeDoc();
  if (!doc || !isTextKind(doc.kind)) return;
  doc.syntax = name;
  await editor.setLanguage(doc);
  renderAll();
  notify('info', t('notice.syntax', { name: name === 'plain' ? t('syntax.plain') : name ?? t('syntax.auto') }));
}

function setEncoding(encoding) {
  const doc = activeDoc();
  if (!doc) return;
  doc.encoding = encoding;
  markUnsaved(doc);
  refreshTabState(doc);
  renderAll();
  notify('info', t('notice.encoding', { name: encodingLabel(encoding) }));
}

function setEol(eol) {
  const doc = activeDoc();
  if (!doc || doc.eol === eol) return;
  doc.eol = eol;
  markUnsaved(doc);
  refreshTabState(doc);
  renderAll();
}

function toggleReadOnly() {
  const doc = activeDoc();
  if (!doc) return;
  doc.readOnly = !doc.readOnly;
  editor.setReadOnly(doc);
  renderAll();
}

/** The user's guide (doc/UsersGuide*.md) in a tab of its own, with text size and language. */
function openGuide() {
  const existing = state.docs.find((doc) => doc.guide);
  if (existing) return activate(existing);
  const doc = makeDoc({ name: t('action.userGuide'), kind: 'guide', readOnly: true });
  doc.guide = true;
  return addDocument(doc);
}

// ───────────────────────── pictures: drop, paste, resolve

/** A URL for a picture path written in a document (relative to its folder on the desktop). */
async function resolveImage(doc, src) {
  if (!src || /^(data:|blob:|https?:)/i.test(src) || !doc?.path || doc.web || !desktop) return src;
  const dir = dirName(doc.path);
  const path = /^([a-zA-Z]:[\\/]|\/)/.test(src) ? src : joinPath(dir, decodeURIComponent(src.split(/[?#]/)[0]));
  await native.allowDirectory(dirName(path));
  return native.fileUrl(path);
}

/** Picture files into the active Markdown / HTML document: copied to images/ next to a saved document, embedded otherwise. */
async function insertImageFiles(files, insert, at) {
  const doc = activeDoc();
  if (!doc || !['markdown', 'html'].includes(doc.kind) || doc.readOnly) return false;
  const docDir = doc.path && !doc.web && desktop ? dirName(doc.path) : '';
  const parts = [];
  for (const file of files) {
    const name = baseName(file.path || 'image.png');
    const alt = name.replace(/\.[^.]+$/, '');
    try {
      let src;
      if (docDir && !file.web) src = await native.copyImage(file.path, docDir);
      else if (docDir) src = await native.writeImage(await native.readBytes(file), name.includes('.') ? name : `${name}.png`, docDir);
      else {
        const bytes = await native.readBytes(file);
        const type = file.file?.type || `image/${(/\.(\w+)$/.exec(name)?.[1] ?? 'png').toLowerCase().replace('jpg', 'jpeg').replace('svg', 'svg+xml')}`;
        src = `data:${type};base64,${native.toBase64(bytes)}`;
        if (!parts.length) notify('info', t('notice.imageEmbedded'));
      }
      parts.push(imageMarkup(doc.kind, src, alt));
    } catch (error) {
      notify('error', `${name}: ${error?.message ?? error}`);
    }
  }
  if (!parts.length) return true;
  if (insert) { for (const p of parts) await insert(p); return true; }
  if (inWysiwyg()) { for (const p of parts) await wysiwyg.insertImage(p); return true; }
  if (at) {
    const pos = editor.view.posAtCoords(at);
    if (pos !== null) editor.view.dispatch({ selection: { anchor: pos } });
  }
  editor.insert(parts.join(doc.kind === 'markdown' ? '\n' : '\n'));
  notify('success', t('notice.imagesInserted', { n: parts.length }));
  return true;
}

async function copyImageBlob(blob) {
  if (!globalThis.ClipboardItem) throw new Error(t('viewer.noClipboard'));
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

async function saveBlob(doc, name, blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (desktop) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({ defaultPath: doc.path && !doc.web ? joinPath(dirName(doc.path), name) : name });
    if (!path) return;
    await native.writeBytes({ path }, bytes);
    state.explorer.cache.delete(dirName(path));
    notify('success', t('notice.saved', { name: baseName(path) }));
  } else native.download(name, bytes, blob.type);
}

// ───────────────────────── session

let sessionTimer = 0;
function saveSessionSoon() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(saveSessionNow, 800);
}

function sessionDocs() {
  return state.docs
    .filter((doc) => !doc.guide && !doc.sample && !(doc.discarded && !doc.path) && (isTextKind(doc.kind) ? true : doc.path && !doc.web))
    .map((doc) => (isTextKind(doc.kind) ? { ...doc, text: editor.text(doc), dirty: isDirty(doc) && !doc.discarded } : { path: doc.path, kind: doc.kind, dirty: false, id: doc.id }));
}

function saveSessionNow() {
  clearTimeout(sessionTimer);
  if (!state.settings.restoreSession) { storeSession(store, { docs: [] }); return; }
  storeSession(store, sessionOf(sessionDocs(), state.activeId));
}

async function restoreSession() {
  const session = loadSession(store);
  if (!session?.docs?.length || !state.settings.restoreSession) return false;
  for (const entry of session.docs) {
    if (entry.dirty || !entry.path) {
      const doc = makeDoc({ name: entry.name ?? untitledName(entry.kind ?? 'text', state.docs.map((d) => d.name), t('doc.untitled')), path: entry.path ?? null, kind: isTextKind(entry.kind) ? entry.kind : 'text', text: entry.text ?? '', eol: entry.eol ?? 'lf' });
      await addDocument(doc);
      if (entry.dirty) {
        markUnsaved(doc);
        const data = entry.path && desktop ? await native.readFile({ path: entry.path }).catch(() => null) : null;
        if (data) { doc.savedDoc = textOf(decodeText(data.text).text); doc.mtime = data.mtime; doc.encoding = data.encoding; }
      }
    } else if (desktop) {
      await openFile({ path: entry.path }, { quiet: true, asHex: entry.kind === 'hex' });
    }
  }
  const active = state.docs[Math.min(session.active ?? 0, state.docs.length - 1)];
  if (active) activate(active);
  return state.docs.length > 0;
}

// ───────────────────────── editing commands

function leaveWysiwyg() {
  if (inWysiwyg()) { wysiwyg.flush(); updateSettings({ viewMode: 'split' }); }
}

function insertText(text) {
  if (inWysiwyg()) wysiwyg.command('text', text); else editor.insert(text);
}

function textTool(fn) {
  leaveWysiwyg();
  editor.transform((text) => { try { return fn(text); } catch (error) { notify('error', String(error?.message ?? error)); return text; } });
}

function format(what) {
  const doc = activeDoc();
  if (!doc) return;
  if (inWysiwyg()) { wysiwyg.command(what); return; }
  const md = doc.kind === 'markdown';
  switch (what) {
    case 'bold': return md ? editor.wrap('**', '**', t('placeholder.bold')) : editor.wrap('<strong>', '</strong>', t('placeholder.bold'));
    case 'italic': return md ? editor.wrap('*', '*', t('placeholder.italic')) : editor.wrap('<em>', '</em>', t('placeholder.italic'));
    case 'strike': return md ? editor.wrap('~~', '~~', t('placeholder.strike')) : editor.wrap('<del>', '</del>', t('placeholder.strike'));
    case 'code': return md ? editor.wrap('`', '`', 'code') : editor.wrap('<code>', '</code>', 'code');
    case 'h1': case 'h2': case 'h3': case 'h4': {
      const level = Number(what[1]);
      return md ? editor.transformLines((text) => text.split('\n').map((line) => tools.setHeading(line, level)).join('\n'))
        : editor.transformLines((text) => `<h${level}>${text.replace(/^\s*<(h[1-6]|p)>|<\/(h[1-6]|p)>\s*$/g, '').trim() || t('placeholder.heading')}</h${level}>`);
    }
    case 'p': return md ? editor.transformLines((text) => text.split('\n').map((line) => tools.setHeading(line, 0)).join('\n'))
      : editor.transformLines((text) => `<p>${text.replace(/^\s*<(h[1-6]|p)>|<\/(h[1-6]|p)>\s*$/g, '').trim()}</p>`);
    case 'ul': return md ? editor.transformLines((text) => tools.togglePrefix(text, '- ')) : editor.transformLines((text) => htmlList('ul', text));
    case 'ol': return md ? editor.transformLines((text) => tools.togglePrefix(text, '1. ')) : editor.transformLines((text) => htmlList('ol', text));
    case 'task': return editor.transformLines((text) => tools.togglePrefix(text, '- [ ] '));
    case 'quote': return md ? editor.transformLines((text) => tools.togglePrefix(text, '> ')) : editor.transformLines((text) => `<blockquote>\n  ${text.trim()}\n</blockquote>`);
    default: return undefined;
  }
}

const htmlList = (tag, text) => `<${tag}>\n${text.split('\n').filter((line) => line.trim()).map((line) => `  <li>${line.trim()}</li>`).join('\n') || '  <li></li>'}\n</${tag}>`;

function linesTool(fn) {
  leaveWysiwyg();
  const { from, to } = editor.selection();
  if (from === to) editor.run('selectAll'); // no selection: the whole document
  editor.transformLines(fn);
}

async function insertLink() {
  const doc = activeDoc();
  const selected = inWysiwyg() ? wysiwyg.selectedText() : editor.selection().text;
  const values = await formDialog({
    title: t('action.link'), icon: 'link', ok: t('action.insert'),
    fields: [
      { id: 'text', label: t('field.linkText'), icon: 'textTool', value: selected || '' },
      { id: 'url', label: t('field.url'), icon: 'globe', value: /^https?:\/\//.test(selected) ? selected : 'https://', autofocus: true },
    ],
  });
  if (!values) return;
  const text = values.text || values.url;
  if (inWysiwyg()) { wysiwyg.command('link', { url: values.url, text }); return; }
  editor.insert(doc.kind === 'markdown' ? `[${text}](${values.url})` : `<a href="${escapeHtml(values.url)}">${escapeHtml(text)}</a>`);
}

async function insertImage() {
  const doc = activeDoc();
  const values = await formDialog({
    title: t('action.image'), icon: 'image', ok: t('action.insert'), note: t('field.imageNote'),
    fields: [
      { id: 'url', label: t('field.imageUrl'), icon: 'image', value: '', placeholder: 'images/picture.png', autofocus: true },
      { id: 'alt', label: t('field.alt'), icon: 'textTool', value: '' },
    ],
  });
  if (!values?.url) return;
  if (inWysiwyg()) { wysiwyg.command('image', values); return; }
  editor.insert(imageMarkup(doc.kind, values.url, values.alt));
}

async function insertTable() {
  const doc = activeDoc();
  const values = await formDialog({
    title: t('action.table'), icon: 'tableInsert', ok: t('action.insert'),
    fields: [
      { id: 'cols', label: t('field.columns'), icon: 'columns', type: 'number', value: 3, min: 1, max: 20, autofocus: true },
      { id: 'rows', label: t('field.rows'), icon: 'table', type: 'number', value: 3, min: 1, max: 100 },
    ],
  });
  if (!values) return;
  const cols = Math.max(1, Math.min(20, values.cols || 3));
  const rows = Math.max(1, Math.min(100, values.rows || 3));
  const header = t('field.column');
  if (inWysiwyg()) { wysiwyg.command('table', { cols, rows, header }); return; }
  editor.insertBlock(doc.kind === 'markdown' ? tools.markdownTable(cols, rows, header) : tools.htmlTable(cols, rows, header), 2);
}

async function insertCodeBlock() {
  const doc = activeDoc();
  const values = await formDialog({
    title: t('action.codeBlock'), icon: 'codeBlock', ok: t('action.insert'),
    fields: [{ id: 'language', label: t('field.language'), icon: 'codeFile', type: 'select', value: 'js', options: [['', t('field.noLanguage')], ['js', 'JavaScript'], ['ts', 'TypeScript'], ['python', 'Python'], ['java', 'Java'], ['c', 'C'], ['cpp', 'C++'], ['csharp', 'C#'], ['rust', 'Rust'], ['go', 'Go'], ['html', 'HTML'], ['css', 'CSS'], ['json', 'JSON'], ['sql', 'SQL'], ['bash', 'Bash'], ['powershell', 'PowerShell'], ['yaml', 'YAML'], ['markdown', 'Markdown']] }],
  });
  if (!values) return;
  if (inWysiwyg()) { wysiwyg.command('codeBlock', values.language); return; }
  const selected = editor.selection().text;
  if (doc.kind === 'markdown') {
    const open = `\`\`\`${values.language}\n`;
    editor.insertBlock(`${open}${selected}\n\`\`\``, open.length + selected.length);
  } else {
    const open = `<pre><code${values.language ? ` class="language-${values.language}"` : ''}>`;
    editor.insertBlock(`${open}${tools.escapeHtmlText(selected)}</code></pre>`, open.length);
  }
}

function insertFootnote() {
  const text = editor.text();
  let n = 1;
  while (text.includes(`[^${n}]`)) n += 1;
  editor.insert(`[^${n}]`);
  const view = editor.view;
  const end = view.state.doc.length;
  const note = `${text.endsWith('\n') ? '' : '\n'}\n[^${n}]: `;
  view.dispatch({ changes: { from: end, insert: note }, selection: { anchor: end + note.length }, scrollIntoView: true });
  editor.focus();
}

function formatHtmlDocument() {
  const indent = state.settings.insertSpaces ? ' '.repeat(state.settings.tabSize) : '\t';
  const { from, to } = editor.selection();
  if (from === to) editor.run('selectAll');
  editor.transformLines((text) => tools.formatHtml(text, indent));
  notify('success', t('notice.formatted'));
}

async function hashDialog() {
  const text = inWysiwyg() ? wysiwyg.selectedText() : editor.selection().text || editor.text();
  const rows = [];
  for (const algorithm of ['SHA-1', 'SHA-256', 'SHA-512']) rows.push([algorithm, await tools.digest(text, algorithm)]);
  await openDialog({
    id: 'hash', title: t('action.hashSelection'), icon: 'hashTool', width: 640,
    body: `<p class="muted">${escapeHtml(t('hash.of', { n: text.length.toLocaleString() }))}</p>${rows.map(([name, value]) => `<div class="hash-row"><b>${name}</b><code>${value}</code><button class="icon-button" data-copy="${value}" title="${escapeHtml(t('action.copy'))}">${icon('copy')}</button></div>`).join('')}`,
    buttons: [{ id: 'ok', label: t('action.ok'), icon: 'check', primary: true }],
    onMount: (box) => box.addEventListener('click', (event) => { const b = event.target.closest('[data-copy]'); if (b) copyText(b.dataset.copy).then(() => notify('success', t('notice.copied'))); }),
  });
}

async function macroRepeatDialog() {
  const values = await formDialog({ title: t('action.macroRepeat'), icon: 'macroRepeat', ok: t('action.run'), fields: [{ id: 'times', label: t('field.times'), icon: 'macroPlay', type: 'number', value: 5, min: 1, max: 10000, autofocus: true }] });
  if (!values) return;
  editor.playMacro(Math.max(1, Math.min(10000, values.times || 1)));
}

async function gotoLineDialog() {
  if (isHex()) {
    const values = await formDialog({ title: t('hex.goto'), icon: 'goTo', ok: t('action.go'), fields: [{ id: 'offset', label: t('hex.offsetField'), icon: 'hexFile', value: '0x0', autofocus: true }] });
    if (!values) return;
    const raw = String(values.offset).trim();
    const offset = /^0x/i.test(raw) || /[a-f]/i.test(raw) ? parseInt(raw.replace(/^0x/i, ''), 16) : Number(raw);
    if (Number.isFinite(offset)) hexEditor.goTo(offset);
    return;
  }
  leaveWysiwyg();
  const info = editor.cursorInfo();
  const values = await formDialog({ title: t('action.gotoLine'), icon: 'goTo', ok: t('action.go'), fields: [{ id: 'line', label: t('field.line', { n: info.lines }), icon: 'lineNumbers', type: 'number', value: info.line, min: 1, max: info.lines, autofocus: true }] });
  if (values?.line) editor.goToLine(values.line);
}

async function findCommand() {
  if (isHex()) {
    const values = await formDialog({ title: t('hex.find'), icon: 'search', ok: t('action.find'), fields: [{ id: 'query', label: t('hex.findField'), icon: 'search', value: '', autofocus: true }, { id: 'asHex', label: t('hex.asHex'), icon: 'hexFile', type: 'checkbox', value: true }] });
    if (values?.query && !hexEditor.find(values.query, values.asHex)) notify('info', t('hex.notFound'));
    return;
  }
  leaveWysiwyg();
  editor.run('find');
}

function setEditorFontSize(size) {
  updateSettings({ editorFontSize: Math.max(9, Math.min(32, Math.round(size))) });
}

function nextMode() {
  const doc = activeDoc();
  const order = doc?.kind === 'markdown' ? ['editor', 'split', 'preview', 'wysiwyg'] : ['editor', 'split', 'preview'];
  return order[(order.indexOf(modeFor(doc)) + 1) % order.length];
}

function setViewMode(mode) {
  if (inWysiwyg() && mode !== 'wysiwyg') wysiwyg.flush();
  updateSettings({ viewMode: mode });
  notify('info', t(`notice.view.${mode}`));
  requestAnimationFrame(() => focusDocument());
}

function toggleFocusMode() {
  state.focusMode = !state.focusMode;
  native.windowCommand('fullscreen');
  if (!desktop) {
    if (state.focusMode) document.documentElement.requestFullscreen?.().catch(() => {}); else if (document.fullscreenElement) document.exitFullscreen?.();
  }
  renderAll();
}

// ───────────────────────── WYSIWYG

let applyingWysiwyg = false;
let wysiwygTimer = 0;

/** A button of the Markdown tag bar: app commands that ask something (link, picture, table, code block), page commands otherwise. */
function applyMdTag(id) {
  const tag = mdTagById(id);
  if (!tag || !inWysiwyg() || activeDoc().readOnly) return;
  if (tag.command) run(tag.command);
  else wysiwyg.command(id);
  requestAnimationFrame(updateTagBar);
}

/** The tag bar shows which elements the caret is in (bold, heading level, list …). */
function updateTagBar() {
  const bar = root.querySelector('.md-tagbar');
  if (!bar || !inWysiwyg()) return;
  const s = wysiwyg.state();
  const on = {
    h1: s.block === 'h1', h2: s.block === 'h2', h3: s.block === 'h3', h4: s.block === 'h4', h5: s.block === 'h5', h6: s.block === 'h6', p: s.block === 'p',
    bold: s.bold, italic: s.italic, boldItalic: s.bold && s.italic, strike: s.strike,
    code: s.inline.includes('code') && s.block !== 'codeBlock', link: s.inline.includes('a'),
    ul: s.list === 'ul' && !s.task, ol: s.list === 'ol', task: s.task, quote: s.block === 'quote', codeBlock: s.block === 'codeBlock',
    kbd: s.inline.includes('kbd'), mark: s.inline.includes('mark'), u: s.inline.includes('u'), sup: s.inline.includes('sup'), sub: s.inline.includes('sub'),
  };
  const readOnly = Boolean(activeDoc()?.readOnly);
  for (const button of bar.querySelectorAll('[data-md-tag]')) {
    const active = Boolean(on[button.dataset.mdTag]);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.disabled = readOnly;
  }
}

async function showWysiwyg(doc, force = false) {
  await wysiwyg.show(doc, editor.text(doc), { force });
  updateTagBar();
}

function scheduleWysiwyg(doc) {
  clearTimeout(wysiwygTimer);
  wysiwygTimer = setTimeout(() => { if (doc === activeDoc() && modeFor(doc) === 'wysiwyg') showWysiwyg(doc); }, 200);
}

/** The Markdown of an edit in the WYSIWYG view into the source (one small change, so undo stays useful). */
function applyWysiwyg(markdown) {
  const doc = activeDoc();
  if (!doc || doc.kind !== 'markdown' || editor.doc !== doc) return;
  const before = editor.text(doc);
  // A page produces Markdown in its own style: the first edit tidies the whole source once.
  const change = minimalChange(before, markdown);
  if (!change) return;
  applyingWysiwyg = true;
  try { editor.view.dispatch({ changes: change, userEvent: 'input.wysiwyg' }); } finally { applyingWysiwyg = false; }
}

// ───────────────────────── clipboard

async function readClipboard() {
  try { return desktop ? await (await import('@tauri-apps/api/core')).invoke('clipboard_read') : await native.clipboardRead(); } catch { return ''; }
}

async function copyText(text, html) {
  if (desktop && !html) return (await import('@tauri-apps/api/core')).invoke('clipboard_write', { text });
  return native.clipboardWrite(text, html);
}

async function clipboardCommand(kind) {
  if (isHex()) { await copyText(toHex(hexEditor.selectedBytes())); notify('success', t('notice.copied')); return; }
  if (inWysiwyg()) { wysiwyg.frameDoc()?.execCommand(kind); return; }
  const { from, to, text } = editor.selection();
  if (kind === 'paste') {
    const clip = await readClipboard();
    if (clip) editor.insert(clip);
    return;
  }
  if (from === to) return;
  await copyText(text);
  if (kind === 'cut') editor.transform(() => '', { select: false });
  else editor.focus();
}

// ───────────────────────── preview

let previewTimer = 0;
function schedulePreview(delay) {
  const doc = activeDoc();
  if (!doc || state.showStart || !isTextKind(doc.kind) || !KINDS[doc.kind].preview) return;
  const mode = modeFor(doc);
  if (mode !== 'split' && mode !== 'preview') return;
  clearTimeout(previewTimer);
  const size = doc.state.doc.length;
  const wait = delay ?? (doc.kind === 'html' ? 450 : size > 200000 ? 500 : 120);
  previewTimer = setTimeout(() => updatePreview(doc), wait);
}

async function updatePreview(doc) {
  if (doc !== activeDoc() || state.showStart) return;
  const fresh = preview.docId !== doc.id;
  await preview.show(doc, editor.text(doc));
  const note = root.querySelector('#preview-pane .pane-note');
  if (note) note.textContent = doc.kind === 'html' ? (state.settings.previewScripts ? t('preview.scriptsOn') : t('preview.scriptsOff')) : t(`previewStyle.${state.settings.previewStyle}`);
  if (fresh) {
    if (doc.kind === 'markdown' && state.settings.syncScroll) syncFromEditor(true);
    else preview.setScrollRatio(doc.previewRatio ?? 0);
  }
  markPreviewLine();
}

function markPreviewLine() {
  const doc = activeDoc();
  if (doc?.kind === 'markdown' && preview?.mode === 'markdown') preview.markLine(editor.cursorInfo().line);
}

// Scroll sync: each side follows the other; a scroll caused by the other side is not echoed back.
let syncSource = null;
let syncRelease = 0;
function lockSync(source) { syncSource = source; clearTimeout(syncRelease); syncRelease = setTimeout(() => { syncSource = null; }, 120); }

function syncFromEditor(force = false) {
  const doc = activeDoc();
  if (!doc || !isTextKind(doc.kind) || modeFor(doc) !== 'split' || (!state.settings.syncScroll && !force) || syncSource === 'preview') return;
  lockSync('editor');
  if (doc.kind === 'markdown') {
    const { line, fraction } = editor.topLine();
    if (!preview.scrollToLine(line + fraction)) preview.setScrollRatio(editor.scrollRatio());
  } else preview.setScrollRatio(editor.scrollRatio());
}

function syncFromPreview() {
  const doc = activeDoc();
  if (!doc || modeFor(doc) !== 'split' || !state.settings.syncScroll || syncSource === 'editor') return;
  lockSync('preview');
  const line = doc.kind === 'markdown' ? preview.topLine() : null;
  if (line !== null) editor.scrollToLine(Math.floor(line), line - Math.floor(line)); else editor.setScrollRatio(preview.scrollRatio());
}

async function followLink(href) {
  if (/^(https?:|mailto:)/i.test(href)) return native.openExternal(href).catch(showError);
  const doc = activeDoc();
  if (!doc?.path || doc.web || !desktop) return notify('info', t('notice.linkWeb'));
  const [rel] = href.split('#');
  const target = joinPath(dirName(doc.path), decodeURIComponent(rel));
  const [exists] = await native.pathsExist([target]);
  if (!exists) return notify('error', t('notice.linkMissing', { name: rel }));
  return openFile({ path: target });
}

// ───────────────────────── export & print

function exportedHtml(doc) {
  const text = editor.text(doc);
  if (doc.kind === 'html') return text;
  return standaloneHtml(text, { title: titleOf('markdown', text, doc.name.replace(/\.[^.]+$/, '')), style: state.settings.previewStyle, lang: lang() });
}

async function exportHtml() {
  const doc = activeDoc();
  if (inWysiwyg()) wysiwyg.flush();
  const name = `${doc.name.replace(/\.[^.]+$/, '')}.html`;
  const path = await native.exportFile(fileLabels(), doc.path && !doc.web ? joinPath(dirName(doc.path), name) : name, 'html', exportedHtml(doc));
  if (path) notify('success', t('notice.exported', { name: baseName(path) }));
}

async function copyHtml() {
  const doc = activeDoc();
  const html = DOMPurify.sanitize(markdownToHtml(editor.text(doc), { lines: false }));
  await copyText(html, html);
  notify('success', t('notice.htmlCopied'));
}

/** Prints through a hidden frame: Markdown and HTML as in the preview, text in a fixed-width font, a picture alone. */
async function printDocument() {
  const doc = activeDoc();
  let page;
  if (doc.kind === 'image') page = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(doc.name)}</title><style>body{margin:0;display:grid;place-items:center}img{max-width:100%;max-height:100vh}</style></head><body><img src="${escapeHtml(doc.url)}"></body></html>`;
  else {
    if (inWysiwyg()) wysiwyg.flush();
    const text = editor.text(doc);
    page = doc.kind === 'markdown' ? exportedHtml(doc) : doc.kind === 'html' ? DOMPurify.sanitize(text, { WHOLE_DOCUMENT: true, ADD_TAGS: ['style', 'link'] }) : textPage(text, { title: doc.name, lang: lang(), font: state.settings.editorFont });
  }
  const frame = document.createElement('iframe');
  frame.className = 'print-frame';
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.setAttribute('aria-hidden', 'true');
  document.body.appendChild(frame);
  await new Promise((resolve) => { frame.addEventListener('load', resolve, { once: true }); frame.srcdoc = page; });
  if (doc.path && !doc.web && frame.contentDocument && isTextKind(doc.kind)) await preview.fixUrls(frame.contentDocument, doc);
  await new Promise((resolve) => setTimeout(resolve, 200));
  try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (error) { showError(error); }
  setTimeout(() => frame.remove(), 60000);
}

// ───────────────────────── start page

function renderStartPage() {
  const host = root.querySelector('#start-page');
  const scrollTop = host.querySelector('.start-scroll')?.scrollTop ?? 0;
  startCards?.destroy();
  host.innerHTML = startPageHtml(appApi);
  startCards = startBoard(host.querySelector('.start-board'), {
    saved: state.settings.startLayout,
    reduced: Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    onSave: (layout) => { state.settings.startLayout = layout; storeSettings(store, state.settings); },
  });
  host.querySelector('.start-scroll').scrollTop = scrollTop;
  const canvas = host.querySelector('.start-bg');
  startBackground?.destroy();
  startBackground = new AnimatedBackground(canvas, { colors: backgroundColors, speed: () => state.settings.animationSpeed / 100, kind: state.settings.animation, vivid: true });
  if (state.settings.backgroundKind === 'animated') startBackground.start(); else startBackground.draw();
  scheduleBackgroundRotation();
}

function stopStartPage() {
  startBackground?.destroy();
  startBackground = null;
  startCards?.destroy();
  startCards = null;
  const host = root.querySelector('#start-page');
  if (host && host.innerHTML) host.innerHTML = '';
  clearTimeout(rotateTimer);
}

function backgroundColors() {
  const theme = resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme);
  return { bg: theme.colors.bg, accent: theme.colors.accent, text: theme.colors.text, dark: theme.dark, danger: '#e5484d' };
}

let rotateTimer = 0;
function scheduleBackgroundRotation() {
  clearTimeout(rotateTimer);
  const seconds = state.settings.animationInterval;
  if (!seconds || state.settings.backgroundKind !== 'animated') return;
  rotateTimer = setTimeout(() => {
    if (!startBackground) return;
    const kind = state.settings.animationRandom ? ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)] : ANIMATIONS[(ANIMATIONS.indexOf(state.settings.animation) + 1) % ANIMATIONS.length];
    updateSettings({ animation: kind }, { quiet: true });
  }, seconds * 1000);
}

function showStartPage(show = true) {
  if (!show && !state.docs.length) return;
  const current = activeDoc();
  if (current && editor.doc === current) { if (inWysiwyg()) wysiwyg.flush(); current.previewRatio = preview.scrollRatio(); }
  viewerHandle?.stop?.();
  state.showStart = show;
  if (!show) mountDocument(activeDoc());
  renderAll();
}

async function onStartAction(target) {
  const value = target.dataset.value;
  switch (target.dataset.start) {
    case 'open': return openWithDialog();
    case 'open-folder-explorer': return chooseExplorerRoot();
    case 'new-markdown': return newDocument('markdown');
    case 'new-html': return newFromTemplate('html');
    case 'new-text': return newDocument('text');
    case 'paste-new': return pasteAsNew();
    case 'template': return newFromTemplate(value);
    case 'sample': return openSample(value);
    case 'open-recent': return openRecent(value);
    case 'remove-recent': state.recent = removeRecent(state.recent, value); storeRecent(store, state.recent); return renderStartPage();
    case 'clear-recent': state.recent = []; storeRecent(store, []); notify('success', t('notice.recentCleared')); return renderStartPage();
    case 'open-folder': return setExplorerRoot(value);
    case 'remove-folder': state.recentDirs = removeRecent(state.recentDirs, value); storeRecentDirs(store, state.recentDirs); return renderStartPage();
    case 'clear-folders': state.recentDirs = []; storeRecentDirs(store, []); return renderStartPage();
    case 'arrange': return startCards?.arrange();
    case 'back': return showStartPage(false);
    case 'pick-theme': return updateSettings({ theme: value });
    case 'theme-settings': return openSettings(appApi, 'appearance');
    case 'start-settings': return openSettings(appApi, 'start');
    case 'settings': return run('settings');
    case 'language': return run('language');
    case 'about': return run('about');
    case 'exit': return run('exit');
    case 'shortcuts': return run('shortcuts');
    case 'help-menu': return showMenu(menus().help, target);
    case 'guide': return openGuide();
    case 'animation': updateSettings({ animation: value, backgroundKind: 'animated' }, { quiet: true }); return notify('info', t('notice.animation', { name: t(`animation.${value}`) }));
    case 'shuffle': {
      const others = ANIMATIONS.filter((kind) => kind !== state.settings.animation);
      const kind = others[Math.floor(Math.random() * others.length)];
      updateSettings({ animation: kind, backgroundKind: 'animated' }, { quiet: true });
      return notify('info', t('notice.animation', { name: t(`animation.${kind}`) }));
    }
    case 'still': return updateSettings({ backgroundKind: state.settings.backgroundKind === 'animated' ? 'static' : 'animated' });
    default: return undefined;
  }
}

// ───────────────────────── exit

async function requestExit() {
  for (const doc of [...state.docs]) if (isDirty(doc) && !(await confirmClose(doc))) return false;
  saveSessionNow();
  await native.quitApp();
  return true;
}

// ───────────────────────── spelling (editor context menu, user dictionary)

function addToDictionary(words) {
  state.userWords = addWords(state.userWords, words);
  storeUserDictionary(store, state.userWords);
  setUserWords(state.userWords);
  notify('success', t('notice.dictionaryAdded', { word: words.join(', ') }));
  scheduleProblems(800);
}

function setUserDictionary(words) {
  state.userWords = addWords([], words);
  storeUserDictionary(store, state.userWords);
  setUserWords(state.userWords);
  scheduleProblems(800);
}

async function editorContextMenu(event) {
  const view = editor.view;
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  const wrong = pos !== null && state.settings.spellCheck ? misspelledAt(view, pos) : null;
  const items = [];
  if (wrong) {
    const suggestions = await suggest(wrong.word).catch(() => []);
    items.push({ label: t('spell.word', { word: wrong.word }), icon: 'spellCheck', disabled: true });
    for (const s of suggestions.slice(0, 6)) items.push({ label: s, icon: 'check', run: () => { view.dispatch({ changes: { from: wrong.from, to: wrong.to, insert: s } }); editor.focus(); } });
    if (!suggestions.length) items.push({ label: t('spell.noSuggestions'), icon: 'info', disabled: true });
    items.push({ label: t('spell.addToDictionary'), icon: 'dictionaryAdd', run: () => addToDictionary([wrong.word]) }, 'sep');
  }
  showMenu([...items, ...menuItems(['undo', 'redo', 'sep', 'cut', 'copy', 'paste', 'selectAll', 'sep', 'find', 'replace', 'bookmarkToggle', 'sep', 'bold', 'italic', 'link']),
    { label: t('submenu.case'), icon: 'caseUpper', items: menuItems(['upper', 'lower', 'titleCase']) },
    { label: t('submenu.encode'), icon: 'encodeTool', items: menuItems(['base64Encode', 'base64Decode', 'urlEncode', 'urlDecode', 'escapeHtml', 'unescapeHtml']) },
  ], { left: event.clientX, top: event.clientY });
}

// ───────────────────────── events

const SHORTCUTS = Object.entries(commands).filter(([, c]) => c.key && !/^(Ctrl\+[ZYXCVA]|Alt\+F4|Shift\+Alt\+↓|Ctrl\+\/|Ctrl\+\]|Ctrl\+\[)$/.test(c.key)).map(([id, c]) => [id, c.key]);

function keyOf(event) {
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.shiftKey) parts.push('Shift');
  if (event.altKey) parts.push('Alt');
  let key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (event.code?.startsWith('Digit')) key = event.code.slice(5);
  if (key === '+') key = '=';
  if (key === '_') key = '-';
  if (key === '|') key = '\\';
  if (key === '~') key = '`';
  if (key === ')') key = '0';
  parts.push(key);
  return parts.join('+');
}

function matches(commandKey, key) {
  if (commandKey === key) return true;
  const norm = (k) => k.split('+').sort().join('+');
  return norm(commandKey) === norm(key) || (commandKey === 'Ctrl+=' && key === 'Ctrl+Shift+=');
}

function handleShortcut(event) {
  if (event.isComposing || dialogOpen()) return false;
  const key = keyOf(event);
  if (key === 'Ctrl+Tab' || key === 'Ctrl+Shift+Tab') {
    if (state.docs.length > 1) {
      const index = state.docs.indexOf(activeDoc());
      activate(state.docs[(index + (event.shiftKey ? -1 : 1) + state.docs.length) % state.docs.length]);
    }
    event.preventDefault();
    return true;
  }
  // In WYSIWYG the page's own undo, redo and select all.
  if (inWysiwyg() && /^Ctrl\+(Z|Y|A|Shift\+Z)$/.test(key)) return false;
  const hit = SHORTCUTS.find(([, k]) => matches(k, key));
  if (!hit) return false;
  const [id] = hit;
  if (!commandEnabled(id)) { if (['bold', 'italic', 'link'].includes(id)) { event.preventDefault(); return true; } return false; }
  event.preventDefault();
  run(id);
  return true;
}

function wireEvents() {
  root.addEventListener('click', (event) => {
    const target = event.target;
    const start = target.closest('[data-start]');
    if (start && root.querySelector('#start-page').contains(start)) { onStartAction(start).catch(showError); return; }
    const tabClose = target.closest('[data-tab-close]');
    if (tabClose) { event.stopPropagation(); closeDocument(state.docs.find((doc) => doc.id === Number(tabClose.dataset.tabClose))); return; }
    const tab = target.closest('[data-tab]');
    if (tab) { activate(state.docs.find((doc) => doc.id === Number(tab.dataset.tab))); return; }
    if (target.closest('[data-tab-add]')) { run('new'); return; }
    const scroll = target.closest('[data-tab-scroll]');
    if (scroll) { const strip = root.querySelector('.tab-strip'); strip.scrollBy({ left: Number(scroll.dataset.tabScroll) * Math.max(160, strip.clientWidth * 0.6) }); setTimeout(updateTabNav, 50); return; }
    const menu = target.closest('[data-menu]');
    if (menu) { if (menuKey() === menu.dataset.menu) closeMenu(); else openMenubarMenu(menu.dataset.menu); return; }
    // panels
    const panelTab = target.closest('[data-panel-tab]') ?? target.closest('[data-panel-open]');
    if (panelTab) { const [side, tabId] = (panelTab.dataset.panelTab ?? panelTab.dataset.panelOpen).split(':'); openPanelTab(side, tabId); return; }
    const collapse = target.closest('[data-panel-collapse]');
    if (collapse) { updateSettings({ [`${collapse.dataset.panelCollapse}Open`]: false }); return; }
    const expand = target.closest('[data-panel-expand]');
    if (expand) { updateSettings({ [`${expand.dataset.panelExpand}Open`]: true }); return; }
    const place = target.closest('[data-explorer-root]');
    if (place) { setExplorerRoot(place.dataset.explorerRoot); return; }
    const ex = target.closest('[data-explorer]');
    if (ex) { explorerAction(ex.dataset.explorer); return; }
    const dir = target.closest('[data-tree-dir]');
    if (dir) { const path = dir.dataset.treeDir; if (state.explorer.expanded.has(path)) state.explorer.expanded.delete(path); else state.explorer.expanded.add(path); renderLeftPanel(); return; }
    const file = target.closest('[data-tree-file]');
    if (file) { openFile({ path: file.dataset.treeFile }); return; }
    const info = target.closest('[data-info]');
    if (info) { if (info.dataset.info === 'hashes') computeHashes(); else copyAllInfo(); return; }
    const copy = target.closest('[data-copy]');
    if (copy) { copyText(copy.dataset.copy).then(() => notify('success', t('notice.copied'))); return; }
    const hit = target.closest('[data-search-hit]');
    if (hit) { openAt(hit.dataset.searchHit, Number(hit.dataset.line), Number(hit.dataset.col)); return; }
    if (target.closest('[data-search="chooseDir"]')) { native.chooseFolder(state.search.dir || state.explorer.root).then((d) => { if (d) { state.search.dir = d; renderRightPanel(); } }); return; }
    const mdTag = target.closest('[data-md-tag]');
    if (mdTag) { applyMdTag(mdTag.dataset.mdTag); return; }
    const gotoLine = target.closest('[data-goto-line]');
    if (gotoLine) { leaveWysiwyg(); editor.goToLine(Number(gotoLine.dataset.gotoLine), Number(gotoLine.dataset.gotoCol) || 1); return; }
    if (target.closest('[data-log="clear"]')) { state.log = []; renderBottomPanel(); return; }
    const command = target.closest('[data-command]');
    if (command) { run(command.dataset.command, command); return; }
    const status = target.closest('[data-status]');
    if (status) { statusMenu(status.dataset.status, status); return; }
    const outline = target.closest('[data-outline-line]');
    if (outline) {
      if (inWysiwyg()) wysiwyg.scrollToHeading(Number(outline.dataset.outlineIndex));
      else { editor.goToLine(Number(outline.dataset.outlineLine)); syncFromEditor(true); }
      return;
    }
    const win = target.closest('[data-window]');
    if (win) { if (win.dataset.window === 'close') requestExit(); else native.windowCommand(win.dataset.window); }
  });
  root.addEventListener('submit', (event) => {
    if (event.target.matches('[data-search-form]')) { event.preventDefault(); runSearch(event.target); }
  });
  root.addEventListener('pointerover', (event) => {
    const menu = event.target.closest?.('[data-menu]');
    if (menu && menuOpen() && menuKey() && menuKey() !== menu.dataset.menu) openMenubarMenu(menu.dataset.menu);
  });
  root.addEventListener('auxclick', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab && event.button === 1) closeDocument(state.docs.find((doc) => doc.id === Number(tab.dataset.tab)));
  });
  root.addEventListener('contextmenu', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) { event.preventDefault(); tabMenu(state.docs.find((doc) => doc.id === Number(tab.dataset.tab)), { left: event.clientX, top: event.clientY }); return; }
    const file = event.target.closest('[data-tree-file]');
    if (file) {
      event.preventDefault();
      const path = file.dataset.treeFile;
      showMenu([
        { label: t('action.open'), icon: 'folderOpen', run: () => openFile({ path }) },
        { label: t('action.openAsHex'), icon: 'openAsHex', run: () => openFile({ path }, { asHex: true }) },
        { label: t('action.openInBrowser'), icon: 'browser', run: () => native.openExternal(path).catch(showError) },
        'sep',
        { label: t('tabs.copyPath'), icon: 'copy', run: () => copyText(path).then(() => notify('success', t('notice.copied'))) },
        { label: t('action.findInFiles'), icon: 'findInFiles', run: () => { state.search.dir = dirName(path); openFindInFiles(); } },
      ], { left: event.clientX, top: event.clientY });
      return;
    }
    if (event.target.closest('#editor-host')) { event.preventDefault(); editorContextMenu(event); return; }
    if (!event.target.closest('input, textarea')) event.preventDefault();
  });
  root.addEventListener('dblclick', (event) => {
    if (event.target.closest('[data-window-drag]')) native.windowCommand('maximize');
    else if (event.target.closest('.tab-strip') && !event.target.closest('[data-tab]')) run('new');
  });
  // The tag bar's buttons do not take the focus: the selection in the WYSIWYG page stays where it is.
  root.addEventListener('mousedown', (event) => { if (event.target.closest('.md-tag')) event.preventDefault(); });
  root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('[data-window-drag]') && desktop) { native.windowDrag(); return; }
    if (event.target.closest('[data-resize-grip]')) { event.preventDefault(); native.windowDrag('SouthEast'); return; }
    const split = event.target.closest('.splitter[data-split]');
    if (split) startSplit(event, split.dataset.split);
  });
  root.addEventListener('change', (event) => {
    const el = event.target;
    if (el.matches('[data-start-toggle]')) updateSettings({ showStartPage: el.checked });
    else if (el.matches('[data-start-random]')) updateSettings({ animationRandom: el.checked });
    else if (el.matches('[data-start-interval]')) updateSettings({ animationInterval: Number(el.value) });
    else if (el.id === 'font-size-value') setEditorFontSize(parseInt(el.value, 10) || state.settings.editorFontSize);
  });
  root.addEventListener('input', (event) => {
    const el = event.target;
    if (el.matches('[data-start-speed]')) { state.settings.animationSpeed = Number(el.value); el.nextElementSibling.textContent = `${el.value}%`; storeSettings(store, state.settings); }
    else if (el.matches('[data-start-opacity]')) { state.settings.startCardOpacity = Number(el.value); el.nextElementSibling.textContent = `${el.value}%`; root.querySelector('.start-inner')?.style.setProperty('--start-card-alpha', `${el.value}%`); storeSettings(store, state.settings); }
  });
  root.addEventListener('keydown', (event) => {
    if (event.target.id === 'font-size-value' && event.key === 'Enter') event.target.blur();
  });
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    if (event.key === 'Alt' || event.key === 'F10') return;
    if (event.key === 'Escape' && state.focusMode && !dialogOpen() && !menuOpen()) { toggleFocusMode(); return; }
    if (event.target.closest?.('.cm-editor') || event.target.closest?.('.hex-scroll')) {
      if (event.target.closest?.('.hex-scroll')) handleShortcut(event);
      return;
    }
    handleShortcut(event);
  });
  // Alt alone opens the File menu (like a native menu bar).
  let altAlone = false;
  document.addEventListener('keydown', (event) => { altAlone = event.key === 'Alt' && !event.repeat; if (event.key !== 'Alt') altAlone = false; }, true);
  document.addEventListener('keyup', (event) => {
    if (event.key === 'Alt' && altAlone && !dialogOpen()) { event.preventDefault(); if (menuOpen()) closeMenu(); else openMenubarMenu('file'); }
    altAlone = false;
  });
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (state.settings.theme === 'system') updateSettings({ theme: 'system' }, { quiet: true }); });
  window.addEventListener('resize', () => updateTabNav());
  window.addEventListener('focus', () => checkOutsideChanges());
  setInterval(() => autoSave(), 5000);
  window.addEventListener('beforeunload', () => saveSessionNow());
}

function startSplit(event, which) {
  event.preventDefault();
  const area = root.querySelector('#editor-area');
  const startX = event.clientX;
  const startY = event.clientY;
  const s = state.settings;
  const start = { left: s.outlineWidth, right: s.rightWidth, bottom: s.bottomHeight, preview: s.splitRatio }[which];
  const width = area.getBoundingClientRect().width;
  document.body.classList.add(which === 'bottom' ? 'splitting-v' : 'splitting');
  const move = (e) => {
    if (which === 'left') { s.outlineWidth = Math.max(180, Math.min(560, start + e.clientX - startX)); root.style.setProperty('--outline-width', `${s.outlineWidth}px`); }
    else if (which === 'right') { s.rightWidth = Math.max(200, Math.min(560, start - (e.clientX - startX))); root.style.setProperty('--right-width', `${s.rightWidth}px`); }
    else if (which === 'bottom') { s.bottomHeight = Math.max(90, Math.min(600, start - (e.clientY - startY))); root.style.setProperty('--bottom-height', `${s.bottomHeight}px`); }
    else { s.splitRatio = Math.max(0.15, Math.min(0.85, start + (e.clientX - startX) / width)); area.style.setProperty('--split', String(s.splitRatio)); }
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    document.body.classList.remove('splitting', 'splitting-v');
    storeSettings(store, state.settings);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// ───────────────────────── outside changes, auto save

let checking = false;
async function checkOutsideChanges() {
  if (!desktop || checking) return;
  checking = true;
  try {
    for (const doc of state.docs.filter((d) => d.path && !d.web && d.mtime && isTextKind(d.kind))) {
      const stat = await native.fileStat(doc.path).catch(() => null);
      if (!stat) {
        if (!doc.missingNoticed) { doc.missingNoticed = true; notify('error', t('notice.missing', { name: doc.name })); }
        continue;
      }
      doc.missingNoticed = false;
      if (stat.mtime <= doc.mtime + 1000) continue;
      if (!isDirty(doc)) { await reloadDocument(doc, false); continue; }
      doc.mtime = stat.mtime;
      const answer = await confirmDialog({ title: t('confirm.changedTitle'), message: t('confirm.changed', { name: doc.name }), detail: t('confirm.changedDetail'), yes: t('action.reload'), no: t('action.keepMine'), icon: 'warning' });
      if (answer === 'yes') await reloadDocument(doc, false);
    }
  } finally {
    checking = false;
  }
}

let lastAutoSave = Date.now();
async function autoSave() {
  if (!state.settings.autoSave || !desktop || dialogOpen()) return;
  if (Date.now() - lastAutoSave < state.settings.autoSaveSeconds * 1000) return;
  lastAutoSave = Date.now();
  for (const doc of state.docs) {
    if (!isDirty(doc) || !doc.path || doc.web || doc.readOnly || !isTextKind(doc.kind)) continue;
    try {
      const stat = await native.writeFile(doc, encodeText(editor.text(doc), { eol: doc.eol }));
      doc.mtime = stat?.mtime ?? Date.now();
      doc.savedDoc = doc.state.doc;
      refreshTabState(doc);
      log('success', t('notice.autoSaved', { name: doc.name }));
    } catch (error) {
      notify('error', `${doc.name}: ${error?.message ?? error}`);
    }
  }
  renderStatus();
}

// ───────────────────────── the API the other modules use

const appApi = {
  state,
  desktop,
  version: () => VERSION,
  settings: () => state.settings,
  updateSettings,
  notify,
  run,
  commands,
  commandTip,
  activeDoc,
  isDirty,
  editor: () => editor,
  stats: (doc) => textStats(editor.text(doc)),
  encodingLabel,
  appInfo: () => native.appInfo(),
  showStartPage,
  newDocument,
  openSample,
  openFile,
  loadDir,
  loadDetails,
  docInfo,
  bookmarkLines: bookmarkLinesOfActive,
  userWords: () => state.userWords,
  setUserDictionary,
  addToDictionary,
  root,
};
globalThis.__mytextmaster = appApi; // tests reach the app through this

// ───────────────────────── start

async function boot() {
  applyTheme(resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme));
  renderShell();
  wireEvents();
  if (desktop) {
    state.maximized = await native.isMaximized();
    native.onWindowResized(async () => {
      const maximized = await native.isMaximized();
      if (maximized !== state.maximized) { state.maximized = maximized; renderMenubar(); }
    });
    native.onCloseRequested(() => requestExit().then(() => false));
    if (state.settings.alwaysOnTop) native.setAlwaysOnTop(true).catch(() => {});
    loadPlaces();
  } else {
    const guard = () => false;
    guard.hasUnsaved = () => state.docs.some(isDirty);
    native.onCloseRequested(guard);
  }
  native.onFileDrop(async (files, at) => {
    // Pictures dropped on a Markdown / HTML document go into it; anything else opens.
    const doc = activeDoc();
    const pictures = files.filter((f) => isImageFile(f.path, f.file?.type));
    if (doc && !state.showStart && ['markdown', 'html'].includes(doc.kind) && !doc.readOnly && pictures.length === files.length && files.length) {
      await insertImageFiles(files, null, at);
      return;
    }
    for (const file of files) await openFile(file);
  }, (on) => root.querySelector('.drop-overlay')?.classList.toggle('visible', on));
  const restored = await restoreSession().catch(() => false);
  const startup = await native.startupFiles().catch(() => []);
  for (const path of startup) await openFile({ path });
  if (desktop) {
    const { listen } = await import('@tauri-apps/api/event');
    listen('open-files', async (event) => { for (const path of event.payload ?? []) await openFile({ path }); });
  }
  state.showStart = startup.length ? false : (state.settings.showStartPage || !state.docs.length);
  if (!state.showStart && !activeDoc() && state.docs.length) state.activeId = state.docs[0].id;
  if (!state.showStart && activeDoc()) mountDocument(activeDoc());
  renderAll();
  requestAnimationFrame(() => native.showWindow());
  if (restored) notify('info', t('notice.restored', { n: state.docs.length }));
  log('info', `MyTextMaster v${VERSION} — ${desktop ? t('status.desktop') : t('status.web')}`);
}

boot().catch((error) => {
  console.error(error);
  native.showWindow();
  root.innerHTML = `<pre class="boot-error">${escapeHtml(String(error?.stack ?? error))}</pre>`;
});
