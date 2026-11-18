// MyMarkDownMaker main window: the menu bar (also the title bar), the toolbar, the left panel (Files ·
// Structure · Figures), the centre (Edit · Preview · Split), the right panel (the document's properties:
// cover, pages, fonts, merging), the bottom panel (Problems · Messages · Information) and the status bar.
//
// The shell (menus as popup windows, the toolbar folding into », panels with grips, the start page of
// movable cards over a moving background, settings, themes, progress popups, window memory) is
// MySketchBook's. The document: Markdown files collected from folders and files (doc.files), merged into
// one text (doc.text) with optional heading numbers, a cover, contents and a figure index
// (lib/markdown.js), edited in CodeMirror (editor/editor.js) and exported (lib/export.js).
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import APP_ICON from '../assets/icon-256.png';
import { ANIMATIONS, DOC_ZOOM, EDITOR_FONT, loadSettings, PANEL_MIN, RECENT_DIRS_KEY, RECENT_KEY, SESSION_KEY, STORAGE_KEY, storeSettings } from './domain/settings.js';
import { addRecent, loadRecent, loadRecentDirs, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import { DocHistory, firstDiff } from './domain/dochistory.js';
import { HEADING_EM, HEADING_LEVELS, HEADING_SIZE, COVER_LOGO_HEIGHT, COVER_LOGO_POSITIONS, DOC_FONT_SIZE, LINE_HEIGHT, LOGO_HEIGHT, LOGO_MAX_CHARS, PAGE_NUMBER_POSITIONS, SORT_ORDERS } from './domain/docsettings.js';
import { findProblems, countBySeverity } from './domain/problems.js';
import { SAMPLE_IDS, sampleFiles, sampleGlyph } from './domain/samples.js';
import { baseName } from './domain/paths.js';
import { switchFlag } from './flags.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { PopupHost } from './platform/popups.js';
import { applyFont, applyTheme, customTheme, DARK_THEMES, LIGHT_THEMES, randomThemeId, resolveTheme, SYSTEM, themeName } from './themes.js';
import { escapeHtml, frameThrottle, isMac, keyLabel, pointerDrag } from './ui/dom.js';
import { AnimatedBackground } from './ui/background.js';
import { startPageHtml } from './ui/startpage.js';
import { startBoard } from './ui/startboard.js';
import { STEPS as TUTORIAL_STEPS, Tutorial } from './ui/tutorial.js';
import { bindSteppers, stepperHtml } from './stepper.js';
import { DOC_KINDS, docLabel, docWindowTitle } from './domain/helpdocs.js';
import {
  buildDocument, firstHeadingText, fontStack, getDocumentOutline, getFigures, getOutline, mergeFilesAsync, refreshFrontMatter,
  refreshGenerated, renderPreviewHtml, headingSizeCss, renumberHeadings, setFigureWidth, sortFiles, splitDocument, buildMergedMarkdownDocument, toStandaloneHtml,
} from './lib/markdown.js';
import { computePageMap } from './lib/paginate.js';
import { clearImages, embedImages, imageDisplaySrc, IMAGE_EXTS, registerImage, resolveRelPath, srcBaseName } from './lib/images.js';
import { buildPrintHtml, exportHtml, exportMarkdown, exportPdf, exportWord, markdownWithImageFiles, printDocument, saveMarkdownTo } from './lib/export.js';
import { canWriteInPlace, configurePlatform, presetSavePath, printDirect, printToPdfFile } from './lib/platform.js';
import { withPageCss } from './print/printwin.js';

const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const lang = () => getLanguage();
const history = new DocHistory();
const MD_RE = /\.(md|markdown)$/i;

/** Nothing derived from the text is recomputed while a line is being typed: it catches up when the line is done. */
const SETTLE_LINE_MS = 250;
const SETTLE_IDLE_MS = 1100;
const LINE_DONE_KEYS = new Set(['Enter', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Tab']);

const state = {
  settings: loadSettings(globalThis.localStorage),
  recent: loadRecent(globalThis.localStorage),
  recentDirs: loadRecentDirs(globalThis.localStorage),
  // The open document — null on the start page only. See newDoc().
  doc: null,
  notice: null,
  info: null,
  openMenu: null,
  lastMenuClose: { name: null, at: 0 },
  quitting: false,
  dropActive: false,
  minWidth: 0,
  maximized: false,
  showStart: false,
  activeFigure: -1,
  // The right panel's size control: the body or a heading level (h1 … h5); a click on a heading picks its level.
  sizeTarget: 'body',
  activeHeading: -1,
  busy: '',
  bottomTab: 'problems',
  problems: [],
  log: [],
  toolbarHidden: [],
};

const doc = () => state.doc;
const D = () => state.settings.doc;
const hasDoc = () => Boolean(state.doc) && !state.showStart;
const text = () => (state.doc ? currentText() : '');
const hasText = () => hasDoc() && Boolean(text().trim());
const checkedFiles = () => (state.doc?.files ?? []).filter((f) => f.checked);
const isDirty = () => Boolean(state.doc) && Boolean(state.doc.text.trim()) && state.doc.text !== state.doc.savedText;

let fileSeq = 0;
function newDoc({ files = [], text: body = '', path = null, name = '', edited = false } = {}) {
  return { files, text: body, savedText: path ? body : '', path, edited, stale: false, sourceDir: '', name, mergeSeq: 0, exportName: '', exportNameEdited: false };
}

// ───────────────────────── notices & errors

let noticeTimer = 0;
function notify(kind, message, detail = '') {
  state.notice = { kind, text: message, at: Date.now() };
  state.log.unshift({ kind, text: message, detail, at: new Date() });
  if (state.log.length > 500) state.log.length = 500;
  if (state.bottomTab === 'messages') renderBottom();
  renderStatus();
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { state.notice = null; renderStatus(); }, kind === 'error' ? 12000 : 6000);
}

function formatError(error) {
  const message = native.errorText(error);
  return { message, detail: error?.stack && !String(error.stack).startsWith(message) ? error.stack : error?.stack?.split('\n').slice(1).join('\n') ?? '' };
}

function showError(titleKey, error, context = '') {
  const { message, detail } = formatError(error);
  console.error(titleKey, error);
  notify('error', `${t(titleKey)}: ${message}`, [context, detail].filter(Boolean).join('\n'));
  const info = state.info;
  return popups.open('error', {
    title: t(titleKey), message, detail: detail ?? '', context, time: new Date().toLocaleString(),
    app: info ? `${info.name} ${info.version} (${info.web ? 'web' : `${info.os}/${info.arch}`}, ${info.commit})` : `MyMarkDownMaker ${VERSION}`,
  });
}

window.addEventListener('error', (event) => { if (event.error || event.message) showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''); });
window.addEventListener('unhandledrejection', (event) => showError('error.unexpected', event.reason));

// ───────────────────────── the editor (CodeMirror, loaded when first needed)

let editor = null;
let editorLoading = null;
let settleTimer = 0;
let composing = false;

/** The editor, created on first use (the Edit and Split tabs). */
async function ensureEditor() {
  if (editor) return editor;
  editorLoading ??= import('./editor/editor.js').then(({ createEditor }) => {
    const host = root.querySelector('#editor-host');
    editor = createEditor(host, {
      placeholder: t('editor.placeholder'),
      showPictures: state.settings.showPictures !== false,
      pictures: {
        resolve: (src) => imageDisplaySrc(src),
        gripTip: t('figures.dragResize'),
        onResize: (pos, percent) => resizePictureAt(pos, percent),
        onContext: (event, pos) => contextMenu(event, 'picture', { pos }),
        onDropFiles: (files, pos) => insertPictureFiles(files, pos),
      },
      callbacks: {
        onInput: () => { markEdited(); if (!composing) settleIn(SETTLE_IDLE_MS); },
        onCompositionStart: () => { composing = true; },
        onCompositionEnd: () => { composing = false; settleIn(SETTLE_IDLE_MS); },
        onCaret: () => { syncCaret(); settleIn(SETTLE_LINE_MS); },
        onBlur: () => settleNow(),
        onKeyDown: (event) => editorKeyDown(event),
        onContextMenu: (event) => { event.preventDefault(); contextMenu(event, 'editor'); },
      },
    });
    editor.value = state.doc?.text ?? '';
    applyEditorLook();
    return editor;
  });
  return editorLoading;
}

const editorShown = () => Boolean(editor) && hasDoc() && ['edit', 'split'].includes(state.settings.centerTab);

/** The text at this instant: the editor's while it is shown (it can be a line ahead of doc.text). */
function currentText() {
  if (editorShown()) return editor.value;
  return state.doc?.text ?? '';
}

function settleIn(ms) { clearTimeout(settleTimer); settleTimer = setTimeout(settleNow, ms); }

/** The editor's text becomes the document (one Undo step per burst of typing). */
function settleNow() {
  clearTimeout(settleTimer);
  settleTimer = 0;
  const d = state.doc;
  if (!d || !editor || composing || !editorShown()) return;
  const value = editor.value;
  if (value === d.text) return;
  history.record('typing', snapshot(), { coalesce: true });
  d.text = value;
  textChanged();
}

/** Puts doc.text into the editor (merges, Undo, settings that rewrite the cover…). */
function fillEditor({ reveal = null, keepAnchor = null } = {}) {
  if (!editor || !state.doc) return;
  if (editor.value === state.doc.text) return;
  if (reveal != null) editor.replaceAndReveal(state.doc.text, reveal, reveal);
  else if (keepAnchor) editor.replaceKeepingAnchor(state.doc.text, keepAnchor);
  else editor.replaceKeepingView(state.doc.text);
}

function applyEditorLook() {
  const host = root.querySelector('#editor-host');
  if (!host) return;
  host.style.fontSize = `${(state.settings.editorFontSize * state.settings.docZoom) / 100}px`;
  editor?.measure();
}

function syncCaret() {
  if (!editor || !state.doc) return;
  const pos = editor.selectionStart;
  const figure = derived().figures.find((f) => pos >= f.start && pos <= f.start + f.length);
  const next = figure ? figure.index : -1;
  if (next !== state.activeFigure) { state.activeFigure = next; if (state.settings.leftTab === 'figures') renderLeft(); }
}

// ───────────────────────── derived views of the text (cached per text)

let cache = { text: null };
function derived() {
  const body = state.doc?.text ?? '';
  if (cache.text === body && cache.lang === lang()) return cache;
  cache = {
    text: body, lang: lang(),
    outline: getOutline(body),
    structure: getDocumentOutline(body, { cover: t('structure.cover'), toc: t('export.contents'), figures: t('export.figures') }),
    figures: getFigures(body),
    words: body.trim() ? body.trim().split(/\s+/).length : 0,
  };
  return cache;
}

/** The text changed (typing settled, a merge, an action): everything derived from it catches up. */
function textChanged({ generated = true } = {}) {
  renderLeft();
  renderPreview();
  renderStatus();
  renderTitleProject();
  renderToolbarState();
  scheduleProblems();
  updateExportName();
  if (generated) scheduleGenerated();
  persistSession();
}

function markEdited() {
  const d = state.doc;
  if (!d || d.edited) return;
  d.edited = true;
  queueMicrotask(() => { renderStatus(); renderToolbarState(); });
}

// ───────────────────────── snapshots and Undo / Redo

function snapshot() {
  const d = state.doc;
  return { files: d.files.map((f) => ({ ...f })), text: d.text, edited: d.edited, stale: d.stale };
}

function restore(snap) {
  const d = state.doc;
  const before = currentText();
  d.files = snap.files.map((f) => ({ ...f }));
  d.text = snap.text;
  d.edited = snap.edited;
  d.stale = snap.stale;
  d.mergeSeq += 1;
  fillEditor({ reveal: firstDiff(before, snap.text) });
  textChanged({ generated: false });
  renderToolbarState();
}

function undo() {
  settleNow();
  if (!state.doc) return;
  const step = history.undo(snapshot());
  if (!step) return;
  restore(step.snapshot);
  notify('info', t('notice.undone', { label: t(`op.${step.label}`) }));
}

function redo() {
  settleNow();
  if (!state.doc) return;
  const step = history.redo(snapshot());
  if (!step) return;
  restore(step.snapshot);
  notify('info', t('notice.redone', { label: t(`op.${step.label}`) }));
}
history.onChange(() => renderToolbarState());

/** A change made by a command: recorded as one Undo step, then applied. */
function changeText(label, next, { start = null, end = null, keepAnchor = null } = {}) {
  const d = state.doc;
  if (!d) return;
  settleNow();
  if (next === d.text) return;
  history.record(label, snapshot());
  d.text = next;
  d.edited = true;
  if (editor) {
    if (start != null) editor.replaceKeepingView(next, start, end ?? start);
    else if (keepAnchor) editor.replaceKeepingAnchor(next, keepAnchor);
    else editor.replaceKeepingView(next);
  }
  textChanged();
}

// ───────────────────────── merging

function documentOpts() {
  return { ...D(), contentsLabel: t('export.contents'), figuresLabel: t('export.figures'), figureLabel: t('figure.label'), coverDate: coverDateText(), dateStr: coverDateText() };
}

function coverDateText() {
  const locale = lang() === 'ko' ? 'ko-KR' : 'en-US';
  const raw = String(D().coverDate || '').trim();
  if (!raw) return new Date().toLocaleDateString(locale);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(locale) : raw;
}

/** The file list or the merge options changed: merge again, unless the document was edited by hand. */
function filesChanged() {
  const d = state.doc;
  if (!d) return;
  if (d.edited && d.text.trim()) {
    d.stale = true;
    renderAll();
    return;
  }
  runMerge();
}

/** Builds the document from the ticked files (with a progress popup when it takes a while). */
async function runMerge({ force = false } = {}) {
  const d = state.doc;
  if (!d) return;
  if (force) { d.edited = false; d.stale = false; }
  const chosen = d.files.filter((f) => f.checked);
  const seq = (d.mergeSeq += 1);
  if (!chosen.length) {
    d.text = '';
    d.stale = false;
    fillEditor();
    textChanged({ generated: false });
    renderAll();
    return;
  }
  const work = async (op, report) => {
    let out = await mergeFilesAsync(chosen, { insertFileHeaders: D().insertFileHeaders }, (done, total, name) => report?.({ fraction: done / total, text: name }));
    if (seq !== d.mergeSeq) return;
    if (D().numberHeadings) out = renumberHeadings(out);
    const built = buildDocument(out, documentOpts());
    if (seq !== d.mergeSeq || state.doc !== d) return;
    d.text = built;
    d.edited = false;
    d.stale = false;
    fillEditor();
    textChanged({ generated: false });
    renderAll();
    notify('success', t('status.merged', { count: chosen.length }));
  };
  if (chosen.length > 24) await withProgress('progress.merge', t('progress.files', { count: chosen.length }), work);
  else await work();
}

/** Rebuilds from the sources: the only thing that replaces a document edited by hand. */
async function remerge() {
  const d = state.doc;
  if (!d) return;
  if (d.edited && d.text.trim() && isDirty()) {
    const choice = await ask({ icon: 'remerge', title: t('confirm.remergeTitle'), message: t('confirm.remergeMessage'), buttons: [{ id: 'cancel', label: t('common.cancel') }, { id: 'ok', label: t('action.remerge'), icon: 'remerge', primary: true }] });
    if (choice !== 'ok') return;
  }
  history.record('remerge', snapshot());
  await runMerge({ force: true });
}

/** The contents and figure index follow the headings on their own (a moment after the text settles). */
let generatedTimer = 0;
function scheduleGenerated() {
  clearTimeout(generatedTimer);
  generatedTimer = setTimeout(() => {
    const d = state.doc;
    if (!d || !d.text.trim()) return;
    if (editorShown() && editor.value !== d.text) return;
    const next = refreshGenerated(d.text, documentOpts(), { renumber: false });
    if (next === d.text) return;
    const old = d.text;
    d.text = next;
    if (editorShown()) fillEditor({ keepAnchor: { caret: mapCaretPos(old, next, editor.selectionStart), mapPos: (p) => mapCaretPos(old, next, p) } });
    else fillEditor();
    textChanged({ generated: false });
  }, 600);
}

/** Maps a caret through a rewrite of the generated pages above the body (the body keeps its lines). */
function mapCaretPos(oldText, newText, caret) {
  const oldBody = splitDocument(oldText).body;
  const newBody = splitDocument(newText).body;
  const oldStart = oldText.lastIndexOf(oldBody);
  const newStart = newText.lastIndexOf(newBody);
  if (oldStart < 0 || newStart < 0 || caret < oldStart) return Math.min(caret, newText.length);
  const before = oldBody.slice(0, caret - oldStart);
  const line = before.split('\n').length - 1;
  const col = (caret - oldStart) - (before.lastIndexOf('\n') + 1);
  const oldLines = oldBody.split('\n');
  const newLines = newBody.split('\n');
  if (line >= newLines.length) return newText.length;
  const delta = newLines[line].length - (oldLines[line] || '').length;
  const nc = Math.max(0, Math.min(newLines[line].length, col > 0 ? col + delta : col));
  let pos = newStart;
  for (let i = 0; i < line; i++) pos += newLines[i].length + 1;
  return pos + nc;
}

/** Every heading gets a fresh number; the contents and figure index follow. */
function renumberNow() {
  const d = state.doc;
  if (!d) return;
  settleNow();
  const old = d.text;
  const next = refreshGenerated(old, documentOpts(), { renumber: true });
  if (next === old) { notify('info', t('status.numbered')); return; }
  const caret = editorShown() ? editor.selectionStart : 0;
  changeText('renumber', next, { keepAnchor: { caret: mapCaretPos(old, next, caret), mapPos: (p) => mapCaretPos(old, next, p) } });
  notify('success', t('status.numbered'));
}

/** The cover, contents and figure index after a settings change (cover title, pages on / off, language). */
let frontKey = '';
function frontKeyOf() {
  const s = D();
  return JSON.stringify([s.coverPage, s.coverTitle, s.coverVersion, s.coverAuthor, s.coverDate, s.coverShowVersion, s.coverShowAuthor, s.coverShowDate, s.headerText, s.showHeader, s.tocPage, s.figurePage, lang()]);
}
function refreshFront() {
  const key = frontKeyOf();
  if (key === frontKey) return;
  frontKey = key;
  const d = state.doc;
  if (!d || !d.text.trim()) return;
  settleNow();
  const old = d.text;
  const next = refreshFrontMatter(old, documentOpts());
  if (next === old) return;
  d.text = next;
  if (editorShown()) fillEditor({ keepAnchor: { caret: mapCaretPos(old, next, editor.selectionStart), mapPos: (p) => mapCaretPos(old, next, p) } });
  else fillEditor();
  textChanged();
}

// ───────────────────────── the file list

function addItems(items, { label = 'addFiles' } = {}) {
  const d = state.doc ?? (state.doc = newDoc());
  const seen = new Set(d.files.map((f) => f.key));
  const additions = items.filter((it) => !seen.has(it.key)).map((it) => ({ ...it, id: `f${(fileSeq += 1)}`, checked: true }));
  if (!additions.length) { notify('info', t('status.noneAdded')); return 0; }
  history.record(label, snapshot());
  d.files = D().sortOrder === 'custom' ? [...d.files, ...additions] : sortFiles([...d.files, ...additions], D().sortOrder);
  state.showStart = false;
  notify('success', t('status.added', { count: additions.length }));
  filesChanged();
  renderAll();
  return additions.length;
}

function editFiles(label, mutate, { sortCustom = false } = {}) {
  const d = state.doc;
  if (!d) return;
  history.record(label, snapshot());
  d.files = mutate(d.files.map((f) => ({ ...f })));
  if (sortCustom && D().sortOrder !== 'custom') updateDoc({ sortOrder: 'custom' }, { quiet: true });
  filesChanged();
  renderLeft();
  renderStatus();
  renderToolbarState();
}

const toggleFile = (id) => editFiles('toggleFile', (files) => files.map((f) => (f.id === id ? { ...f, checked: !f.checked } : f)));
const checkAll = (value) => editFiles(value ? 'checkAll' : 'uncheckAll', (files) => files.map((f) => ({ ...f, checked: value })));
const removeFile = (id) => editFiles('removeFile', (files) => files.filter((f) => f.id !== id));
const removeChecked = () => editFiles('removeChecked', (files) => files.filter((f) => !f.checked));
function moveFile(index, dir) {
  const j = index + dir;
  if (j < 0 || j >= (state.doc?.files.length ?? 0)) return;
  editFiles('moveFile', (files) => { [files[index], files[j]] = [files[j], files[index]]; return files; }, { sortCustom: true });
}
function reorderFile(from, to) {
  if (from === to) return;
  editFiles('moveFile', (files) => { const [moved] = files.splice(from, 1); files.splice(to, 0, moved); return files; }, { sortCustom: true });
}
async function clearFiles() {
  const d = state.doc;
  if (!d?.files.length) return;
  editFiles('clearFiles', () => []);
}

/** Pictures the Markdown links to locally become short `mmm-img:` references to embedded data. */
const toImageRef = (uri, src) => (uri ? registerImage(uri, srcBaseName(src)) : null);
/** data: pictures written in the text itself (the samples) become references too, so the Edit tab stays readable. */
const shortenDataImages = (content) => content.replace(/(!\[[^\]]*\]\()\s*(data:image\/[^)\s]+)/g, (m, head, uri) => `${head}${registerImage(uri, '')}`);

async function readSources(list, nameOf, read) {
  const items = [];
  const run = async (op, report) => {
    for (let i = 0; i < list.length; i++) {
      report?.({ fraction: i / list.length, text: nameOf(list[i]) });
      try { items.push(await read(list[i])); } catch (error) { notify('error', `${t('error.readFile')}: ${nameOf(list[i])} — ${native.errorText(error)}`); }
    }
  };
  if (list.length > 6) await withProgress('progress.addFiles', t('progress.files', { count: list.length }), run);
  else await run();
  return items;
}

/** Desktop: one Markdown file from its path, local pictures embedded. */
async function readDesktopFile(info) {
  const raw = await native.readTextFile(info.fullPath, '');
  const content = await embedImages(raw, async (src) => toImageRef(await native.embedImage(info.fullPath, src), src));
  return { key: info.fullPath, name: info.name, relPath: info.relPath, fullPath: info.fullPath, mtime: info.mtime, size: info.size, content };
}

async function addFolderPath(dir) {
  try {
    const scanned = await native.scanMarkdown(dir, D().recursive);
    if (!scanned.length) { notify('warning', t('status.noMarkdown', { dir })); return; }
    const items = await readSources(scanned, (f) => f.relPath, readDesktopFile);
    if (!state.doc) state.doc = newDoc();
    state.doc.sourceDir = dir;
    rememberDir(dir);
    addItems(items, { label: 'addFolder' });
  } catch (error) { showError('error.addFolder', error, dir); }
}

async function addFilePaths(paths) {
  try {
    const infos = await native.fileInfos(paths);
    const items = await readSources(infos, (f) => f.name, readDesktopFile);
    for (const info of infos) rememberFile(info.fullPath, info.name);
    if (infos[0]) updateSettings({ lastDirectory: parentDir(infos[0].fullPath) }, { quiet: true });
    addItems(items);
  } catch (error) { showError('error.addFiles', error); }
}

async function addFolder() {
  editor?.blur();
  if (desktop) {
    const dir = await native.chooseFolder(state.settings.lastDirectory);
    if (dir) await addFolderPath(dir);
    return;
  }
  const all = await pickDirectoryWeb();
  if (all.length) await addWebFiles(all, { folder: true });
}

async function addFiles() {
  editor?.blur();
  if (desktop) {
    const paths = await native.chooseMarkdownFiles(state.settings.lastDirectory);
    if (paths.length) await addFilePaths(paths);
    return;
  }
  const files = await native.pickWithInput('.md,.markdown', true);
  if (files.length) await addWebFiles(files);
}

function pickDirectoryWeb() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.webkitdirectory = true;
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve([...(input.files ?? [])]); input.remove(); });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

const readAsDataUrl = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });

/** Web: File objects (a folder's — with webkitRelativePath — or picked / dropped ones). */
async function addWebFiles(all, { folder = false } = {}) {
  const list = all.filter((f) => MD_RE.test(f.name));
  if (!list.length) { notify('warning', t('status.noMarkdownWeb')); return; }
  const images = new Map();
  for (const f of all) if (IMAGE_EXTS.includes(f.name.split('.').pop().toLowerCase())) images.set(f.webkitRelativePath || f.name, f);
  const items = await readSources(list, (f) => f.webkitRelativePath || f.name, async (f) => {
    const relPath = f.webkitRelativePath || f.name;
    const content = await embedImages(await f.text(), async (src) => { const image = images.get(resolveRelPath(relPath, src)); return image ? toImageRef(await readAsDataUrl(image), src) : null; });
    return { key: `${relPath}:${f.size}:${f.lastModified}`, name: f.name, relPath, fullPath: '', mtime: f.lastModified, size: f.size, content };
  });
  if (folder) {
    const subRecursive = D().recursive;
    const top = list[0]?.webkitRelativePath?.split('/')[0] ?? '';
    const kept = subRecursive ? items : items.filter((it) => it.relPath.split('/').length <= 2);
    if (!state.doc) state.doc = newDoc();
    state.doc.sourceDir = top;
    addItems(kept, { label: 'addFolder' });
    return;
  }
  addItems(items);
}

const parentDir = (path) => String(path).replace(/[\\/][^\\/]*$/, '');

// ───────────────────────── documents: new, open, sample, save, close

async function confirmDiscard() {
  if (!isDirty()) return true;
  const choice = await ask({ icon: 'save', title: t('confirm.unsavedTitle'), message: t('confirm.unsavedMessage'), buttons: [{ id: 'cancel', label: t('common.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('action.save'), icon: 'save', primary: true }] });
  if (choice === 'save') return saveDoc();
  return choice === 'discard';
}

function setDoc(d) {
  if (!state.tutorial?.active) popups.close('welcome');
  settleNow();
  state.doc = d;
  state.showStart = !d;
  state.activeFigure = -1;
  history.clear();
  if (editor && d) editor.replaceKeepingView(d.text, 0, 0);
  cache = { text: null };
  frontKey = frontKeyOf();
  renderAll();
  textChanged({ generated: false });
}

async function newDocument() {
  if (!(await confirmDiscard())) return;
  setDoc(newDoc({ name: t('doc.untitled') }));
  await setCenterTab('edit');
  editor?.focus();
}

/** Opens a saved Markdown document to keep editing it (no merging: its text is the document). */
async function openDocument() {
  if (!(await confirmDiscard())) return;
  try {
    if (desktop) {
      const [path] = await native.chooseMarkdownFiles(state.settings.lastDirectory);
      if (!path) return;
      await openDocumentPath(path);
    } else {
      const [file] = await native.pickWithInput('.md,.markdown', false);
      if (!file) return;
      setDoc(newDoc({ text: shortenDataImages(await file.text()), name: file.name, edited: true }));
      state.doc.savedText = state.doc.text;
      renderAll();
    }
  } catch (error) { showError('error.open', error); }
}

async function openDocumentPath(path) {
  const raw = await native.readTextFile(path, '');
  const content = shortenDataImages(await embedImages(raw, async (src) => toImageRef(await native.embedImage(path, src), src)));
  setDoc(newDoc({ text: content, path, name: baseName(path), edited: true }));
  state.doc.savedText = content;
  rememberFile(path, baseName(path));
  updateSettings({ lastDirectory: parentDir(path) }, { quiet: true });
  renderAll();
  notify('success', t('notice.opened', { name: baseName(path) }));
}

/** A sample set (domain/samples.js) as a new document. */
async function openSample(id = 'manual') {
  if (!(await confirmDiscard())) return;
  const files = sampleFiles(id, lang()).map((f) => ({ ...f, content: shortenDataImages(f.content) }));
  setDoc(newDoc({ name: t(`sample.${id}`) }));
  state.doc.sourceDir = t(`sample.${id}`);
  state.doc.files = sortFiles(files.map((f) => ({ ...f, id: `f${(fileSeq += 1)}`, checked: true })), D().sortOrder);
  await runMerge();
  if (!state.settings.showLeftPanel) updateSettings({ showLeftPanel: true });
}

/** Save (Ctrl+S): the document as Markdown; the first save asks where, later ones write the same file. */
let saving = false;
async function saveDoc({ saveAs = false } = {}) {
  const d = state.doc;
  if (!d || saving) return false;
  settleNow();
  if (!d.text.trim()) { notify('info', t('status.nothingToSave')); return false; }
  saving = true;
  renderToolbarState();
  try {
    let path = null;
    if (!saveAs && d.path && canWriteInPlace) path = await saveMarkdownTo(d.text, d.path);
    if (!path) {
      path = await exportMarkdown(d.text, exportName());
      if (!path) return false;
      if (canWriteInPlace) d.path = path;
    }
    d.savedText = d.text;
    history.seal();
    if (desktop) { rememberFile(path, baseName(path)); updateSettings({ lastDirectory: parentDir(path) }, { quiet: true }); }
    notify('success', t('status.saved', { path }));
    renderAll();
    return true;
  } catch (error) {
    showError('error.save', error);
    return false;
  } finally {
    saving = false;
    renderToolbarState();
  }
}

async function closeDocument() {
  if (!state.doc) return true;
  if (!(await confirmDiscard())) return false;
  state.doc = null;
  clearImages();
  history.clear();
  persistSession();
  showStartPage(true);
  return true;
}

// ───────────────────────── export and print

/** The document's name: the cover title, else the cover's own heading, else the first file — unless the user typed one. */
function exportName() {
  const d = state.doc;
  if (!d) return '';
  if (d.exportNameEdited && d.exportName) return d.exportName;
  return d.exportName || 'document';
}
function updateExportName() {
  const d = state.doc;
  if (!d || d.exportNameEdited) return;
  const chosen = (D().coverTitle || '').trim();
  const first = d.files.find((f) => f.checked);
  d.exportName = chosen || firstHeadingText(splitDocument(d.text).cover) || (d.path ? baseName(d.path).replace(MD_RE, '') : '') || (first ? first.name.replace(MD_RE, '') : '') || d.name || '';
}

function exportOpts() {
  const locale = lang() === 'ko' ? 'ko-KR' : 'en-US';
  return { ...documentOpts(), appName: 'MyMarkDownMaker', dateStr: new Date().toLocaleDateString(locale) };
}

const EXPORTS = {
  md: { label: 'export.md', icon: 'markdownFile', run: (body) => exportMarkdown(body, exportName()) },
  html: { label: 'export.html', icon: 'htmlFile', run: (body, o) => exportHtml(body, o, exportName()) },
  pdf: { label: 'export.pdf', icon: 'pdfFile', run: (body, o) => exportPdf(body, o, exportName()) },
  word: { label: 'export.word', icon: 'wordFile', run: (body, o) => exportWord(body, o, exportName()) },
};

async function exportAs(format) {
  const d = state.doc;
  const ex = EXPORTS[format];
  if (!d || !ex) return;
  settleNow();
  if (!d.text.trim()) { notify('info', t('status.nothingToExport')); return; }
  try {
    // Markdown with pictures: embedded in the file, or written as picture files beside it.
    let pictures = 'embed';
    const hasPictures = /mmm-img:\d+|data:image\//.test(d.text);
    if (format === 'md' && hasPictures && desktop) {
      const last = D().mdPictures === 'files' ? 'files' : 'embed';
      pictures = await ask({ icon: 'markdownFile', title: t('export.mdPicturesTitle'), message: t('export.mdPicturesMessage'), buttons: [
        { id: 'cancel', label: t('common.cancel') },
        { id: 'files', label: t('export.mdPicturesFiles'), icon: 'folder', primary: last === 'files' },
        { id: 'embed', label: t('export.mdPicturesEmbed'), icon: 'figures', primary: last === 'embed' },
      ] });
      if (pictures === 'cancel') return;
      updateDoc({ mdPictures: pictures }, { quiet: true });
    }
    // The file is chosen first: the progress window (always on top) must never hide the save dialog.
    let path = null;
    if (desktop) {
      const ext = { md: 'md', html: 'html', pdf: 'pdf', word: 'doc' }[format];
      path = await native.chooseSavePath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}\\` : ''}${exportName() || 'document'}.${ext}`, [ext]);
      if (!path) { notify('info', t('status.exportCancel')); return; }
      updateSettings({ lastDirectory: parentDir(path) }, { quiet: true });
    }
    let saved;
    if (format === 'md' && pictures === 'files') {
      saved = await withProgress('progress.export', t(ex.label), async (op, report) => {
        const stem = baseName(path).replace(/\.[^.]+$/, '');
        const folder = `${stem}_images`;
        const { text: body, files } = markdownWithImageFiles(d.text, folder);
        const dir = `${parentDir(path)}${path.includes('\\') ? '\\' : '/'}${folder}`;
        for (let i = 0; i < files.length; i++) {
          report?.({ fraction: i / (files.length + 1), text: files[i].name });
          await native.writeBase64File(`${dir}${path.includes('\\') ? '\\' : '/'}${files[i].name}`, files[i].data, '');
        }
        await native.writeTextFile(path, body, '');
        return path;
      }, { delay: 300 });
    } else {
      if (path) presetSavePath(path);
      saved = await withProgress('progress.export', t(ex.label), () => ex.run(d.text, exportOpts()), { delay: format === 'md' ? 400 : 0 });
    }
    if (!saved) { notify('info', t('status.exportCancel')); return; }
    if (format === 'md') d.savedText = d.text;
    notify('success', t('status.exported', { path: saved }));
    renderAll();
    if (desktop && /[\\/]/.test(String(saved))) {
      const choice = await ask({ icon: ex.icon, title: t('export.doneTitle'), message: t('export.doneMessage', { format: t(ex.label) }), items: [String(saved)], buttons: [{ id: 'folder', label: t('export.openFolder'), icon: 'openFolder' }, { id: 'open', label: t('export.openFile'), icon: 'openFile' }, { id: 'ok', label: t('common.ok'), icon: 'check', primary: true }] });
      if (choice === 'open') native.openExternal(String(saved)).catch((error) => showError('error.openExternal', error, saved));
      if (choice === 'folder') native.openExternal(parentDir(String(saved))).catch((error) => showError('error.openExternal', error, saved));
    } else if (!desktop && format === 'pdf') notify('info', t('status.pdfWebNote'));
  } catch (error) {
    showError('error.export', error, t(ex.label));
  }
}

let printing = false;
/** Print (Ctrl+P): the print window — page setup, printer, preview and a Print button that prints at once. */
async function printDoc() {
  const d = state.doc;
  if (!d) return;
  settleNow();
  if (!d.text.trim()) { notify('info', t('status.nothingToExport')); return; }
  const result = await popups.open('print', { at: Date.now() });
  if (result?.printed) notify('success', t('status.printSent'));
}

/** The print window asks for the document (again after a page of it was turned on or off). */
let printHtml = '';
async function sendPrintContent() {
  const d = state.doc;
  if (!d) return;
  try {
    printHtml = await buildPrintHtml(d.text, exportOpts(), exportName());
    const printers = await native.listPrinters().catch(() => ({ printers: [], defaultPrinter: '', filePrinters: [] }));
    popups.post('print', { type: 'print-content', html: printHtml, printers });
  } catch (error) { showError('error.print', error); }
}

/** The print window's buttons: straight to the printer, a PDF file, or the system dialog. */
async function runPrint(job) {
  if (printing) return;
  printing = true;
  renderToolbarState();
  const page = printHtml.includes('</head>') ? printHtml.replace('</head>', `${job.css}</head>`) : job.css + printHtml;
  try {
    const printers = await native.listPrinters().catch(() => ({ printers: [], filePrinters: [] }));
    let mode = job.mode;
    if (!desktop) mode = 'dialog';
    else if (mode === 'direct' && (!printers.printers.length || !job.printer)) mode = 'dialog';
    else if (mode === 'direct' && printers.filePrinters.includes(job.printer)) mode = 'pdf';
    if (mode === 'pdf') {
      const path = await native.chooseSavePath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}\\` : ''}${exportName() || 'document'}.pdf`, ['pdf']);
      if (!path) { popups.post('print', { type: 'print-done', ok: false, error: t('status.exportCancel'), keep: true }); return; }
      await printToPdfFile({ html: page, path, widthMm: job.widthMm, heightMm: job.heightMm });
      notify('success', t('status.exported', { path }));
    } else if (mode === 'dialog') {
      await printDocumentHtml(page);
    } else {
      await printDirect({ html: page, printer: job.printer, copies: job.copies, widthMm: job.widthMm, heightMm: job.heightMm, pageRanges: job.pageRanges });
      notify('success', t('status.printedTo', { printer: job.printer }));
    }
    popups.post('print', { type: 'print-done', ok: true });
  } catch (error) {
    popups.post('print', { type: 'print-done', ok: false, error: native.errorText(error), keep: true });
    showError('error.print', error);
  } finally {
    printing = false;
    renderToolbarState();
  }
}

/** The system (or browser) print dialog for a page that already has its setup. */
async function printDocumentHtml(page) {
  const { printDocument: platformPrint } = await import('./lib/platform.js');
  return platformPrint({ html: page });
}

function exportMenu(anchor) {
  const handlers = Object.fromEntries(Object.keys(EXPORTS).map((f) => [`custom:export:${f}`, () => exportAs(f)]));
  handlers['custom:export-name'] = () => renameExport();
  const items = [
    ...Object.entries(EXPORTS).map(([f, ex]) => ({ id: `custom:export:${f}`, label: t(ex.label), icon: ex.icon, disabled: !hasText() })),
    { separator: true },
    { id: 'custom:export-name', label: t('export.nameItem', { name: exportName() }), icon: 'edit', disabled: !hasDoc() },
    ...menuItems(['print', 'save', 'saveAs']),
  ];
  return showMenu(items, anchor ?? anchorFor('exportMenu'), 'context', { handlers, header: { icon: 'exportFile', title: t('action.export') } });
}

async function renameExport() {
  const d = state.doc;
  if (!d) return;
  const result = await popups.open('prompt', { icon: 'edit', title: t('export.nameTitle'), label: t('export.filename'), value: exportName() });
  if (result?.value == null) return;
  const value = result.value.trim();
  d.exportName = value;
  d.exportNameEdited = Boolean(value);
  if (!value) updateExportName();
  renderRight();
}

// ───────────────────────── Markdown marks (Edit tab)

async function editorApply(label, transform) {
  if (!state.doc) return;
  if (!editorShown()) await setCenterTab('edit');
  const ed = await ensureEditor();
  const out = transform({ value: ed.value, start: ed.selectionStart, end: ed.selectionEnd });
  if (!out) return;
  changeText(label, out.text, { start: out.start, end: out.end ?? out.start });
  ed.focus();
}

function lineRange(value, start, end) {
  const from = value.lastIndexOf('\n', start - 1) + 1;
  const nl = value.indexOf('\n', end);
  return [from, nl < 0 ? value.length : nl];
}

const applyHeading = (level) => editorApply('heading', ({ value, start, end }) => {
  const [from, to] = lineRange(value, start, end);
  const next = value.slice(from, to).split('\n').map((line) => {
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    const body = m ? m[2] : line.replace(/^\s+/, '');
    if (m && m[1].length === level) return body;
    return `${'#'.repeat(level)} ${body}`;
  }).join('\n');
  return { text: value.slice(0, from) + next + value.slice(to), start: from, end: from + next.length };
});

const applyWrap = (before, after = before) => editorApply('format', ({ value, start, end }) => {
  const sel = value.slice(start, end);
  if (sel.length >= before.length + after.length && sel.startsWith(before) && sel.endsWith(after)) {
    const inner = sel.slice(before.length, sel.length - after.length);
    return { text: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length };
  }
  return { text: value.slice(0, start) + before + sel + after + value.slice(end), start: start + before.length, end: start + before.length + sel.length };
});

const applyLinePrefix = (prefix, ordered = false) => editorApply('format', ({ value, start, end }) => {
  const [from, to] = lineRange(value, start, end);
  const lines = value.slice(from, to).split('\n');
  const rx = ordered ? /^\d+\.\s+/ : new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  const on = lines.every((l) => rx.test(l));
  const next = lines.map((l, i) => (on ? l.replace(rx, '') : (ordered ? `${i + 1}. ` : prefix) + l)).join('\n');
  return { text: value.slice(0, from) + next + value.slice(to), start: from, end: from + next.length };
});

const insertBlock = (block, select) => editorApply('insert', ({ value, start }) => {
  const lead = start === 0 || value[start - 1] === '\n' ? '' : '\n';
  const next = value.slice(0, start) + lead + block + value.slice(start);
  const base = start + lead.length;
  const at = select ? block.indexOf(select) : -1;
  return at >= 0 ? { text: next, start: base + at, end: base + at + select.length } : { text: next, start: base + block.length };
});

const insertLink = (image) => editorApply('insert', ({ value, start, end }) => {
  const label = value.slice(start, end) || (image ? t('md.imageAlt') : t('md.linkText'));
  const url = 'https://';
  const snippet = `${image ? '!' : ''}[${label}](${url})`;
  const at = start + snippet.length - url.length - 1;
  return { text: value.slice(0, start) + snippet + value.slice(end), start: at, end: at + url.length };
});

/** A picture file from disk (desktop) or the browser, embedded and linked at the caret. */
async function insertImageFile() {
  if (!state.doc) return;
  let uri = null;
  let name = '';
  try {
    if (desktop) {
      const path = await native.chooseImage(state.settings.lastDirectory);
      if (!path) return;
      const ext = path.split('.').pop().toLowerCase();
      const data = await native.readBase64File(path, '');
      uri = `data:${ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`};base64,${data}`;
      name = baseName(path);
    } else {
      const [file] = await native.pickWithInput('image/*', false);
      if (!file) return;
      uri = await readAsDataUrl(file);
      name = file.name;
    }
  } catch (error) { showError('error.insertImage', error); return; }
  const ref = registerImage(uri, name);
  const alt = name.replace(/\.[^.]+$/, '');
  await editorApply('insert', ({ value, start, end }) => {
    const snippet = `![${value.slice(start, end) || alt}](${ref})`;
    return { text: value.slice(0, start) + snippet + value.slice(end), start: start + snippet.length };
  });
}

function editorKeyDown(event) {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod && LINE_DONE_KEYS.has(event.key)) { settleIn(SETTLE_LINE_MS); return; }
  if (!mod || event.altKey) return;
  const k = event.key.toLowerCase();
  if (k === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
  else if (k === 'y' || (k === 'z' && event.shiftKey)) { event.preventDefault(); redo(); }
  else if (k === 'b') { event.preventDefault(); applyWrap('**'); }
  else if (k === 'i') { event.preventDefault(); applyWrap('*'); }
  else if (k === 'k') { event.preventDefault(); insertLink(false); }
  else if (['1', '2', '3', '4', '5'].includes(k) && !event.shiftKey) { event.preventDefault(); applyHeading(Number(k)); }
}

const MARKS = [
  ['h1', 'heading1', () => applyHeading(1)], ['h2', 'heading2', () => applyHeading(2)], ['h3', 'heading3', () => applyHeading(3)], ['h4', 'heading4', () => applyHeading(4)], ['h5', 'heading5', () => applyHeading(5)],
  '-', ['bold', 'bold', () => applyWrap('**')], ['italic', 'italic', () => applyWrap('*')], ['strike', 'strike', () => applyWrap('~~')], ['code', 'inlineCode', () => applyWrap('`')],
  '-', ['list', 'bulletList', () => applyLinePrefix('- ')], ['ordered', 'orderedList', () => applyLinePrefix('', true)], ['task', 'taskList', () => applyLinePrefix('- [ ] ')], ['quote', 'quote', () => applyLinePrefix('> ')],
  '-', ['link', 'insertLink', () => insertLink(false)], ['image', 'insertImage', () => insertImageFile()], ['codeBlock', 'codeBlock', () => insertBlock('```\n\n```\n', '')],
  ['table', 'insertTable', () => insertBlock(t('md.tableTemplate'), t('md.tableTemplate').split('|')[1].trim())], ['rule', 'horizontalRule', () => insertBlock('\n---\n')],
];

// ───────────────────────── pictures: drop in, resize, the picture menu

const MIME_OF = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff', ico: 'image/x-icon', avif: 'image/avif' };
const EXT_OF = Object.fromEntries(Object.entries(MIME_OF).map(([ext, mime]) => [mime, ext === 'jpeg' ? 'jpg' : ext]));
const isPicturePath = (path) => /\.(png|jpe?g|gif|webp|bmp|svg|tiff?|ico|avif)$/i.test(path);

/** Pictures (File objects, or desktop paths) embedded and linked at `pos` of the editor, as one Undo step. */
async function insertPictureFiles(files, pos = null) {
  if (!state.doc || !files.length) return;
  if (!editorShown()) await setCenterTab('edit');
  const ed = await ensureEditor();
  settleNow();
  const snippets = [];
  for (const file of files) {
    try {
      let uri;
      let name;
      if (typeof file === 'string') {
        const ext = file.split('.').pop().toLowerCase();
        uri = `data:${MIME_OF[ext] ?? 'image/png'};base64,${await native.readBase64File(file, '')}`;
        name = baseName(file);
      } else {
        uri = await readAsDataUrl(file);
        name = file.name;
      }
      snippets.push(`![${name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '')}](${registerImage(uri, name)})`);
    } catch (error) { showError('error.insertImage', error, typeof file === 'string' ? file : file.name); }
  }
  if (!snippets.length) return;
  const at = pos ?? ed.selectionStart;
  const value = ed.value;
  const next = value.slice(0, at) + snippets.join(' ') + value.slice(at);
  changeText('insert', next, { start: at + snippets.join(' ').length });
  notify('success', t('figures.inserted', { count: snippets.length }));
}

const figureAtPos = (pos) => getFigures(currentText()).find((f) => pos >= f.start && pos < f.start + f.length) ?? null;

function resizePictureAt(pos, percent) {
  const figure = figureAtPos(pos);
  if (figure) resizeFigure(figure, percent);
}

/** Replaces one picture's Markdown (caption, source) as one Undo step. */
function editPicture(figure, mutate) {
  settleNow();
  const text = currentText();
  const live = getFigures(text).find((f) => f.index === figure.index) ?? figure;
  const old = text.slice(live.start, live.start + live.length);
  const next = mutate(old);
  if (next == null || next === old) return;
  changeText('figureEdit', text.slice(0, live.start) + next + text.slice(live.start + live.length), editorShown() ? { start: live.start + next.length } : {});
}

async function renamePicture(figure) {
  const result = await popups.open('prompt', { icon: 'edit', title: t('figures.captionTitle'), label: t('figures.caption'), value: figure.alt ?? '' });
  if (result?.value == null) return;
  editPicture(figure, (md) => md.replace(/^!\[[^\]]*\]/, `![${result.value.replace(/[[\]]/g, '')}]`));
}

async function replacePicture(figure) {
  let picked = null;
  if (desktop) { const path = await native.chooseImage(state.settings.lastDirectory); if (path) picked = path; }
  else { const [file] = await native.pickWithInput('image/*', false); if (file) picked = file; }
  if (!picked) return;
  try {
    const uri = typeof picked === 'string' ? `data:${MIME_OF[picked.split('.').pop().toLowerCase()] ?? 'image/png'};base64,${await native.readBase64File(picked, '')}` : await readAsDataUrl(picked);
    const ref = registerImage(uri, typeof picked === 'string' ? baseName(picked) : picked.name);
    editPicture(figure, (md) => md.replace(/^(!\[[^\]]*\]\(\s*<?)([^)\s"<>]+)/, (m, head) => `${head}${ref}`));
  } catch (error) { showError('error.insertImage', error); }
}

async function savePictureFile(figure) {
  const uri = imageDisplaySrc(figure.src);
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(uri ?? '');
  if (!m) { notify('warning', t('figures.notEmbedded')); return; }
  const name = `${(figure.caption || `${t('figure.label')}-${figure.index + 1}`).replace(/[\\/:*?"<>|]+/g, '-')}.${EXT_OF[m[1].toLowerCase()] ?? 'png'}`;
  try {
    if (desktop) {
      const ext = name.split('.').pop();
      const path = await native.chooseSavePath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}\\` : ''}${name}`, ['txt']).catch(() => null);
      if (!path) return;
      await native.writeBase64File(/\.[a-z0-9]+$/i.test(path) ? path : `${path}.${ext}`, m[2].replace(/\s+/g, ''), '');
      notify('success', t('status.saved', { path }));
    } else {
      const a = document.createElement('a');
      a.href = uri;
      a.download = name;
      a.click();
    }
  } catch (error) { showError('error.save', error, name); }
}

function deletePicture(figure) { editPicture(figure, () => ''); }

function pictureMenu(anchor, figure) {
  const width = figureWidth(figure);
  const sizes = [25, 50, 75, 100];
  const handlers = {
    'custom:goto': () => gotoFigure(figure),
    'custom:original': () => resizeFigure(figure, 0),
    'custom:caption': () => renamePicture(figure),
    'custom:replace': () => replacePicture(figure),
    'custom:save': () => savePictureFile(figure),
    'custom:copy': () => copyText(currentText().slice(figure.start, figure.start + figure.length)),
    'custom:delete': () => deletePicture(figure),
    'custom:toggle': () => run('pictures'),
  };
  for (const n of sizes) handlers[`custom:size${n}`] = () => resizeFigure(figure, n);
  return showMenu([
    ...sizes.map((n) => ({ id: `custom:size${n}`, label: t('figures.sizePercent', { n }), icon: 'figureSize', checked: width === n })),
    { id: 'custom:original', label: t('figures.sizeFull'), icon: 'zoomReset' },
    { separator: true },
    { id: 'custom:caption', label: t('figures.captionEdit'), icon: 'edit' },
    { id: 'custom:replace', label: t('figures.replace'), icon: 'insertImage' },
    { id: 'custom:save', label: t('figures.saveAs'), icon: 'save' },
    { id: 'custom:copy', label: t('figures.copyMarkdown'), icon: 'copy' },
    { separator: true },
    { id: 'custom:goto', label: t('ctx.goto'), icon: 'goTo' },
    { id: 'custom:toggle', label: t('action.pictures'), icon: 'figures', checked: state.settings.showPictures !== false },
    { separator: true },
    { id: 'custom:delete', label: t('figures.delete'), icon: 'trash', danger: true },
  ], anchor, 'context', { handlers, header: { icon: 'figures', title: `${t('figure.label')} ${figure.index + 1}${figure.caption ? ` · ${figure.caption}` : ''}` } });
}

// ───────────────────────── the logo (headers, footers, the cover)

/** Picks a picture (PNG, GIF, JPG, WEBP, AVIF …) as the document's logo; its size is measured for its proportions. */
async function chooseLogo() {
  try {
    let uri = null;
    let name = '';
    if (desktop) {
      const path = await native.chooseImage(state.settings.lastDirectory);
      if (!path) return;
      const ext = path.split('.').pop().toLowerCase();
      uri = `data:${MIME_OF[ext] ?? 'image/png'};base64,${await native.readBase64File(path, '')}`;
      name = baseName(path);
    } else {
      const [file] = await native.pickWithInput('image/png,image/gif,image/jpeg,image/webp,image/avif,image/bmp,image/svg+xml', false);
      if (!file) return;
      uri = await readAsDataUrl(file);
      name = file.name;
    }
    if (uri.length > LOGO_MAX_CHARS) { notify('warning', t('logo.tooBig')); return; }
    const size = await new Promise((resolve) => { const img = new Image(); img.onload = () => resolve([img.naturalWidth, img.naturalHeight]); img.onerror = () => resolve([0, 0]); img.src = uri; });
    if (!size[0]) { notify('warning', t('logo.unreadable', { name })); return; }
    updateDoc({ logoImage: uri, logoName: name, logoWidth: size[0], logoHeight: size[1] });
    notify('success', t('logo.chosen', { name }));
  } catch (error) { showError('error.insertImage', error); }
}

// ───────────────────────── going to a heading or a picture

function lineStart(value, line) {
  let pos = 0;
  for (let i = 0; i < line; i++) { const nl = value.indexOf('\n', pos); if (nl < 0) return value.length; pos = nl + 1; }
  return pos;
}

/** The right panel's size control follows the heading level the user picked (the preview, the structure tree). */
function selectSizeTarget(level) {
  if (!['h1', 'h2', 'h3', 'h4', 'h5'].includes(level) || state.sizeTarget === level) return;
  state.sizeTarget = level;
  if (!state.settings.showRightPanel) return;
  renderRight();
  root.querySelector('#right-panel [data-size-target]')?.closest('.prop-section')?.classList.add('flash');
  setTimeout(() => root.querySelector('#right-panel .prop-section.flash')?.classList.remove('flash'), 900);
}

async function gotoHeading(item) {
  if (!item.section) selectSizeTarget(`h${Math.min(5, item.level)}`);
  state.activeHeading = item.section ? -2 : item.index;
  if (editorShown()) {
    const value = editor.value;
    const live = item.section ? getDocumentOutline(value).find((x) => x.section === item.section) : getOutline(value).find((x) => x.index === item.index);
    const target = live ?? item;
    const start = lineStart(value, target.line);
    const nl = value.indexOf('\n', start);
    editor.select(start, nl < 0 ? value.length : nl);
    if (state.settings.centerTab !== 'split') return;
  }
  if (state.settings.centerTab === 'edit') await setCenterTab('preview');
  requestAnimationFrame(() => root.querySelector(`#preview ${item.section ? `#sec-${item.section}` : `#h-${item.index}`}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

async function gotoFigure(figure) {
  state.activeFigure = figure.index;
  renderLeft();
  if (editorShown()) {
    const live = getFigures(editor.value).find((x) => x.index === figure.index) ?? figure;
    editor.select(live.start, live.start + live.length);
    if (state.settings.centerTab !== 'split') return;
  }
  if (state.settings.centerTab === 'edit') await setCenterTab('preview');
  requestAnimationFrame(() => root.querySelector(`#preview #fig-${figure.index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
}

async function gotoLine(line) {
  if (line == null || !state.doc) return;
  if (!editorShown()) await setCenterTab('edit');
  const ed = await ensureEditor();
  const start = lineStart(ed.value, line);
  const nl = ed.value.indexOf('\n', start);
  ed.select(start, nl < 0 ? ed.value.length : nl);
}

function resizeFigure(figure, percent) {
  settleNow();
  const base = state.doc.text;
  const live = getFigures(base).find((x) => x.index === figure.index);
  if (live) changeText('figureSize', setFigureWidth(base, live, percent));
  state.activeFigure = figure.index;
}

const figureWidth = (f) => { const m = /\bw=(\d{1,3})%/i.exec(f.title ?? '') ?? /\bw=(\d{1,3})%/i.exec((state.doc?.text ?? '').slice(f.start, f.start + f.length)); return m ? Number(m[1]) : 100; };

// ───────────────────────── views: tabs, zoom

async function setCenterTab(tab) {
  if (tab !== 'edit') settleNow();
  updateSettings({ centerTab: tab }, { quiet: true });
  renderCenter();
  renderToolbarState();
  if (tab === 'edit' || tab === 'split') {
    await ensureEditor();
    fillEditor();
    applyEditorLook();
  }
  renderPreview();
}

function setLeftTab(tab) {
  updateSettings({ leftTab: tab }, { quiet: true });
  if (!state.settings.showLeftPanel) updateSettings({ showLeftPanel: true });
  renderLeft();
}

function setZoom(value) {
  const zoom = Math.max(DOC_ZOOM.min, Math.min(DOC_ZOOM.max, Math.round(value / DOC_ZOOM.step) * DOC_ZOOM.step));
  updateSettings({ docZoom: zoom }, { quiet: true });
  applyEditorLook();
  applyPreviewLook();
  renderToolbarState();
  renderStatus();
}

function bumpDocFont(delta) {
  const next = Math.max(DOC_FONT_SIZE.min, Math.min(DOC_FONT_SIZE.max, (Number(D().fontSizePt) || 10) + delta));
  updateDoc({ fontSizePt: next });
}

// ───────────────────────── document settings (state.settings.doc)

const MERGE_KEYS = ['recursive', 'insertFileHeaders', 'numberHeadings', 'sortOrder'];
function updateDoc(patch, { quiet = false } = {}) {
  const before = D();
  updateSettings({ doc: { ...before, ...patch } }, { quiet });
  if (quiet) return;
  docSettingsChanged(before);
}

function docSettingsChanged(before) {
  const now = D();
  if (before.sortOrder !== now.sortOrder && now.sortOrder !== 'custom' && state.doc?.files.length) {
    history.record('sort', snapshot());
    state.doc.files = sortFiles(state.doc.files, now.sortOrder);
    filesChanged();
  } else if (before.insertFileHeaders !== now.insertFileHeaders || before.numberHeadings !== now.numberHeadings) {
    if (state.doc?.files.length) { history.record('mergeOptions', snapshot()); filesChanged(); }
  }
  refreshFront();
  updateExportName();
  renderPreview();
  renderRight();
  renderToolbarState();
  renderStatus();
}

const toggleDoc = (key) => updateDoc({ [key]: !D()[key] });

// ───────────────────────── commands

const toggle = (key) => updateSettings({ [key]: !state.settings[key] });
const docOn = (key) => () => D()[key] !== false;
const viewCommand = (tab, glyph) => ({ icon: glyph, label: `view.${tab}`, key: { edit: 'Alt+1', preview: 'Alt+2', split: 'Alt+3' }[tab], enabled: hasDoc, checked: () => hasDoc() && state.settings.centerTab === tab, run: () => setCenterTab(tab) });
const mark = (id) => { const entry = MARKS.find((m) => Array.isArray(m) && m[0] === id); return { icon: entry[1], label: `md.${id}`, enabled: hasDoc, run: entry[2] }; };

const commands = {
  // file
  newDoc: { icon: 'docNew', label: 'action.newDoc', key: 'Ctrl+N', run: () => newDocument() },
  openDoc: { icon: 'openFile', label: 'action.openDoc', key: 'Ctrl+O', run: () => openDocument() },
  addFolder: { icon: 'folderAdd', label: 'action.addFolder', key: 'Ctrl+Shift+O', run: () => addFolder() },
  addFiles: { icon: 'filesAdd', label: 'action.addFiles', key: 'Ctrl+Shift+A', run: () => addFiles() },
  openSample: { icon: 'samples', label: 'action.openSample', run: (c) => samplesMenu(c?.anchor) },
  save: { icon: 'save', label: 'action.save', key: 'Ctrl+S', enabled: () => hasDoc() && !saving, run: () => saveDoc() },
  saveAs: { icon: 'saveAs', label: 'action.saveAs', key: 'Ctrl+Shift+S', enabled: () => hasDoc() && !saving, run: () => saveDoc({ saveAs: true }) },
  exportMenu: { icon: 'exportFile', label: 'action.export', key: 'Ctrl+E', enabled: hasDoc, run: (c) => exportMenu(c?.anchor) },
  exportMd: { icon: 'markdownFile', label: 'export.md', enabled: hasText, run: () => exportAs('md') },
  exportHtml: { icon: 'htmlFile', label: 'export.html', enabled: hasText, run: () => exportAs('html') },
  exportPdf: { icon: 'pdfFile', label: 'export.pdf', enabled: hasText, run: () => exportAs('pdf') },
  exportWord: { icon: 'wordFile', label: 'export.word', enabled: hasText, run: () => exportAs('word') },
  print: { icon: 'print', label: 'action.print', key: 'Ctrl+P', enabled: () => hasText() && !printing, run: () => printDoc() },
  startPage: { icon: 'home', label: 'action.startPage', key: 'Ctrl+Shift+H', checked: () => state.showStart || !state.doc, run: () => toggleStart() },
  recent: { icon: 'recent', label: 'action.recent', key: 'Ctrl+R', run: () => popups.open('recent', {}) },
  clearRecent: { icon: 'clearHistory', label: 'action.clearRecent', enabled: () => state.recent.length + state.recentDirs.length > 0, run: () => clearRecentAll() },
  closeDoc: { icon: 'closeTab', label: 'action.closeDoc', key: 'Ctrl+W', enabled: () => Boolean(state.doc), run: () => closeDocument() },
  exit: { icon: 'exit', label: 'action.exit', key: isMac ? 'Ctrl+Q' : 'Alt+F4', run: () => requestExit() },
  // edit
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: () => hasDoc() && history.canUndo, run: () => undo() },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: () => hasDoc() && history.canRedo, run: () => redo() },
  find: { icon: 'search', label: 'action.find', key: 'Ctrl+F', enabled: hasDoc, run: async () => { if (!editorShown()) await setCenterTab('edit'); (await ensureEditor()).openSearch(); } },
  selectAllText: { icon: 'selectAll', label: 'action.selectText', enabled: hasDoc, run: async () => { if (editorShown()) editor.selectAll(); else selectPreviewAll(); } },
  checkAll: { icon: 'checkAll', label: 'files.checkAll', enabled: () => (state.doc?.files.length ?? 0) > 0, run: () => checkAll(true) },
  uncheckAll: { icon: 'uncheckAll', label: 'files.uncheckAll', enabled: () => (state.doc?.files.length ?? 0) > 0, run: () => checkAll(false) },
  removeChecked: { icon: 'removeChecked', label: 'files.removeChecked', enabled: () => checkedFiles().length > 0, run: () => removeChecked() },
  clearFiles: { icon: 'trash', label: 'files.clear', enabled: () => (state.doc?.files.length ?? 0) > 0, run: () => clearFiles() },
  // insert (Markdown marks)
  'md:h1': mark('h1'), 'md:h2': mark('h2'), 'md:h3': mark('h3'), 'md:h4': mark('h4'), 'md:h5': mark('h5'),
  'md:bold': { ...mark('bold'), key: 'Ctrl+B' }, 'md:italic': { ...mark('italic'), key: 'Ctrl+I' }, 'md:strike': mark('strike'), 'md:code': mark('code'),
  'md:list': mark('list'), 'md:ordered': mark('ordered'), 'md:task': mark('task'), 'md:quote': mark('quote'),
  'md:link': { ...mark('link'), key: 'Ctrl+K' }, 'md:image': mark('image'), 'md:codeBlock': mark('codeBlock'), 'md:table': mark('table'), 'md:rule': mark('rule'),
  // document
  recursive: { icon: 'subfolders', label: 'opts.recursive', checked: docOn('recursive'), run: () => toggleDoc('recursive') },
  fileHeaders: { icon: 'fileHeading', label: 'opts.fileHeaders', checked: docOn('insertFileHeaders'), run: () => toggleDoc('insertFileHeaders') },
  numberHeadings: { icon: 'numbering', label: 'opts.numberingOnMerge', checked: docOn('numberHeadings'), run: () => toggleDoc('numberHeadings') },
  renumber: { icon: 'renumber', label: 'action.renumber', key: 'F7', enabled: hasText, run: () => renumberNow() },
  remerge: { icon: 'remerge', label: 'action.remerge', key: 'F5', enabled: () => hasDoc() && checkedFiles().length > 0, checked: () => Boolean(state.doc?.stale), run: () => remerge() },
  coverPage: { icon: 'coverPage', label: 'settings.coverPage', checked: docOn('coverPage'), run: () => toggleDoc('coverPage') },
  tocPage: { icon: 'contentsPage', label: 'settings.tocPage', checked: docOn('tocPage'), run: () => toggleDoc('tocPage') },
  figurePage: { icon: 'figureIndex', label: 'settings.figurePage', checked: docOn('figurePage'), run: () => toggleDoc('figurePage') },
  pageNumbers: { icon: 'pageNumber', label: 'settings.pageNumber', checked: docOn('showPageNumber'), run: () => toggleDoc('showPageNumber') },
  pageHeader: { icon: 'pageHeader', label: 'settings.header', checked: docOn('showHeader'), run: () => toggleDoc('showHeader') },
  pageFooter: { icon: 'pageFooter', label: 'settings.footer', checked: docOn('showFooter'), run: () => toggleDoc('showFooter') },
  chapterBreak: { icon: 'chapterBreak', label: 'action.chapterBreak', checked: docOn('chapterBreak'), run: () => toggleDoc('chapterBreak') },
  chooseLogo: { icon: 'logo', label: 'action.chooseLogo', run: () => chooseLogo() },
  clearLogo: { icon: 'logoClear', label: 'action.clearLogo', enabled: () => Boolean(D().logoImage), run: () => updateDoc({ logoImage: '', logoName: '', logoWidth: 0, logoHeight: 0 }) },
  docFontDown: { icon: 'minus', label: 'action.docFontDown', enabled: () => (Number(D().fontSizePt) || 10) > DOC_FONT_SIZE.min, run: () => bumpDocFont(-1) },
  docFontUp: { icon: 'plus', label: 'action.docFontUp', enabled: () => (Number(D().fontSizePt) || 10) < DOC_FONT_SIZE.max, run: () => bumpDocFont(1) },
  docSettings: { icon: 'docProperties', label: 'action.docSettings', run: () => popups.open('settings', { tab: 'pages' }) },
  // view
  'view:edit': viewCommand('edit', 'editMode'),
  'view:preview': viewCommand('preview', 'preview'),
  'view:split': viewCommand('split', 'splitView'),
  zoomIn: { icon: 'zoomIn', label: 'action.zoomIn', key: 'Ctrl+=', enabled: () => hasDoc() && state.settings.docZoom < DOC_ZOOM.max, run: () => setZoom(state.settings.docZoom + DOC_ZOOM.step) },
  zoomOut: { icon: 'zoomOut', label: 'action.zoomOut', key: 'Ctrl+-', enabled: () => hasDoc() && state.settings.docZoom > DOC_ZOOM.min, run: () => setZoom(state.settings.docZoom - DOC_ZOOM.step) },
  zoomReset: { icon: 'zoomReset', label: 'action.zoomReset', key: 'Ctrl+0', enabled: () => hasDoc() && state.settings.docZoom !== 100, run: () => setZoom(100) },
  editorFontUp: { icon: 'fontUp', label: 'action.editorFontUp', enabled: () => state.settings.editorFontSize < EDITOR_FONT.max, run: () => { updateSettings({ editorFontSize: state.settings.editorFontSize + 1 }, { quiet: true }); applyEditorLook(); } },
  editorFontDown: { icon: 'fontDown', label: 'action.editorFontDown', enabled: () => state.settings.editorFontSize > EDITOR_FONT.min, run: () => { updateSettings({ editorFontSize: state.settings.editorFontSize - 1 }, { quiet: true }); applyEditorLook(); } },
  'left:files': { icon: 'filesList', label: 'tab.files', checked: () => state.settings.leftTab === 'files', run: () => setLeftTab('files') },
  'left:structure': { icon: 'structureTree', label: 'tab.structure', checked: () => state.settings.leftTab === 'structure', run: () => setLeftTab('structure') },
  'left:figures': { icon: 'figures', label: 'tab.figures', checked: () => state.settings.leftTab === 'figures', run: () => setLeftTab('figures') },
  leftPanel: { icon: 'panelLeft', label: 'action.leftPanel', key: 'Ctrl+Shift+1', checked: () => state.settings.showLeftPanel, run: () => toggle('showLeftPanel') },
  rightPanel: { icon: 'panelRight', label: 'action.rightPanel', key: 'Ctrl+Shift+2', checked: () => state.settings.showRightPanel, run: () => toggle('showRightPanel') },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => state.settings.showStatusBar, run: () => toggle('showStatusBar') },
  bottomPanel: { icon: 'panelBottom', label: 'action.bottomPanel', key: 'Ctrl+J', checked: () => state.settings.showBottomPanel, run: () => toggle('showBottomPanel') },
  pictures: { icon: 'figures', label: 'action.pictures', checked: () => state.settings.showPictures !== false, run: () => { updateSettings({ showPictures: state.settings.showPictures === false }, { quiet: true }); editor?.setPictures(state.settings.showPictures !== false); renderToolbarState(); } },
  markBar: { icon: 'editorText', label: 'action.markBar', checked: () => state.settings.showMarkBar, run: () => { toggle('showMarkBar'); } },
  showProblems: { icon: 'warning', label: 'action.showProblems', run: () => showBottomTab('problems') },
  showMessages: { icon: 'info', label: 'action.showMessages', run: () => showBottomTab('messages') },
  showInformation: { icon: 'docProperties', label: 'action.showInformation', run: () => showBottomTab('info') },
  refreshProblems: { icon: 'refresh', label: 'bottom.problemsRefresh', enabled: hasDoc, run: () => { showBottomTab('problems'); runProblems(); } },
  clearMessages: { icon: 'clearHistory', label: 'action.clearMessages', enabled: () => state.log.length > 0, run: () => { state.log = []; renderBottom(); } },
  copyMessages: { icon: 'copy', label: 'action.copyMessages', enabled: () => state.log.length > 0, run: () => copyText(state.log.map(logLine).join('\n')) },
  theme: { icon: 'palette', label: 'action.themeRandom', run: () => updateSettings({ theme: randomThemeId(state.settings.theme) }) },
  themeMenu: { icon: 'chevronDown', label: 'action.themeChoose', run: (c) => openThemePicker(c?.anchor) },
  language: { icon: 'globe', label: 'action.language', key: 'Ctrl+Shift+L', run: () => updateSettings({ language: getLanguage() === 'ko' ? 'en' : 'ko' }) },
  shuffleBackground: { icon: 'dice', label: 'action.shuffleBackground', key: 'Ctrl+Shift+B', run: () => shuffleBackground() },
  backgroundImage: { icon: 'imageBg', label: 'action.backgroundImage', run: () => chooseBackground() },
  clearBackground: { icon: 'imageClear', label: 'action.clearBackground', enabled: () => Boolean(state.settings.backgroundImage) || state.settings.backgroundKind !== 'none', run: () => removeBackground() },
  // help
  welcome: { icon: 'bulb', label: 'action.welcome', run: () => openWelcome() },
  tutorial: { icon: 'tutorial', label: 'action.tutorial', key: 'F11', run: () => startTutorial() },
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
  const on = c.checked && !id.includes(':') && !['startPage'].includes(id) ? ` — ${t(c.checked() ? 'opts.on' : 'opts.off')}` : '';
  return `${t(c.label)}${c.key ? ` (${keyLabel(c.key)})` : ''}${on}${tip ? ` — ${tip}` : ''}`;
}
async function run(id, context) {
  const c = commands[id];
  if (!c || !commandEnabled(id)) return undefined;
  try { return await c.run(context); } catch (error) { return showError('error.command', error, t(c.label)); }
}

// ───────────────────────── menus

const SUBMENUS = {
  exportAs: { icon: 'exportFile', items: ['exportMd', 'exportHtml', 'exportPdf', 'exportWord'] },
  headings: { icon: 'heading1', items: ['md:h1', 'md:h2', 'md:h3', 'md:h4', 'md:h5'] },
  views: { icon: 'preview', items: ['view:edit', 'view:preview', 'view:split', '-', 'left:files', 'left:structure', 'left:figures'] },
  zoom: { icon: 'zoomIn', items: ['zoomIn', 'zoomOut', 'zoomReset', '-', 'editorFontUp', 'editorFontDown'] },
  show: { icon: 'eye', items: ['leftPanel', 'rightPanel', 'bottomPanel', 'statusBar', 'markBar', 'pictures', '-', 'showProblems', 'showMessages', 'showInformation'] },
  appearance: { icon: 'palette', items: ['theme', 'themeMenu', 'language', '-', 'shuffleBackground', 'backgroundImage', 'clearBackground'] },
  pages: { icon: 'coverPage', items: ['coverPage', 'tocPage', 'figurePage', 'chapterBreak', '-', 'pageNumbers', 'pageHeader', 'pageFooter', '-', 'chooseLogo', 'clearLogo'] },
};
const sub = (key) => ({ sub: key });
const MENUS = {
  file: ['newDoc', 'openDoc', 'openSample', '-', 'addFolder', 'addFiles', '-', 'save', 'saveAs', sub('exportAs'), 'print', '-', 'startPage', 'recent', 'clearRecent', '-', 'closeDoc', 'exit'],
  edit: ['undo', 'redo', '-', 'find', 'selectAllText', '-', 'checkAll', 'uncheckAll', 'removeChecked', 'clearFiles'],
  insert: [sub('headings'), '-', 'md:bold', 'md:italic', 'md:strike', 'md:code', '-', 'md:list', 'md:ordered', 'md:task', 'md:quote', '-', 'md:link', 'md:image', 'md:codeBlock', 'md:table', 'md:rule'],
  document: ['numberHeadings', 'recursive', 'fileHeaders', '-', 'renumber', 'remerge', '-', sub('pages'), 'docFontUp', 'docFontDown', '-', 'docSettings'],
  view: [sub('views'), sub('zoom'), '-', sub('show'), '-', sub('appearance')],
  help: ['welcome', 'tutorial', 'tutorialDoc', 'userGuide', 'shortcuts', '-', 'settings', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', insert: 'markdownFile', document: 'docProperties', view: 'eye', help: 'question' };

const TOOLBAR = [
  ['newDoc', 'openDoc', 'addFolder', 'addFiles', 'save', 'print', 'exportMenu'],
  ['undo', 'redo'],
  ['recursive', 'fileHeaders', 'numberHeadings', 'renumber', 'remerge'],
  ['coverPage', 'tocPage', 'figurePage', 'chapterBreak', 'pageNumbers', 'pageHeader', 'pageFooter', 'chooseLogo', 'docFont'],
  ['view:edit', 'view:preview', 'view:split', 'zoomOut', 'zoomValue', 'zoomIn'],
  ['leftPanel', 'bottomPanel', 'rightPanel'],
];
const TOOLBAR_RIGHT = ['tutorial', 'themeSplit', 'language', 'settings', 'about'];
const LABELED = new Set(['addFolder', 'addFiles', 'exportMenu']);
/** Main command of a toolbar entry (compound entries: what the » menu lists). */
const TOOLBAR_MAIN = { themeSplit: 'theme', docFont: 'docFontUp', zoomValue: 'zoomReset' };

// ───────────────────────── shell

function renderShell() {
  root.innerHTML = `
    <nav id="menubar" role="menubar"></nav>
    <div id="toolbar" role="toolbar"></div>
    <main id="shell">
      <aside id="left-panel" class="side-panel" aria-label="${escapeHtml(t('panel.left'))}"></aside>
      <div class="splitter vertical panel-split" data-split="left" role="separator" aria-orientation="vertical"></div>
      <section id="center">
        <div id="tabs"></div>
        <div id="center-body">
          <div id="workspace" class="workspace md-workspace">
            <div class="md-pane md-edit-pane">
              <div class="md-markbar" role="toolbar" aria-label="${escapeHtml(t('md.bar'))}"></div>
              <div id="editor-host" class="md-editor"></div>
            </div>
            <div class="splitter vertical md-split" data-split="center" role="separator" aria-orientation="vertical"></div>
            <div class="md-pane md-preview-pane"><div id="preview-scroll" class="md-preview-scroll"><article id="preview" class="preview markdown-body"></article></div></div>
          </div>
          <div id="start-page" hidden></div>
          <div class="drop-overlay" aria-hidden="true"><div>${icon('drop')}<span>${escapeHtml(t('drop.hint'))}</span></div></div>
        </div>
        <div class="splitter horizontal bottom-split" data-split="bottom" title="${escapeHtml(t('bottom.splitter'))}" role="separator" aria-orientation="horizontal"></div>
        <section id="bottom-panel" aria-label="${escapeHtml(t('bottom.title'))}"></section>
      </section>
      <div class="splitter vertical panel-split" data-split="right" role="separator" aria-orientation="vertical"></div>
      <aside id="right-panel" class="side-panel" aria-label="${escapeHtml(t('panel.right'))}"></aside>
    </main>
    <footer id="statusbar" role="status"></footer>
    ${desktop ? `<div class="resize-grip" data-resize-grip title="${escapeHtml(t('tip.resize'))}" role="separator">${icon('grip')}</div>` : `<div class="resize-grip static" aria-hidden="true">${icon('grip')}</div>`}
    <div id="tutorial-layer"></div>`;
}

function docTitle() {
  const d = state.showStart ? null : state.doc;
  if (!d) return '';
  return d.path ? baseName(d.path) : d.exportName || d.name || t('doc.untitled');
}

function renderMenubar() {
  const menubar = root.querySelector('#menubar');
  const onStart = state.showStart || !state.doc;
  const home = `<button class="menubar-item menubar-home ${onStart ? 'current' : ''}" data-home title="${escapeHtml(t('tip.home'))}" aria-pressed="${onStart}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button><span class="menubar-sep" aria-hidden="true"></span>`;
  const brand = `<div class="app-brand" data-window-drag title="${escapeHtml(`MyMarkDownMaker v${VERSION}`)}"><img class="app-brand-icon" src="${APP_ICON}" alt="" data-window-drag /><span class="app-brand-name" data-window-drag>MyMarkDownMaker</span><span class="app-brand-version" data-window-drag>v${escapeHtml(VERSION)}</span></div>`;
  const button = (id, glyph, key) => `<button class="window-button ${id === 'close' ? 'close' : ''}" data-window="${id}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(glyph)}</button>`;
  const controls = desktop ? `<div class="window-controls">${button('minimize', 'winMinimize', 'window.minimize')}${state.maximized ? button('maximize', 'winRestore', 'window.restore') : button('maximize', 'winMaximize', 'window.maximize')}${button('close', 'winClose', 'window.close')}</div>` : '';
  const projectName = '<span class="menubar-project" data-window-drag><span class="app-brand-project-name" data-window-drag></span><span class="app-brand-dirty" data-window-drag>●</span></span>';
  menubar.innerHTML = brand + home + Object.keys(MENUS).map((name) => `<button class="menubar-item ${state.openMenu === name ? 'open' : ''}" data-menu="${name}" role="menuitem" aria-haspopup="true" title="${escapeHtml(t(`menu.${name}`))}">${icon(MENU_ICONS[name])}<span>${escapeHtml(t(`menu.${name}`))}</span></button>`).join('') + projectName + `<div class="menubar-drag" data-window-drag></div>${controls}`;
  renderTitleProject();
}

function renderTitleProject() {
  const box = root.querySelector('.menubar-project');
  if (!box) return;
  const name = docTitle();
  box.classList.toggle('empty', !name);
  box.classList.toggle('dirty', Boolean(name) && isDirty());
  box.querySelector('.app-brand-project-name').textContent = name;
  box.title = name ? `${state.doc?.path ?? name}${isDirty() ? ` — ${t('doc.unsaved')}` : ''}` : '';
  const title = `${name ? `${isDirty() ? '● ' : ''}${name} — ` : ''}MyMarkDownMaker v${state.info?.version ?? VERSION}`;
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
  const update = async () => {
    const maximized = await appWindow.isMaximized().catch(() => false);
    if (maximized !== state.maximized) { state.maximized = maximized; renderMenubar(); }
  };
  await update();
  appWindow.onResized(() => update()).catch(() => {});
  const markTime = (key) => { try { globalThis.localStorage?.setItem(key, String(Date.now())); } catch { /* private mode */ } };
  for (const type of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(type, () => markTime('mymarkdownmaker.main.input'), { capture: true, passive: true });
  window.addEventListener('focus', () => markTime('mymarkdownmaker.main.focus'));
}

let toolbarLanguage = null;
function renderToolbar() {
  const toolbar = root.querySelector('#toolbar');
  toolbarLanguage = getLanguage();
  const plain = (id, extra = '') => {
    const c = commands[id];
    const glyph = id === 'language' ? switchFlag(getLanguage()) : icon(c.icon);
    const labeled = LABELED.has(id);
    return `<button class="tool-button ${labeled ? 'tool-labeled' : ''} ${extra}" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(c.label))}">${glyph}${labeled ? `<span>${escapeHtml(t(c.label))}</span>` : ''}${id === 'exportMenu' ? icon('chevronDown', 'icon tiny') : ''}</button>`;
  };
  const split = (main, arrow, label) => `<span class="split-button">${plain(main)}<button class="tool-button split-arrow" data-command="${arrow}" title="${escapeHtml(commandTip(arrow))}" aria-label="${escapeHtml(t(label))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
  const button = (id) => {
    if (id === 'themeSplit') return split('theme', 'themeMenu', 'action.themeChoose');
    if (id === 'docFont') return `<span class="tool-stepper" title="${escapeHtml(t('settings.docFontSize'))}">${icon('fontSizeDoc')}${plain('docFontDown', 'mini')}<span class="tool-value" data-doc-font>${escapeHtml(`${D().fontSizePt}pt`)}</span>${plain('docFontUp', 'mini')}</span>`;
    if (id === 'zoomValue') return `<button class="tool-button tool-value-button" data-command="zoomReset" title="${escapeHtml(commandTip('zoomReset'))}"><span data-zoom-value>${state.settings.docZoom}%</span></button>`;
    return plain(id);
  };
  toolbar.innerHTML = `<div class="toolbar-inner">
    <div class="toolbar-left">${TOOLBAR.map((group, i) => `${i ? `<span class="tool-sep" data-group-sep="${i}" aria-hidden="true"></span>` : ''}<div class="tool-group" data-group="${i}">${group.map(button).join('')}</div>`).join('')}<button class="tool-button toolbar-more" data-toolbar-more hidden title="${escapeHtml(t('toolbar.more'))}" aria-label="${escapeHtml(t('toolbar.more'))}" aria-haspopup="true">${icon('toolbarMore')}</button></div>
    <span class="grow"></span>
    <div class="toolbar-right tool-group">${TOOLBAR_RIGHT.map(button).join('')}</div>
  </div>`;
  renderToolbarState();
  updateMinimumWidth();
  fitToolbar();
}

/** A window narrower than the toolbar: the left groups that do not fit go into the » menu. */
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
  const ids = state.toolbarHidden.flatMap((group, i) => [...(i ? ['-'] : []), ...group.flatMap((id) => (id === 'docFont' ? ['docFontDown', 'docFontUp'] : [TOOLBAR_MAIN[id] ?? id]))]).filter((id) => id === '-' || commands[id]);
  if (ids.length) showMenu(menuItems(ids), anchorBelow(button));
}

function renderToolbarState() {
  for (const el of root.querySelectorAll('#toolbar [data-command], #tabs [data-command], .md-markbar [data-command], #left-panel [data-command]')) {
    const id = el.dataset.command;
    el.disabled = !commandEnabled(id);
    const checked = commands[id]?.checked?.();
    el.classList.toggle('active', Boolean(checked));
    if (checked !== undefined) el.setAttribute('aria-pressed', String(Boolean(checked)));
    if (el.closest('#toolbar') && commands[id]?.checked) el.title = commandTip(id);
  }
  const undoBtn = root.querySelector('#toolbar [data-command="undo"]');
  if (undoBtn) undoBtn.title = history.canUndo ? `${commandTip('undo')}: ${t(`op.${history.undoLabel}`)}` : commandTip('undo');
  const redoBtn = root.querySelector('#toolbar [data-command="redo"]');
  if (redoBtn) redoBtn.title = history.canRedo ? `${commandTip('redo')}: ${t(`op.${history.redoLabel}`)}` : commandTip('redo');
  const save = root.querySelector('#toolbar [data-command="save"]');
  save?.classList.toggle('dirty', isDirty());
  const font = root.querySelector('[data-doc-font]');
  if (font) font.textContent = `${D().fontSizePt}pt`;
  const zoom = root.querySelector('[data-zoom-value]');
  if (zoom) zoom.textContent = `${state.settings.docZoom}%`;
  renderTitleProject();
}

function updateMinimumWidth() {
  const left = root.querySelector('.toolbar-left');
  const right = root.querySelector('.toolbar-right');
  if (!left || !right) return;
  requestAnimationFrame(() => {
    const menus = [...root.querySelectorAll('.app-brand, .menubar-item, .window-controls')].reduce((sum, el) => sum + el.offsetWidth + 2, 48);
    const width = Math.ceil(Math.max(menus, right.scrollWidth + 360));
    const screenWidth = window.screen?.availWidth || Infinity;
    const min = Math.min(screenWidth, Math.max(width, 900));
    if (Math.abs(min - state.minWidth) < 1) return;
    state.minWidth = min;
    document.documentElement.style.setProperty('--min-width', `${min}px`);
    native.setMinimumSize(min, 600).catch(() => {});
  });
}

/** Above the document: its name and the Edit · Preview · Split tabs. */
function renderTabs() {
  renderTitleProject();
  const tabs = root.querySelector('#tabs');
  const d = state.showStart ? null : doc();
  if (!d) { tabs.innerHTML = ''; return; }
  const views = [['view:edit', 'edit'], ['view:preview', 'preview'], ['view:split', 'split']];
  const badge = d.stale ? `<button class="badge warn" data-command="remerge" title="${escapeHtml(t('tip.remergeStale'))}">${icon('remerge')}<span>${escapeHtml(t('stat.stale'))}</span></button>` : d.edited ? `<span class="badge" title="${escapeHtml(t('stat.editedHint'))}">${escapeHtml(t('stat.edited'))}</span>` : '';
  tabs.innerHTML = `<div class="tab-strip">
      <span class="ws-crumb" title="${escapeHtml(d.path ?? docTitle())}">${icon(d.path ? 'markdownFile' : 'mergeDocs')}<b>${escapeHtml(docTitle())}</b>${d.sourceDir ? `<span class="muted">· ${escapeHtml(d.sourceDir)}</span>` : ''}${badge}</span>
    </div>
    <span class="grow"></span>
    <div class="tabs-right"><span class="seg-toggle" role="tablist">${views.map(([command, view]) => `<button class="${state.settings.centerTab === view ? 'active' : ''}" data-command="${command}" role="tab" aria-selected="${state.settings.centerTab === view}" title="${escapeHtml(commandTip(command))}">${icon(commands[command].icon)}<span>${escapeHtml(t(`view.${view}`))}</span></button>`).join('')}</span></div>`;
}

// ───────────────────────── left panel: Files · Structure · Figures

const SORT_ICONS = { nameAsc: 'sortAsc', nameDesc: 'sortDesc', dateNewest: 'sortNewest', dateOldest: 'sortOldest', custom: 'sortCustom' };

function renderLeft() {
  const panel = root.querySelector('#left-panel');
  if (!panel || state.showStart || !state.doc) return;
  if (!state.settings.showLeftPanel) {
    panel.innerHTML = `<div class="panel-rail"><button class="rail-button expand" data-command="leftPanel" title="${escapeHtml(t('panel.expandLeft'))}">${icon('panelLeftOpen')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button>
      <div class="rail-title">${icon('filesList')}<span>${escapeHtml(t('panel.leftShort'))}</span></div></div>`;
    return;
  }
  const tab = state.settings.leftTab;
  const d = state.doc;
  const info = derived();
  const counts = { files: `${checkedFiles().length}/${d.files.length}`, structure: String(info.outline.length), figures: String(info.figures.length) };
  const tabs = [['files', 'filesList'], ['structure', 'structureTree'], ['figures', 'figures']];
  const scroll = panel.querySelector('.panel-body')?.scrollTop ?? 0;
  const head = `<div class="panel-header">${icon(tabs.find(([id]) => id === tab)[1])}<span>${escapeHtml(t(`tab.${tab}`))}</span>
      <button class="icon-button" data-command="leftPanel" title="${escapeHtml(t('panel.collapseLeft'))}">${icon('panelLeftClose')}</button></div>
    <div class="panel-tabs"><span class="segmented fill" role="tablist">${tabs.map(([id, glyph]) => `<button class="segment ${tab === id ? 'active' : ''}" data-left-tab="${id}" role="tab" aria-selected="${tab === id}" title="${escapeHtml(t(`tab.${id}`))}">${icon(glyph)}<span>${escapeHtml(t(`tab.${id}`))}</span><i class="tab-count">${counts[id]}</i></button>`).join('')}</span></div>`;
  let body = '';
  if (tab === 'files') body = filesHtml();
  else if (tab === 'structure') body = structureHtml(info);
  else body = figuresHtml(info);
  panel.innerHTML = `${head}${body}`;
  const list = panel.querySelector('.panel-body');
  if (list) list.scrollTop = scroll;
  renderToolbarState();
}

function filesHtml() {
  const d = state.doc;
  const order = D().sortOrder;
  const tools = `<div class="panel-tools grid4">
      <button class="small-button" data-command="addFolder" title="${escapeHtml(commandTip('addFolder'))}">${icon('folderAdd')}<span>${escapeHtml(t('files.folder'))}</span></button>
      <button class="small-button" data-command="addFiles" title="${escapeHtml(commandTip('addFiles'))}">${icon('filesAdd')}<span>${escapeHtml(t('files.files'))}</span></button>
      <button class="small-button" data-command="checkAll" title="${escapeHtml(commandTip('checkAll'))}">${icon('checkAll')}<span>${escapeHtml(t('files.all'))}</span></button>
      <button class="small-button" data-command="uncheckAll" title="${escapeHtml(commandTip('uncheckAll'))}">${icon('uncheckAll')}<span>${escapeHtml(t('files.none'))}</span></button>
    </div>
    <div class="panel-tools sort-row" title="${escapeHtml(t('opts.sort'))}">${icon(SORT_ICONS[order])}<span class="muted">${escapeHtml(t('opts.sort'))}</span>
      <select data-doc-select="sortOrder" data-icon="sortAsc" aria-label="${escapeHtml(t('opts.sort'))}">${SORT_ORDERS.map((id) => `<option value="${id}" data-icon="${SORT_ICONS[id]}" ${order === id ? 'selected' : ''}>${escapeHtml(t(`sort.${id}`))}</option>`).join('')}</select>
      <button class="icon-button" data-command="removeChecked" title="${escapeHtml(commandTip('removeChecked'))}">${icon('removeChecked')}</button></div>`;
  if (!d.files.length) {
    return `${tools}<div class="panel-body"><div class="panel-empty">${icon('folderAdd', 'icon big')}<p>${escapeHtml(t('files.hint'))}</p><small class="muted">${escapeHtml(t('files.dropHere'))}</small></div></div>`;
  }
  const rows = d.files.map((f, i) => `<div class="file-row ${f.checked ? '' : 'off'}" data-file="${f.id}" data-index="${i}" title="${escapeHtml(f.fullPath || f.relPath || f.name)}">
      <span class="file-grip" data-file-grip="${i}" title="${escapeHtml(t('files.drag'))}">${icon('gripLines')}</span>
      <label class="file-check"><input type="checkbox" data-file-toggle="${f.id}" ${f.checked ? 'checked' : ''} aria-label="${escapeHtml(f.name)}" /></label>
      ${icon('markdownFile')}<span class="file-name"><b>${escapeHtml(f.name)}</b>${f.relPath && f.relPath !== f.name ? `<small>${escapeHtml(f.relPath)}</small>` : ''}</span>
      <span class="file-actions"><button class="icon-button" data-file-move="${i}:-1" title="${escapeHtml(t('files.moveUp'))}" ${i === 0 ? 'disabled' : ''}>${icon('moveUp')}</button><button class="icon-button" data-file-move="${i}:1" title="${escapeHtml(t('files.moveDown'))}" ${i === d.files.length - 1 ? 'disabled' : ''}>${icon('moveDown')}</button><button class="icon-button danger" data-file-remove="${f.id}" title="${escapeHtml(t('files.remove'))}">${icon('close')}</button></span>
    </div>`).join('');
  return `${tools}<div class="panel-body file-list" role="list">${rows}</div>`;
}

/** The tree's connector lines of each row: for every ancestor level, whether its line goes on below this row. */
function treeGuides(levels) {
  return levels.map((level, i) => {
    const guides = [];
    for (let k = 1; k < level; k++) {
      // The line of depth k goes on while a later row is at depth k + 1 before one at depth ≤ k.
      let more = false;
      for (let j = i + 1; j < levels.length && levels[j] > k; j++) if (levels[j] === k + 1) { more = true; break; }
      guides.push(more);
    }
    return guides;
  });
}

const TREE_STEP = 16;
function structureHtml(info) {
  if (!info.structure.length) return `<div class="panel-body"><div class="panel-empty">${icon('structureTree', 'icon big')}<p>${escapeHtml(t('structure.none'))}</p></div></div>`;
  const glyph = { cover: 'coverPage', toc: 'contentsPage', figures: 'figureIndex' };
  // Levels close up (H1 → H3 is drawn one step in), so every row hangs from the row above it.
  const levels = [];
  for (const h of info.structure) levels.push(Math.max(1, Math.min(h.level, (levels.at(-1) ?? 0) + 1)));
  const guides = treeGuides(levels);
  const rows = info.structure.map((h, i) => {
    const level = levels[i];
    const lines = guides[i].map((more, k) => {
      const x = 12 + k * TREE_STEP + 7;
      const own = k === level - 2;
      // own level: ├ (more siblings below) or └ (the last one); ancestors: │ only while they go on
      if (own) return `<i class="tg v ${more ? '' : 'last'}" style="left:${x}px"></i><i class="tg h" style="left:${x}px;width:${TREE_STEP - 5}px"></i>`;
      return more ? `<i class="tg v" style="left:${x}px"></i>` : '';
    }).join('');
    return `<button class="tree-row lvl-${Math.min(6, h.level)} ${h.section ? 'section' : ''} ${state.activeHeading === h.index && !h.section ? 'active' : ''}" data-heading="${i}" style="--indent:${(level - 1) * TREE_STEP}px" title="${escapeHtml(h.text)}">${lines}${icon(h.section ? glyph[h.section] : `heading${Math.min(5, h.level)}`)}<span>${escapeHtml(h.text)}</span></button>`;
  }).join('');
  return `<div class="panel-tools"><span class="muted">${escapeHtml(t('structure.headings', { count: info.outline.length }))}</span><span class="grow"></span><button class="small-button" data-command="renumber" title="${escapeHtml(commandTip('renumber'))}">${icon('renumber')}<span>${escapeHtml(t('action.renumberShort'))}</span></button></div><div class="panel-body tree" role="tree">${rows}</div>`;
}

function figuresHtml(info) {
  if (!info.figures.length) return `<div class="panel-body"><div class="panel-empty">${icon('figures', 'icon big')}<p>${escapeHtml(t('figures.none'))}</p><button class="small-button" data-command="md:image">${icon('insertImage')}<span>${escapeHtml(t('md.image'))}</span></button></div></div>`;
  const rows = info.figures.map((f) => {
    const src = imageDisplaySrc(f.src);
    const width = figureWidth(f);
    return `<div class="figure-row ${state.activeFigure === f.index ? 'active' : ''}" data-figure="${f.index}" title="${escapeHtml(f.caption || t('figures.untitled'))}">
      <span class="figure-thumb">${src ? `<img src="${escapeHtml(src)}" alt="" loading="lazy" />` : icon('warning')}</span>
      <span class="figure-text"><b>${escapeHtml(`${t('figure.label')} ${f.index + 1}`)}</b><small>${escapeHtml(f.caption || t('figures.untitled'))}</small></span>
      ${stepperHtml({ key: `figure:${f.index}`, value: width, min: 10, max: 100, step: 10, unit: '%', label: t('figures.size'), decreaseTip: t('stepper.decrease', { label: t('figures.size') }), increaseTip: t('stepper.increase', { label: t('figures.size') }) })}
    </div>`;
  }).join('');
  return `<div class="panel-tools"><span class="muted">${escapeHtml(t('figures.count', { count: info.figures.length }))}</span></div><div class="panel-body figure-list">${rows}</div>`;
}

// ───────────────────────── centre: editor · preview

function renderCenter() {
  const ws = root.querySelector('#workspace');
  if (!ws) return;
  const tab = state.settings.centerTab;
  ws.dataset.view = tab;
  const bar = root.querySelector('.md-markbar');
  bar.hidden = !state.settings.showMarkBar;
  bar.innerHTML = MARKS.map((m) => (m === '-' ? '<span class="tool-sep" aria-hidden="true"></span>' : `<button class="tool-button mini" data-command="md:${m[0]}" title="${escapeHtml(commandTip(`md:${m[0]}`))}" aria-label="${escapeHtml(t(`md.${m[0]}`))}">${icon(m[1])}</button>`)).join('')
    + `<span class="grow"></span><button class="tool-button mini" data-command="pictures" title="${escapeHtml(commandTip('pictures'))}">${icon('figures')}</button><button class="tool-button mini" data-command="find" title="${escapeHtml(commandTip('find'))}">${icon('search')}</button><button class="tool-button mini" data-command="markBar" title="${escapeHtml(commandTip('markBar'))}">${icon('close')}</button>`;
  root.style.setProperty('--split-share', `${state.settings.splitShare ?? 50}%`);
  renderTabs();
}

let previewText = null;
let previewKey = '';
/** Page numbers of the contents and figure index in the preview: { key, map } from a layout pass of the A4 pages. */
let pageMap = { key: '', map: null };
const pageMapKey = () => JSON.stringify([state.doc?.text ?? '', D(), lang()]);

function renderPreview() {
  const host = root.querySelector('#preview');
  if (!host || !state.doc || state.showStart) return;
  if (!['preview', 'split'].includes(state.settings.centerTab)) return;
  const body = state.doc.text;
  const key = JSON.stringify([D(), lang(), pageMap.key === pageMapKey() ? pageMap.map : null]);
  if (body === previewText && key === previewKey) { applyPreviewLook(); return; }
  previewText = body;
  previewKey = key;
  const map = pageMap.key === pageMapKey() ? pageMap.map : null;
  const scroll = root.querySelector('#preview-scroll')?.scrollTop ?? 0;
  host.innerHTML = body.trim() ? `<style>${headingSizeCss(D(), '#preview .doc-content')}</style>${renderPreviewHtml(body, { ...D(), figureLabel: t('figure.label'), tocPageMap: map, figurePageMap: map })}` : `<div class="preview-empty">${icon('preview', 'icon big')}<p>${escapeHtml(t('preview.empty'))}</p></div>`;
  const scroller = root.querySelector('#preview-scroll');
  if (scroller) scroller.scrollTop = scroll;
  applyPreviewLook();
  schedulePageMap();
}

/** After the text settles, the document is laid out in A4 pages once (paged.js, in a hidden frame) to number the contents. */
let pageMapTimer = 0;
let pageMapRunning = false;
function schedulePageMap() {
  clearTimeout(pageMapTimer);
  const d = state.doc;
  if (!d || !d.text.trim() || pageMap.key === pageMapKey()) return;
  const parts = splitDocument(d.text);
  if (!parts.toc && !parts.figures) return;
  if (D().tocPageNumbers === false && D().figurePageNumbers === false) return;
  pageMapTimer = setTimeout(async () => {
    if (pageMapRunning) { schedulePageMap(); return; }
    const key = pageMapKey();
    if (!state.doc || pageMap.key === key) return;
    pageMapRunning = true;
    try {
      const html = toStandaloneHtml(state.doc.text, exportName(), { ...D(), contentsLabel: t('export.contents'), figuresLabel: t('export.figures'), figureLabel: t('figure.label'), tocPageNumbers: true, figurePageNumbers: true, tocPageMap: null, figurePageMap: null });
      const map = await computePageMap(html);
      pageMap = { key, map };
      if (pageMapKey() === key) renderPreview();
    } finally {
      pageMapRunning = false;
    }
  }, 1400);
}

function applyPreviewLook() {
  const host = root.querySelector('#preview');
  if (!host) return;
  const s = D();
  host.style.fontFamily = s.fontFamily ? fontStack(s.fontFamily) : '';
  host.style.fontSize = `${s.fontSizePt || 10}pt`;
  host.style.lineHeight = String(Number(s.lineHeight) > 0 ? Number(s.lineHeight) : 1.5);
  host.style.zoom = String(state.settings.docZoom / 100);
}

function selectPreviewAll() {
  const el = root.querySelector('#preview');
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// ───────────────────────── right panel: the document's properties

function renderRight() {
  const panel = root.querySelector('#right-panel');
  if (!panel || state.showStart || !state.doc) return;
  if (!state.settings.showRightPanel) {
    panel.innerHTML = `<div class="panel-rail"><button class="rail-button expand" data-command="rightPanel" title="${escapeHtml(t('panel.expandRight'))}">${icon('panelRightOpen')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button>
      <div class="rail-title">${icon('docProperties')}<span>${escapeHtml(t('panel.rightShort'))}</span></div></div>`;
    return;
  }
  const s = D();
  const scroll = panel.querySelector('.panel-body')?.scrollTop ?? 0;
  const focused = document.activeElement?.closest?.('#right-panel') ? document.activeElement.dataset.docText ?? null : null;
  const row = (glyph, label, control, cls = '') => `<div class="prop-row ${cls}" title="${escapeHtml(label)}"><span class="prop-label">${icon(glyph)}<span>${escapeHtml(label)}</span></span><span class="prop-control">${control}</span></div>`;
  const sw = (key, label) => `<label class="switch-wrap" title="${escapeHtml(label)}"><input type="checkbox" data-doc-toggle="${key}" ${s[key] !== false ? 'checked' : ''} aria-label="${escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`;
  const textField = (key, placeholder = '', disabled = false) => `<input type="text" data-doc-text="${key}" value="${escapeHtml(s[key] ?? '')}" placeholder="${escapeHtml(placeholder)}" ${disabled ? 'disabled' : ''} />`;
  const step = (key, value, limits, unit, label, disabled = false) => stepperHtml({ key: `doc:${key}`, value, ...limits, unit, label, decreaseTip: t('stepper.decrease', { label }), increaseTip: t('stepper.increase', { label }), disabled });
  const align = (key) => `<span class="segmented" role="radiogroup">${['left', 'center', 'right'].map((a) => `<button class="segment ${s[key] === a ? 'active' : ''}" data-doc-set="${key}" data-value="${a}" title="${escapeHtml(t(`align.${a}`))}">${icon(`alignText${a[0].toUpperCase()}${a.slice(1)}`)}</button>`).join('')}</span>`;
  const section = (glyph, title, rows) => `<section class="prop-section"><h3>${icon(glyph)}<span>${escapeHtml(title)}</span></h3>${rows.join('')}</section>`;
  const info = derived();
  const d = state.doc;
  panel.innerHTML = `<div class="panel-header">${icon('docProperties')}<span>${escapeHtml(t('panel.right'))}</span>
      <button class="icon-button" data-command="rightPanel" title="${escapeHtml(t('panel.collapseRight'))}">${icon('panelRightClose')}</button></div>
    <div class="panel-body props">
      ${section('docProperties', t('props.document'), [
        row('edit', t('export.filename'), `<button class="small-button wide" data-action="rename-export" title="${escapeHtml(t('export.nameTitle'))}">${icon('edit')}<span>${escapeHtml(exportName())}</span></button>`),
        row('file', t('props.savedAs'), `<span class="path" title="${escapeHtml(d.path ?? '')}">${escapeHtml(d.path ? baseName(d.path) : t('props.notSaved'))}</span>`),
        row('wordCount', t('props.size'), `<span class="muted">${escapeHtml(t('props.sizeValue', { words: info.words, chars: d.text.length, headings: info.outline.length, figures: info.figures.length }))}</span>`),
      ])}
      ${section('coverPage', t('settings.coverPage'), [
        row('coverPage', t('settings.coverPage'), sw('coverPage', t('settings.coverPage'))),
        row('edit', t('settings.coverTitle'), textField('coverTitle', t('settings.coverTitlePh'), !s.coverPage)),
        row('versionTag', t('settings.coverVersion'), `${sw('coverShowVersion', t('settings.showOnCover'))}${textField('coverVersion', t('settings.coverVersionPh'), !s.coverPage || !s.coverShowVersion)}`),
        row('person', t('settings.coverAuthor'), `${sw('coverShowAuthor', t('settings.showOnCover'))}${textField('coverAuthor', t('settings.coverAuthorPh'), !s.coverPage || !s.coverShowAuthor)}`),
        row('calendar', t('settings.coverDate'), `${sw('coverShowDate', t('settings.showOnCover'))}<input type="date" data-doc-text="coverDate" value="${escapeHtml(s.coverDate || new Date().toISOString().slice(0, 10))}" ${!s.coverPage || !s.coverShowDate ? 'disabled' : ''} /><button class="icon-button" data-doc-set="coverDate" data-value="" title="${escapeHtml(t('settings.today'))}" ${s.coverDate ? '' : 'disabled'}>${icon('refresh')}</button>`),
        row('alignTextCenter', t('settings.coverTitleAlign'), align('coverTitleAlign')),
      ])}
      ${section('contentsPage', t('props.pages'), [
        row('contentsPage', t('settings.tocPage'), sw('tocPage', t('settings.tocPage'))),
        row('chapterBreak', t('action.chapterBreak'), sw('chapterBreak', t('action.chapterBreak'))),
        row('tocLeaders', t('settings.tocLeaders'), sw('tocLeaders', t('settings.tocLeaders'))),
        row('figureIndex', t('settings.figurePage'), sw('figurePage', t('settings.figurePage'))),
        row('pageNumber', t('settings.pageNumber'), sw('showPageNumber', t('settings.pageNumber'))),
        row('pageNumber', t('settings.pageNumberPos'), `<select data-doc-select="pageNumberPos" data-icon="pageNumber" ${s.showPageNumber ? '' : 'disabled'}>${PAGE_NUMBER_POSITIONS.map((p) => `<option value="${p}" ${s.pageNumberPos === p ? 'selected' : ''}>${escapeHtml(t(`pos.${p}`))}</option>`).join('')}</select>`),
        row('pageHeader', t('settings.header'), `${sw('showHeader', t('settings.useHeader'))}${textField('headerText', t('settings.headerPh'), !s.showHeader)}`),
        row('pageFooter', t('settings.footer'), `${sw('showFooter', t('settings.useFooter'))}${textField('footerText', t('settings.footerPh'), !s.showFooter)}`),
      ])}
      ${section('logo', t('logo.title'), [
        row('logo', t('logo.picture'), s.logoImage
          ? `<span class="logo-chip" title="${escapeHtml(s.logoName)}"><img src="${escapeHtml(s.logoImage)}" alt="" /><span>${escapeHtml(s.logoName || t('logo.title'))}</span></span><button class="icon-button" data-command="chooseLogo" title="${escapeHtml(t('action.chooseLogo'))}">${icon('logo')}</button><button class="icon-button danger" data-command="clearLogo" title="${escapeHtml(t('action.clearLogo'))}">${icon('logoClear')}</button>`
          : `<button class="small-button wide" data-command="chooseLogo">${icon('logo')}<span>${escapeHtml(t('action.chooseLogo'))}</span></button>`),
        row('pageHeader', t('logo.inHeader'), `${sw('logoHeader', t('logo.inHeader'))}${align('logoHeaderAlign')}`),
        row('pageFooter', t('logo.inFooter'), `${sw('logoFooter', t('logo.inFooter'))}${align('logoFooterAlign')}`),
        row('fitPage', t('logo.height'), step('logoHeightMm', s.logoHeightMm, LOGO_HEIGHT, 'mm', t('logo.height'))),
        row('coverPage', t('logo.onCover'), `${sw('coverLogo', t('logo.onCover'))}<span class="segmented" role="radiogroup">${COVER_LOGO_POSITIONS.map((p) => `<button class="segment ${s.coverLogoPosition === p ? 'active' : ''}" data-doc-set="coverLogoPosition" data-value="${p}" title="${escapeHtml(t(`logo.pos.${p}`))}">${escapeHtml(t(`logo.pos.${p}`))}</button>`).join('')}</span>`),
        row('fitPage', t('logo.coverHeight'), step('coverLogoHeightMm', s.coverLogoHeightMm, COVER_LOGO_HEIGHT, 'mm', t('logo.coverHeight'))),
      ])}
      ${section('font', t('props.typography'), [
        row('font', t('settings.docFont'), `<select data-doc-select="fontFamily" data-icon="font" data-fonts aria-label="${escapeHtml(t('settings.docFont'))}">${fontOptions(s.fontFamily)}</select>`),
        row('heading1', t('props.sizeTarget'), `<select data-size-target data-icon="font" aria-label="${escapeHtml(t('props.sizeTarget'))}">${['body', ...HEADING_LEVELS.slice(0, 5)].map((k) => `<option value="${k}" data-icon="${k === 'body' ? 'font' : `heading${k.slice(1)}`}" ${state.sizeTarget === k ? 'selected' : ''}>${escapeHtml(t(`props.target.${k}`))}</option>`).join('')}</select>`),
        state.sizeTarget === 'body'
          ? row('fontSizeDoc', t('settings.docFontSize'), step('fontSizePt', s.fontSizePt, DOC_FONT_SIZE, 'pt', t('settings.docFontSize')))
          : row(`heading${state.sizeTarget.slice(1)}`, t('props.headingSize', { level: t(`props.target.${state.sizeTarget}`) }), `${stepperHtml({ key: `heading:${state.sizeTarget}`, value: s.headingSizes[state.sizeTarget] || Math.round((s.fontSizePt || 10) * HEADING_EM[state.sizeTarget] * 2) / 2, ...HEADING_SIZE, min: 6, unit: 'pt', label: t('props.headingSize', { level: t(`props.target.${state.sizeTarget}`) }), decreaseTip: t('stepper.decrease', { label: t(`props.target.${state.sizeTarget}`) }), increaseTip: t('stepper.increase', { label: t(`props.target.${state.sizeTarget}`) }) })}<button class="icon-button" data-heading-auto="${state.sizeTarget}" title="${escapeHtml(t('props.headingAuto'))}" ${s.headingSizes[state.sizeTarget] ? '' : 'disabled'}>${icon('refresh')}</button>`),
        row('lineSpacing', t('settings.lineSpacing'), step('lineHeight', s.lineHeight, LINE_HEIGHT, '', t('settings.lineSpacing'))),
      ])}
      ${section('mergeDocs', t('settings.merge'), [
        row('numbering', t('opts.numberingOnMerge'), sw('numberHeadings', t('opts.numberingOnMerge'))),
        row('subfolders', t('opts.recursive'), sw('recursive', t('opts.recursive'))),
        row('fileHeading', t('opts.fileHeaders'), sw('insertFileHeaders', t('opts.fileHeaders'))),
      ])}
    </div>`;
  panel.querySelector('.panel-body').scrollTop = scroll;
  if (focused) { const input = panel.querySelector(`[data-doc-text="${focused}"]`); if (input) { input.focus(); input.setSelectionRange?.(input.value.length, input.value.length); } }
  if (!fontList) loadFontList();
}

let fontList = null;
function fontOptions(current) {
  const fonts = fontList ?? [];
  const list = current && !fonts.includes(current) ? [current, ...fonts] : fonts;
  return `<option value="">${escapeHtml(t('settings.fontDefault'))}</option>${list.map((f) => `<option value="${escapeHtml(f)}" ${f === current ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}`;
}
let fontLoading = false;
async function loadFontList() {
  if (fontLoading) return;
  fontLoading = true;
  try { fontList = await native.listFonts(); } catch { fontList = []; }
  renderRight();
}

// ───────────────────────── bottom panel: Problems · Messages · Information

const logLine = (e) => `[${e.at.toLocaleTimeString()}] ${e.kind.toUpperCase()} ${e.text}${e.detail ? `\n${e.detail}` : ''}`;
const SEV_ICON = { error: 'error', warning: 'warning', info: 'info', success: 'check' };

let problemsTimer = 0;
function scheduleProblems(delay = 500) { clearTimeout(problemsTimer); problemsTimer = setTimeout(runProblems, delay); }
function runProblems() {
  const d = state.doc;
  state.problems = d ? findProblems(d.text, d.files, { checked: (f) => f.checked }) : [];
  if (state.bottomTab === 'problems') renderBottom();
  renderStatus();
}

function showBottomTab(tab) {
  state.bottomTab = tab;
  if (!state.settings.showBottomPanel) updateSettings({ showBottomPanel: true }); else renderBottom();
}

function renderBottom() {
  const host = root.querySelector('#bottom-panel');
  if (!host) return;
  if (!state.settings.showBottomPanel || state.showStart || !state.doc) { host.innerHTML = ''; return; }
  const problems = state.problems;
  const sev = countBySeverity(problems);
  const tabs = [['problems', sev.error ? 'error' : 'warning', t('bottom.problems'), problems.length], ['messages', 'info', t('bottom.messages'), state.log.length], ['info', 'docProperties', t('bottom.info'), null]];
  const tabHtml = `<span class="segmented" role="tablist">${tabs.map(([id, glyph, label, n]) => `<button class="segment ${state.bottomTab === id ? 'active' : ''}" data-bottom-tab="${id}" role="tab" aria-selected="${state.bottomTab === id}" title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span>${n != null ? `<i class="bottom-count">${n}</i>` : ''}</button>`).join('')}</span>`;
  let tools = '';
  let body = '';
  if (state.bottomTab === 'problems') {
    tools = `<span class="grow"></span><button class="small-button" data-command="refreshProblems">${icon('refresh')}<span>${escapeHtml(t('bottom.problemsRefresh'))}</span></button>`;
    body = problems.length ? problems.map((p, i) => {
      const msg = t(`problems.${p.kind}`, p.params);
      const where = p.line != null ? t('problems.line', { n: p.line + 1 }) : p.params?.name ?? '';
      return `<div class="problem-row bottom-row problems-row sev-${p.severity} ${p.line != null || p.file ? 'link' : ''}" data-problem="${i}" title="${escapeHtml(msg)}"><span class="cell sev">${icon(p.severity)}</span><span class="cell">${escapeHtml(msg)}</span><span class="cell muted">${escapeHtml(where)}</span><span class="cell muted">${escapeHtml(t(`problems.sev.${p.severity}`))}</span></div>`;
    }).join('') : `<p class="problems-empty">${icon('check')}<span>${escapeHtml(t('bottom.noProblems'))}</span></p>`;
  } else if (state.bottomTab === 'messages') {
    tools = `<span class="grow"></span><button class="small-button" data-command="copyMessages" ${state.log.length ? '' : 'disabled'}>${icon('copy')}<span>${escapeHtml(t('action.copyMessages'))}</span></button><button class="small-button danger" data-command="clearMessages" ${state.log.length ? '' : 'disabled'}>${icon('clearHistory')}<span>${escapeHtml(t('action.clearMessages'))}</span></button>`;
    body = state.log.length ? state.log.map((e, i) => `<div class="problem-row bottom-row log-row ${e.kind === 'error' ? 'error' : e.kind === 'info' ? '' : e.kind}" data-log="${i}" title="${escapeHtml(e.detail || e.text)}"><span class="cell sev">${icon(SEV_ICON[e.kind] ?? 'info')}</span><span class="cell">${escapeHtml(e.text)}</span><span class="cell muted">${escapeHtml(e.detail.split('\n')[0] ?? '')}</span><span class="cell muted">${escapeHtml(e.at.toLocaleTimeString())}</span></div>`).join('') : `<p class="problems-empty">${icon('info')}<span>${escapeHtml(t('bottom.noMessages'))}</span></p>`;
  } else {
    const d = state.doc;
    const info = derived();
    const rows = [
      ['markdownFile', t('bottom.infoDoc'), d.path ?? docTitle()],
      ['folder', t('bottom.infoSource'), d.sourceDir || '—'],
      ['filesList', t('bottom.infoFiles'), `${checkedFiles().length} / ${d.files.length}`],
      ['structureTree', t('bottom.infoHeadings'), String(info.outline.length)],
      ['figures', t('bottom.infoFigures'), String(info.figures.length)],
      ['wordCount', t('bottom.infoWords'), t('props.sizeValue', { words: info.words, chars: d.text.length, headings: info.outline.length, figures: info.figures.length })],
      ['font', t('bottom.infoFont'), `${D().fontFamily || t('settings.fontDefault')} · ${D().fontSizePt}pt · ${D().lineHeight}`],
    ];
    body = rows.map(([glyph, label, value]) => `<div class="problem-row bottom-row info-row"><span class="cell sev">${icon(glyph)}</span><span class="cell"><b>${escapeHtml(label)}</b></span><span class="cell info-value" title="${escapeHtml(value)}">${escapeHtml(value)}</span></div>`).join('');
  }
  const scroll = host.querySelector('.problems-list')?.scrollTop ?? 0;
  host.innerHTML = `<div class="problems-header">${tabHtml}${tools}<button class="icon-button" data-command="bottomPanel" title="${escapeHtml(t('bottom.hide'))}">${icon('close')}</button></div><div class="problems-list bottom-${state.bottomTab}" tabindex="0">${body}</div>`;
  host.querySelector('.problems-list').scrollTop = scroll;
}

// ───────────────────────── status bar

function renderStatus() {
  const bar = root.querySelector('#statusbar');
  if (!bar) return;
  const s = state.settings;
  const notice = state.notice;
  const hint = notice?.text ?? (state.doc?.stale ? t('status.mergeStale') : t('status.ready'));
  const items = [`<span class="status-notice ${notice?.kind ?? 'hint'}" title="${escapeHtml(hint)}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(hint)}</span></span>`];
  if (state.doc && !state.showStart) {
    const d = state.doc;
    const info = derived();
    const sev = countBySeverity(state.problems);
    items.push(`<button class="status-item" data-command="left:files" title="${escapeHtml(t('stat.files'))}">${icon('filesList')}<span>${checkedFiles().length}/${d.files.length}</span></button>`);
    items.push(`<button class="status-item" data-command="left:structure" title="${escapeHtml(t('stat.headings'))}">${icon('structureTree')}<span>${info.outline.length}</span></button>`);
    items.push(`<button class="status-item" data-command="left:figures" title="${escapeHtml(t('stat.figures'))}">${icon('figures')}<span>${info.figures.length}</span></button>`);
    items.push(`<span class="status-item" title="${escapeHtml(t('stat.words'))}">${icon('wordCount')}<span>${escapeHtml(t('stat.wordsChars', { words: info.words, chars: d.text.length }))}</span></span>`);
    // The document's problems by severity: a click opens the Problems tab of the bottom panel.
    items.push(`<button class="status-item status-problems" data-command="showProblems" title="${escapeHtml(t('status.problemsTip', sev))}">${['error', 'warning', 'info'].map((k) => `<span class="sev-${k} ${sev[k] ? '' : 'zero'}">${icon(k)}<b>${sev[k]}</b></span>`).join('')}</button>`);
    if (d.stale) items.push(`<button class="status-item warn" data-command="remerge" title="${escapeHtml(t('tip.remergeStale'))}">${icon('remerge')}<span>${escapeHtml(t('stat.stale'))}</span></button>`);
    else if (d.edited) items.push(`<span class="status-item" title="${escapeHtml(t('stat.editedHint'))}">${icon('edit')}<span>${escapeHtml(t('stat.edited'))}</span></span>`);
    if (isDirty()) items.push(`<span class="status-item warn" title="${escapeHtml(t('doc.unsaved'))}">${icon('save')}<span>${escapeHtml(t('doc.unsavedShort'))}</span></span>`);
    items.push(`<span class="status-item" title="${escapeHtml(t('settings.docFont'))}">${icon('font')}<span>${escapeHtml(`${D().fontFamily || t('settings.fontDefault')} · ${D().fontSizePt}pt`)}</span></span>`);
    items.push(`<button class="status-item" data-command="zoomReset" title="${escapeHtml(commandTip('zoomReset'))}">${icon('zoomIn')}<span>${s.docZoom}%</span></button>`);
  }
  items.push(`<span class="status-item" title="${escapeHtml(t('status.theme', { name: themeName(s.theme, getLanguage()) }))}">${icon('palette')}<span>${escapeHtml(themeName(s.theme, getLanguage()))}</span></span>`);
  items.push(`<span class="status-item" title="${escapeHtml(t('status.language'))}">${icon('globe')}<span>${escapeHtml(t('status.language'))}</span></span>`);
  if (s.statusClock) items.push(`<span class="status-item clock" title="${escapeHtml(t('status.clock'))}">${icon('clock')}<span id="status-clock">${escapeHtml(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span></span>`);
  bar.innerHTML = items.join('');
}

function renderAll() {
  root.classList.toggle('no-status', !state.settings.showStatusBar);
  root.classList.toggle('no-left', !state.settings.showLeftPanel);
  root.classList.toggle('no-right', !state.settings.showRightPanel);
  const onStart = state.showStart || !state.doc;
  root.classList.toggle('on-start', onStart);
  root.classList.toggle('no-bottom', !state.settings.showBottomPanel);
  root.style.setProperty('--bottom-height', `${state.settings.bottomHeight}px`);
  root.style.setProperty('--left-width', `${state.settings.leftWidth}px`);
  root.style.setProperty('--right-width', `${state.settings.rightWidth}px`);
  root.style.setProperty('--zoom', String(state.settings.zoom / 100));
  renderMenubar();
  if (toolbarLanguage !== getLanguage()) renderToolbar(); else renderToolbarState();
  renderCenter();
  renderLeft();
  renderRight();
  renderBottom();
  renderStatus();
  const startHost = root.querySelector('#start-page');
  startHost.hidden = !onStart;
  root.querySelector('#workspace').hidden = onStart;
  if (!onStart) renderPreview();
  if (onStart) renderStartPage(); else { startCards?.destroy(); startCards = null; startBackground?.stop(); startHost.innerHTML = ''; startBackground?.destroy(); startBackground = null; }
  updateBackgroundState();
}

// ───────────────────────── start page

let startCards = null;
function renderStartPage() {
  const host = root.querySelector('#start-page');
  if (!host || host.hidden) return;
  const scrollTop = host.querySelector('.start-scroll')?.scrollTop ?? 0;
  startCards?.destroy();
  host.innerHTML = startPageHtml(panelApi);
  startCards = startBoard(host.querySelector('.start-board'), {
    saved: state.settings.startLayout,
    reduced: Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    onSave: (layout) => { state.settings.startLayout = layout; storeSettings(globalThis.localStorage, state.settings); },
  });
  host.querySelector('.start-scroll').scrollTop = scrollTop;
  for (const holder of host.querySelectorAll('.start-speed')) syncSliderSteps(holder);
  const canvas = host.querySelector('.start-bg');
  const carry = startBackground ? { time: startBackground.time, kind: startBackground.kind } : null;
  startBackground?.destroy();
  startBackground = new AnimatedBackground(canvas, { colors: backgroundColors, speed: () => state.settings.animationSpeed / 100, kind: state.settings.animation, vivid: true });
  if (carry && carry.kind === startBackground.kind) startBackground.time = carry.time;
  if (state.settings.backgroundKind === 'animated') startBackground.start(); else startBackground.draw();
  canvas.classList.toggle('static', state.settings.backgroundKind !== 'animated');
  host.querySelector('.start-scroll').style.setProperty('--start-image', state.backgroundUrl && state.settings.backgroundKind === 'image' ? `url("${state.backgroundUrl}")` : 'none');
  host.classList.toggle('with-image', Boolean(state.backgroundUrl) && state.settings.backgroundKind === 'image');
}

function syncSliderSteps(holder) {
  const input = holder?.querySelector('input[type="range"]');
  if (!input) return;
  for (const button of holder.querySelectorAll('[data-slider-step]')) button.disabled = Number(button.dataset.sliderStep) < 0 ? Number(input.value) <= Number(input.min) : Number(input.value) >= Number(input.max);
}

function showStartPage(show = true) {
  settleNow();
  state.showStart = show || !state.doc;
  renderAll();
  if (!state.showStart && ['edit', 'split'].includes(state.settings.centerTab)) setCenterTab(state.settings.centerTab);
}

/** The Start button is a toggle: start page ↔ the document (an empty one when none is open yet). */
function toggleStart() {
  const onStart = state.showStart || !state.doc;
  if (!onStart) return showStartPage(true);
  if (!state.doc) { state.doc = newDoc({ name: t('doc.untitled') }); history.clear(); }
  return showStartPage(false);
}

async function onStartAction(target) {
  const value = target.dataset.value;
  switch (target.dataset.start) {
    case 'new-doc': return newDocument();
    case 'open-doc': return openDocument();
    case 'add-folder': return addFolder();
    case 'add-files': return addFiles();
    case 'sample': return openSample(value);
    case 'open-recent': return openRecent(value, target.dataset.kind);
    case 'remove-recent': return forgetRecent(value, target.dataset.kind);
    case 'clear-recent': return clearRecentAll();
    case 'arrange': return startCards?.arrange();
    case 'start-settings': return popups.open('settings', { tab: 'start' });
    case 'settings': return run('settings');
    case 'continue': return state.doc ? showStartPage(false) : value ? openRecent(value, target.dataset.kind) : addFolder();
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

function samplesMenu(anchor) {
  const handlers = Object.fromEntries(SAMPLE_IDS.map((id) => [`custom:${id}`, () => openSample(id)]));
  return showMenu(SAMPLE_IDS.map((id) => ({ id: `custom:${id}`, label: t(`sample.${id}`), icon: sampleGlyph(id) })), anchor ?? anchorBelow(root.querySelector('[data-menu="file"]')), 'context', { handlers, header: { icon: 'samples', title: t('action.openSample') } });
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
  startBackground?.setKind(s.animation);
  const showStart = state.showStart || !state.doc;
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
function shuffleBackground() { const next = startBackground?.shuffle() ?? randomAnimation(state.settings.animation); updateSettings({ animation: next, backgroundKind: 'animated' }); notify('info', t('notice.animation', { name: t(`animation.${next}`) })); }
async function loadBackground() {
  try { state.backgroundUrl = await native.backgroundUrl(state.settings); } catch (error) { state.backgroundUrl = null; showError('error.background', error); }
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
    cache = { text: null };
    editor?.setPlaceholder(t('editor.placeholder'));
    if (previous.language) notify('info', t('notice.language'));
  }
  if (s.backgroundImage !== previous.backgroundImage) loadBackground();
  if (s.theme !== previous.theme && previous.theme) notify('info', t('notice.theme', { name: themeName(s.theme, getLanguage()) }));
  renderAll();
  applyEditorLook();
  if (previous.doc && previous.doc !== s.doc) docSettingsChanged(previous.doc);
  else refreshFront();
  updateMinimumWidth();
}

async function openThemePicker(anchor) {
  const element = root.querySelector('.split-button [data-command="themeMenu"]')?.closest('.split-button') ?? root.querySelector('[data-command="themeMenu"]');
  const current = state.settings.theme;
  const handlers = {};
  const item = (theme, glyph = null) => {
    const id = `custom:theme:${theme.id ?? theme}`;
    handlers[id] = () => updateSettings({ theme: theme.id ?? theme });
    return { id, label: themeName(theme.id ?? theme, lang()), icon: glyph ?? 'palette', swatch: theme.swatch ?? null, checked: current === (theme.id ?? theme) };
  };
  handlers['custom:theme-edit'] = () => popups.open('settings', { tab: 'appearance', themeGroup: 'custom' });
  handlers['custom:theme-random'] = () => updateSettings({ theme: randomThemeId(current) });
  const items = [
    // one row: follow the system · the custom theme · its settings
    { columns: [[item(SYSTEM, 'monitor')], [item(customTheme(state.settings.customTheme), 'palette')], [{ id: 'custom:theme-edit', label: t('theme.customSettings'), icon: 'gear' }]], row: true },
    { separator: true },
    { columns: [DARK_THEMES.map((x) => item(x)), LIGHT_THEMES.map((x) => item(x))], heads: [t('theme.darkGroup', { count: DARK_THEMES.length }), t('theme.lightGroup', { count: LIGHT_THEMES.length })], headIcons: ['moon', 'sun'] },
    { separator: true },
    { id: 'custom:theme-random', label: t('action.themeRandom'), icon: 'dice' },
  ];
  await showMenu(items, anchor ?? anchorBelow(element), 'theme', { handlers, header: { icon: 'palette', title: t('action.themeChoose') } });
}

// ───────────────────────── progress popup (long work: reading many files, merging, exporting)

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
  if (delay <= 0) { const drawn = popups.whenDrawn('progress'); show(0); await drawn; }
  else if (desktop && !popups.useFrames) show(delay);
  else timer = setTimeout(() => show(0), delay);
  const unlisten = await native.listen('io-progress', (progress) => { if (progress.op !== op) return; last = progress; if (shown) popups.post('progress', { type: 'progress', ...progress }); });
  try {
    return await task(op, (progress) => {
      last = { op, done: Math.round((progress.fraction ?? 0) * 1000), total: 1000, text: progress.text ?? '' };
      if (shown) popups.post('progress', { type: 'progress', ...last });
    }, signal);
  } finally {
    clearTimeout(timer);
    unlisten();
    progressJobs.splice(progressJobs.indexOf(job), 1);
    if (shown || (desktop && !popups.useFrames)) {
      popups.post('progress', { type: 'done' });
      const outer = progressJobs.at(-1);
      setTimeout(() => { if (progressJobs.at(-1) !== outer) return; if (outer) outer.reopen(); else popups.hide('progress'); }, shown ? 500 : 0);
    }
  }
}

// ───────────────────────── recent files and folders, the session

function rememberFile(path, title) {
  if (!desktop || !path) return;
  state.recent = addRecent(loadRecent(globalThis.localStorage), { path, title: title || baseName(path), kind: 'file' });
  storeRecent(globalThis.localStorage, state.recent);
}
function rememberDir(dir) {
  if (!desktop || !dir) return;
  state.recentDirs = addRecent(loadRecentDirs(globalThis.localStorage), { path: dir, title: baseName(dir), kind: 'folder' });
  storeRecentDirs(globalThis.localStorage, state.recentDirs);
  updateSettings({ lastDirectory: dir }, { quiet: true });
}

async function openRecent(path, kind = 'file') {
  if (!desktop) return;
  const [exists] = await native.pathsExist([path]);
  if (!exists) {
    const choice = await ask({ icon: 'warning', title: t('recent.missingTitle'), message: t('recent.missingMessage'), items: [path], buttons: [{ id: 'keep', label: t('recent.keep') }, { id: 'remove', label: t('recent.remove'), icon: 'trash', danger: true, primary: true }] });
    if (choice === 'remove') forgetRecent(path, kind);
    return;
  }
  if (kind === 'folder') {
    await addFolderPath(path);
  } else {
    const choice = state.doc && !state.showStart ? await ask({ icon: 'markdownFile', title: t('recent.openTitle'), message: t('recent.openMessage'), items: [path], buttons: [{ id: 'cancel', label: t('common.cancel') }, { id: 'add', label: t('recent.addToList'), icon: 'filesAdd' }, { id: 'open', label: t('recent.openAsDoc'), icon: 'openFile', primary: true }] }) : 'open';
    if (choice === 'add') await addFilePaths([path]);
    else if (choice === 'open' && (await confirmDiscard())) await openDocumentPath(path).catch((error) => showError('error.open', error, path));
  }
}

function forgetRecent(path, kind) {
  if (kind === 'folder') { state.recentDirs = removeRecent(state.recentDirs, path); storeRecentDirs(globalThis.localStorage, state.recentDirs); }
  else { state.recent = removeRecent(state.recent, path); storeRecent(globalThis.localStorage, state.recent); }
  renderStartPage();
}

function clearRecentAll() {
  state.recent = []; state.recentDirs = [];
  storeRecent(globalThis.localStorage, []); storeRecentDirs(globalThis.localStorage, []);
  notify('success', t('notice.recentCleared'));
  renderAll();
}

/** The file list (desktop paths) and the saved document are restored at the next start. */
function persistSession() {
  if (!desktop || (state.instance && !state.instance.first)) return;
  const d = state.doc;
  const value = d && !state.tutorial?.active ? { files: d.files.filter((f) => f.fullPath).map((f) => ({ path: f.fullPath, rel: f.relPath, checked: f.checked })), path: d.path, edited: d.edited, sourceDir: d.sourceDir } : {};
  try { globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(value)); } catch { /* ignore */ }
}

async function restoreSession() {
  if (!desktop || !state.settings.restoreSession || (state.instance && !state.instance.first)) return;
  let session = {};
  try { session = JSON.parse(globalThis.localStorage?.getItem(SESSION_KEY) ?? '{}') ?? {}; } catch { /* none */ }
  if (session.path && session.edited && !session.files?.length) { try { await openDocumentPath(session.path); } catch { /* moved */ } return; }
  const files = session.files ?? [];
  if (!files.length) return;
  const exists = await native.pathsExist(files.map((f) => f.path));
  const present = files.filter((_, i) => exists[i]);
  if (!present.length) return;
  const infos = await native.fileInfos(present.map((f) => f.path));
  const items = await readSources(infos, (f) => f.name, readDesktopFile);
  const byPath = new Map(present.map((f) => [f.path, f]));
  state.doc = newDoc();
  state.doc.sourceDir = session.sourceDir ?? '';
  state.doc.files = items.map((it) => ({ ...it, relPath: byPath.get(it.fullPath)?.rel || it.relPath, id: `f${(fileSeq += 1)}`, checked: byPath.get(it.fullPath)?.checked !== false }));
  await runMerge();
}

// ───────────────────────── confirmation & exit

async function ask(params) { const result = await popups.open('confirm', params); return result?.choice ?? 'cancel'; }
async function requestExit() { if (desktop) return appWindow.close(); return undefined; }
async function confirmExit() {
  settleNow();
  if (!isDirty()) return true;
  const choice = await ask({ kind: 'exit', icon: 'save', title: t('confirm.exitTitle'), message: t('confirm.unsavedMessage'), buttons: [{ id: 'cancel', label: t('common.cancel') }, { id: 'discard', label: t('confirm.exitDiscard'), icon: 'exit', danger: true }, { id: 'save', label: t('confirm.exitSave'), icon: 'save', primary: true }] });
  if (choice === 'save') return saveDoc();
  return choice === 'discard';
}

async function copyText(value) {
  try { await native.clipboardWrite(value); } catch { await navigator.clipboard?.writeText(value).catch(() => {}); }
  notify('success', t('notice.copiedText'));
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
    if (!item.submenu || depth > 3) return item;
    if (item.children) return { ...item, children: withChildren(item.children, handlers, depth + 1) };
    const key = item.id.slice('submenu:'.length);
    const children = SUBMENUS[key] ? menuItems(SUBMENUS[key].items) : null;
    return children ? { ...item, children: withChildren(children, handlers, depth + 1) } : item;
  });
}

async function showMenu(items, anchor, name = 'context', context = {}) {
  state.openMenu = name;
  renderMenubar();
  const header = context.header ?? (MENUS[name] ? { icon: MENU_ICONS[name], title: t(`menu.${name}`) } : { icon: 'markdownFile', title: 'MyMarkDownMaker' });
  context = { ...context, handlers: { ...context.handlers } };
  items = withChildren(items, context.handlers);
  const result = await popups.open('menu', { items, name, header }, { anchor });
  if (state.openMenu === name) { state.openMenu = null; state.lastMenuClose = { name, at: Date.now() }; renderMenubar(); }
  const id = result?.id;
  if (!id) return undefined;
  if (id.startsWith('submenu:')) {
    const key = id.slice('submenu:'.length);
    if (!SUBMENUS[key]) return undefined;
    const at = result.at ?? anchor;
    return showMenu(menuItems(SUBMENUS[key].items), { x: at.x, y: at.y, flipY: at.flipY ?? at.y }, name, { ...context, header: { icon: SUBMENUS[key].icon, title: t(`submenu.${key}`) } });
  }
  if (id.startsWith('custom:')) return context.handlers?.[id]?.();
  return run(id, context);
}

function openMenubarMenu(name) { const el = root.querySelector(`[data-menu="${name}"]`); if (el) showMenu(menuItems(MENUS[name]), anchorBelow(el), name); }

function contextMenu(event, kind, payload = {}) {
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  const view = ['view:edit', 'view:preview', 'view:split'];
  if (kind === 'editor') {
    const hasSel = editor && editor.selectionStart !== editor.selectionEnd;
    const handlers = {
      'custom:cut': async () => { await copyText(editor.selectedText()); editor.insert(''); },
      'custom:copy': () => copyText(editor.selectedText()),
      'custom:paste': async () => { const value = await native.clipboardRead().catch(() => navigator.clipboard?.readText?.() ?? ''); if (value) editor.insert(value); },
    };
    return showMenu([
      { id: 'custom:cut', label: t('action.cut'), icon: 'cut', disabled: !hasSel }, { id: 'custom:copy', label: t('action.copy'), icon: 'copy', disabled: !hasSel },
      { id: 'custom:paste', label: t('action.paste'), icon: 'paste' }, ...menuItems(['selectAllText', '-', 'undo', 'redo', '-', sub('headings'), 'md:bold', 'md:italic', 'md:link', 'md:image', 'md:table', '-', 'find', 'renumber', '-', ...view, '-', 'save', 'print', 'exportMenu']),
    ], anchor, 'context', { handlers, header: { icon: 'editMode', title: t('view.edit') } });
  }
  if (kind === 'preview') {
    const selected = window.getSelection?.().toString() ?? '';
    const handlers = { 'custom:copy': () => copyText(selected), 'custom:copyAll': () => copyText(root.querySelector('#preview')?.innerText ?? '') };
    return showMenu([
      { id: 'custom:copy', label: t('action.copy'), icon: 'copy', disabled: !selected }, { id: 'custom:copyAll', label: t('ctx.copyAll'), icon: 'copy', disabled: !hasText() },
      ...menuItems(['selectAllText', '-', 'zoomIn', 'zoomOut', 'zoomReset', '-', ...view, '-', 'save', 'print', sub('exportAs')]),
    ], anchor, 'context', { header: { icon: 'preview', title: t('view.preview') } });
  }
  if (kind === 'file') {
    const f = state.doc?.files.find((x) => x.id === payload.id);
    const index = state.doc?.files.indexOf(f) ?? -1;
    if (!f) return undefined;
    const handlers = {
      'custom:toggle': () => toggleFile(f.id), 'custom:up': () => moveFile(index, -1), 'custom:down': () => moveFile(index, 1), 'custom:remove': () => removeFile(f.id),
      'custom:copyPath': () => copyText(f.fullPath || f.relPath), 'custom:openFile': () => native.openExternal(f.fullPath).catch((error) => showError('error.openExternal', error, f.fullPath)),
    };
    return showMenu([
      { id: 'custom:toggle', label: t(f.checked ? 'files.uncheckThis' : 'files.checkThis'), icon: f.checked ? 'uncheckAll' : 'checkAll' },
      { id: 'custom:up', label: t('files.moveUp'), icon: 'moveUp', disabled: index <= 0 }, { id: 'custom:down', label: t('files.moveDown'), icon: 'moveDown', disabled: index >= state.doc.files.length - 1 },
      { separator: true }, { id: 'custom:copyPath', label: t('files.copyPath'), icon: 'copy' }, { id: 'custom:openFile', label: t('files.openExternal'), icon: 'openFile', disabled: !desktop || !f.fullPath },
      { separator: true }, { id: 'custom:remove', label: t('files.remove'), icon: 'close', danger: true }, ...menuItems(['removeChecked', '-', 'checkAll', 'uncheckAll', '-', 'addFolder', 'addFiles']),
    ], anchor, 'context', { handlers, header: { icon: 'markdownFile', title: f.name } });
  }
  if (kind === 'picture') {
    const figure = payload.figure ?? (payload.pos != null ? figureAtPos(payload.pos) : null);
    return figure ? pictureMenu(anchor, figure) : undefined;
  }
  if (kind === 'heading') {
    const h = derived().structure[payload.index];
    if (!h) return undefined;
    const handlers = { 'custom:goto': () => gotoHeading(h), 'custom:copy': () => copyText(h.text) };
    return showMenu([{ id: 'custom:goto', label: t('ctx.goto'), icon: 'goTo' }, { id: 'custom:copy', label: t('ctx.copyHeading'), icon: 'copy' }, { separator: true }, ...menuItems(['renumber', 'numberHeadings', '-', 'tocPage'])], anchor, 'context', { handlers, header: { icon: 'structureTree', title: h.text } });
  }
  if (kind === 'figure') {
    const f = derived().figures.find((x) => x.index === payload.index);
    if (!f) return undefined;
    const handlers = { 'custom:goto': () => gotoFigure(f), 'custom:copy': () => copyText(f.caption ?? ''), 'custom:full': () => resizeFigure(f, 100), 'custom:half': () => resizeFigure(f, 50) };
    return showMenu([{ id: 'custom:goto', label: t('ctx.goto'), icon: 'goTo' }, { id: 'custom:copy', label: t('ctx.copyCaption'), icon: 'copy', disabled: !f.caption }, { separator: true }, { id: 'custom:full', label: t('figures.sizeFull'), icon: 'figureSize' }, { id: 'custom:half', label: t('figures.sizeHalf'), icon: 'figureSize' }, { separator: true }, ...menuItems(['figurePage'])], anchor, 'context', { handlers, header: { icon: 'figures', title: `${t('figure.label')} ${f.index + 1}` } });
  }
  if (kind === 'log') {
    const e = state.log[payload.index];
    return showMenu([{ id: 'custom:copy', label: t('bottom.copy'), icon: 'copy', disabled: !e }, { separator: true }, ...menuItems(['copyMessages', 'clearMessages', '-', 'bottomPanel'])], anchor, 'context', { handlers: { 'custom:copy': () => copyText(logLine(e)) }, header: { icon: 'info', title: t('bottom.messages') } });
  }
  if (kind === 'bottom') return showMenu(menuItems(['showProblems', 'refreshProblems', '-', 'showMessages', 'showInformation', '-', 'copyMessages', 'clearMessages', '-', 'bottomPanel']), anchor, 'context', { header: { icon: 'panelBottom', title: t('bottom.title') } });
  if (kind === 'left') return showMenu(menuItems(['left:files', 'left:structure', 'left:figures', '-', 'addFolder', 'addFiles', '-', 'checkAll', 'uncheckAll', 'removeChecked', 'clearFiles', '-', 'leftPanel']), anchor, 'context', { header: { icon: 'filesList', title: t('panel.left') } });
  if (kind === 'right') return showMenu(menuItems([sub('pages'), 'docFontUp', 'docFontDown', '-', 'docSettings', 'rightPanel']), anchor, 'context', { header: { icon: 'docProperties', title: t('panel.right') } });
  if (kind === 'start') return showMenu(menuItems(['newDoc', 'openDoc', 'addFolder', 'addFiles', 'openSample', 'recent', '-', 'shuffleBackground', 'backgroundImage', '-', 'tutorial', 'about']), anchor, 'context', { header: { icon: 'home', title: t('action.startPage') } });
  if (kind === 'status') return showMenu(menuItems(['statusBar', 'showInformation', 'showProblems', '-', 'theme', 'language']), anchor, 'context', { header: { icon: 'statusBar', title: t('action.statusBar') } });
  return showMenu(menuItems(['newDoc', 'openDoc', 'addFolder', 'addFiles', '-', 'undo', 'redo', '-', 'leftPanel', 'rightPanel', 'statusBar', '-', 'settings', 'about']), anchor, 'context', { header: { icon: 'markdownFile', title: 'MyMarkDownMaker' } });
}

function textContextMenu(element, event) {
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  const handlers = {
    'custom:cut': () => { element.focus(); document.execCommand('cut'); },
    'custom:copy': () => { element.focus(); document.execCommand('copy'); },
    'custom:paste': async () => { element.focus(); const value = await native.clipboardRead().catch(() => ''); document.execCommand('insertText', false, value ?? ''); },
    'custom:selectAll': () => { element.focus(); element.select?.(); },
  };
  const hasSel = element.selectionStart !== element.selectionEnd;
  return showMenu([
    { id: 'custom:cut', label: t('action.cut'), icon: 'cut', disabled: !hasSel }, { id: 'custom:copy', label: t('action.copy'), icon: 'copy', disabled: !hasSel },
    { id: 'custom:paste', label: t('action.paste'), icon: 'paste' }, { separator: true }, { id: 'custom:selectAll', label: t('action.selectText'), icon: 'selectAll' },
  ], anchor, 'context', { handlers, header: { icon: 'edit', title: t('menu.edit') } });
}

// ───────────────────────── documents (help windows)

async function openDocWindow(kind) {
  const info = DOC_KINDS[kind];
  if (!info) return undefined;
  popups.hideMenu();
  const url = `${location.pathname}?viewer=${kind}&lang=${getLanguage() === 'en' ? 'en' : 'ko'}`;
  if (popups.inline) return openDocFrame(kind, url);
  if (!desktop) { globalThis.open(url, `mymarkdownmaker-${docLabel(kind)}`)?.focus?.(); return undefined; }
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

// ───────────────────────── drag & drop: Markdown files and folders

function setDropActive(active) {
  if (state.dropActive === active) return;
  state.dropActive = active;
  root.classList.toggle('drop-active', active);
}

async function handleDroppedPaths(paths, position = null) {
  // Pictures dropped on the document go into it, where they were dropped (or at the caret).
  const pictures = paths.filter(isPicturePath);
  if (pictures.length && state.doc && !state.showStart) {
    let pos = null;
    if (position && editorShown()) {
      const ratio = window.devicePixelRatio || 1;
      const x = position.x / ratio;
      const y = position.y / ratio;
      const host = root.querySelector('#editor-host').getBoundingClientRect();
      if (x >= host.left && x <= host.right && y >= host.top && y <= host.bottom) pos = editor.posAt(x, y);
    }
    await insertPictureFiles(pictures, pos);
  }
  paths = paths.filter((p) => !isPicturePath(p));
  const files = paths.filter((p) => MD_RE.test(p));
  const others = paths.filter((p) => !MD_RE.test(p));
  for (const dir of others) {
    try { const scanned = await native.scanMarkdown(dir, D().recursive); if (scanned.length) { await addFolderPath(dir); continue; } } catch { /* not a folder */ }
    notify('warning', t('drop.unsupported', { name: baseName(dir) }));
  }
  if (files.length) await addFilePaths(files);
}

// ───────────────────────── events

function bindEvents() {
  root.addEventListener('click', (event) => {
    const target = event.target;
    const menu = target.closest('[data-menu]');
    if (menu) { const name = menu.dataset.menu; if (state.lastMenuClose.name === name && Date.now() - state.lastMenuClose.at < 300) return undefined; return openMenubarMenu(name); }
    if (target.closest('[data-home]')) return toggleStart();
    const start = target.closest('[data-start]');
    if (start && !start.disabled) return onStartAction(start);
    const toolbarMore = target.closest('[data-toolbar-more]');
    if (toolbarMore) return showToolbarMore(toolbarMore);
    const command = target.closest('[data-command]');
    if (command && !command.disabled) {
      const id = command.dataset.command;
      const anchored = ['themeMenu', 'exportMenu', 'openSample'].includes(id);
      return run(id, { anchor: anchored ? anchorBelow(command.closest('.split-button') ?? command) : undefined });
    }
    const windowControl = target.closest('[data-window]');
    if (windowControl) return windowButton(windowControl.dataset.window);
    const leftTab = target.closest('[data-left-tab]');
    if (leftTab) return setLeftTab(leftTab.dataset.leftTab);
    const move = target.closest('[data-file-move]');
    if (move && !move.disabled) { const [i, dir] = move.dataset.fileMove.split(':').map(Number); return moveFile(i, dir); }
    const remove = target.closest('[data-file-remove]');
    if (remove) return removeFile(remove.dataset.fileRemove);
    const heading = target.closest('[data-heading]');
    if (heading) { const h = derived().structure[Number(heading.dataset.heading)]; if (h) gotoHeading(h); return renderLeft(); }
    const figure = target.closest('[data-figure]');
    if (figure && !target.closest('.stepper')) { const f = derived().figures.find((x) => x.index === Number(figure.dataset.figure)); return f ? gotoFigure(f) : undefined; }
    const bottomTab = target.closest('[data-bottom-tab]');
    if (bottomTab) { state.bottomTab = bottomTab.dataset.bottomTab; return renderBottom(); }
    const problemRow = target.closest('[data-problem]');
    if (problemRow) { const p = state.problems[Number(problemRow.dataset.problem)]; if (p?.line != null) return gotoLine(p.line); if (p?.file) setLeftTab('files'); return undefined; }
    const docSet = target.closest('[data-doc-set]');
    if (docSet && !docSet.disabled) return updateDoc({ [docSet.dataset.docSet]: docSet.dataset.value });
    if (target.closest('[data-action="rename-export"]')) return renameExport();
    const auto = target.closest('[data-heading-auto]');
    if (auto && !auto.disabled) return updateDoc({ headingSizes: { ...D().headingSizes, [auto.dataset.headingAuto]: 0 } });
    // A heading clicked in the preview: the size control takes its level.
    const previewHeading = target.closest('#preview .doc-content h1, #preview .doc-content h2, #preview .doc-content h3, #preview .doc-content h4, #preview .doc-content h5');
    if (previewHeading) selectSizeTarget(previewHeading.tagName.toLowerCase());
    const link = target.closest('#preview a[href^="#"]');
    if (link) { event.preventDefault(); const id = link.getAttribute('href').slice(1); root.querySelector(`#preview #${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return undefined; }
    const outside = target.closest('#preview a[href]');
    if (outside) { event.preventDefault(); native.openExternal(outside.href).catch((error) => showError('error.openExternal', error, outside.href)); }
    return undefined;
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target.dataset.fileToggle) return toggleFile(target.dataset.fileToggle);
    if (target.dataset.docToggle) return updateDoc({ [target.dataset.docToggle]: target.checked });
    if (target.dataset.docSelect) return updateDoc({ [target.dataset.docSelect]: target.value });
    if (target.dataset.docText) return updateDoc({ [target.dataset.docText]: target.value });
    if ('sizeTarget' in target.dataset) { state.sizeTarget = target.value; return renderRight(); }
    if ('startToggle' in target.dataset) return updateSettings({ showStartPage: target.checked }, { quiet: true });
    if ('startSpeed' in target.dataset) return updateSettings({ animationSpeed: Number(target.value) }, { quiet: true });
    if ('startOpacity' in target.dataset) return updateSettings({ startCardOpacity: Number(target.value) }, { quiet: true });
    if ('startRandom' in target.dataset) return updateSettings({ animationRandom: target.checked }, { quiet: true });
    if ('startInterval' in target.dataset) { startBackgroundChangedAt = Date.now(); return updateSettings({ animationInterval: Number(target.value) }, { quiet: true }); }
    return undefined;
  });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if ('startSpeed' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}%`; state.settings.animationSpeed = Number(target.value); }
    if ('startOpacity' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}%`; root.querySelector('.start-inner')?.style.setProperty('--start-card-alpha', `${target.value}%`); }
    if (target.matches?.('.start-speed input[type="range"]')) syncSliderSteps(target.parentElement);
  });

  // The start page's sliders: − / + beside them move one step (held down: again and again).
  const sliderStep = (button) => {
    const input = button.parentElement.querySelector('input[type="range"]');
    if (!input) return false;
    const before = input.value;
    input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value) + Number(button.dataset.sliderStep) * Number(input.step || 1))));
    if (input.value === before) return false;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    syncSliderSteps(input.parentElement);
    return true;
  };
  root.addEventListener('pointerdown', (event) => {
    const button = event.target.closest?.('[data-slider-step]');
    if (!button || event.button !== 0 || button.disabled) return;
    event.preventDefault();
    if (!sliderStep(button)) return;
    let timer = setTimeout(function again() { if (sliderStep(button)) timer = setTimeout(again, 90); }, 420);
    const stop = () => { clearTimeout(timer); window.removeEventListener('pointerup', stop, true); window.removeEventListener('pointercancel', stop, true); };
    window.addEventListener('pointerup', stop, true);
    window.addEventListener('pointercancel', stop, true);
  });

  // Dragging a file row by its grip reorders the list.
  root.addEventListener('pointerdown', (event) => {
    const grip = event.target.closest?.('[data-file-grip]');
    if (!grip || event.button !== 0) return;
    event.preventDefault();
    const list = grip.closest('.file-list');
    const from = Number(grip.dataset.fileGrip);
    const rows = [...list.querySelectorAll('.file-row')];
    const row = rows[from];
    let to = from;
    row.classList.add('dragging');
    pointerDrag(event, {
      cursor: 'grabbing',
      move: (dx, dy, e) => {
        to = rows.findIndex((r) => { const rect = r.getBoundingClientRect(); return e.clientY < rect.top + rect.height / 2; });
        if (to < 0) to = rows.length;
        if (to > from) to -= 1;
        for (const r of rows) r.classList.remove('drop-before', 'drop-after');
        const mark = rows[to];
        if (mark) mark.classList.add(to > from ? 'drop-after' : 'drop-before');
      },
      end: (e, moved) => { row.classList.remove('dragging'); for (const r of rows) r.classList.remove('drop-before', 'drop-after'); if (moved) reorderFile(from, Math.max(0, Math.min(rows.length - 1, to))); },
    });
  });

  bindSteppers(root, (key, value) => {
    if (key.startsWith('doc:')) return updateDoc({ [key.slice(4)]: value });
    if (key.startsWith('heading:')) return updateDoc({ headingSizes: { ...D().headingSizes, [key.slice(8)]: value } });
    if (key.startsWith('figure:')) { const f = derived().figures.find((x) => x.index === Number(key.slice(7))); if (f) resizeFigure(f, value); }
    return undefined;
  });

  root.addEventListener('contextmenu', (event) => {
    if (event.target.closest('#editor-host')) return undefined;
    const editable = event.target.closest('input:not([type="range"]):not([type="checkbox"]), textarea');
    if (editable) { event.preventDefault(); return textContextMenu(editable, event); }
    if (event.defaultPrevented) return undefined;
    event.preventDefault();
    const fileRow = event.target.closest('[data-file]');
    if (fileRow) return contextMenu(event, 'file', { id: fileRow.dataset.file });
    const heading = event.target.closest('[data-heading]');
    if (heading) return contextMenu(event, 'heading', { index: Number(heading.dataset.heading) });
    const figure = event.target.closest('[data-figure]');
    if (figure) return contextMenu(event, 'figure', { index: Number(figure.dataset.figure) });
    const logRow = event.target.closest('[data-log]');
    if (logRow) return contextMenu(event, 'log', { index: Number(logRow.dataset.log) });
    if (event.target.closest('#bottom-panel')) return contextMenu(event, 'bottom');
    const previewPicture = event.target.closest('#preview img');
    if (previewPicture) {
      const index = Number(/^fig-(\d+)$/.exec(previewPicture.id ?? '')?.[1] ?? [...root.querySelectorAll('#preview img')].indexOf(previewPicture));
      const figure = derived().figures.find((f) => f.index === index);
      if (figure) return contextMenu(event, 'picture', { figure });
    }
    if (event.target.closest('#preview-scroll')) return contextMenu(event, 'preview');
    if (event.target.closest('#left-panel')) return contextMenu(event, 'left');
    if (event.target.closest('#right-panel')) return contextMenu(event, 'right');
    if (event.target.closest('#start-page')) return contextMenu(event, 'start');
    if (event.target.closest('#statusbar')) return contextMenu(event, 'status');
    return contextMenu(event, 'default');
  });

  root.querySelectorAll('[data-split="left"], [data-split="right"]').forEach((splitter) => splitter.addEventListener('pointerdown', (event) => {
    const side = splitter.dataset.split;
    if ((side === 'left' && !state.settings.showLeftPanel) || (side === 'right' && !state.settings.showRightPanel)) return;
    event.preventDefault();
    const key = side === 'left' ? 'leftWidth' : 'rightWidth';
    const startWidth = state.settings[key];
    pointerDrag(event, {
      cursor: 'col-resize',
      move: (dx) => { const width = Math.max(side === 'left' ? PANEL_MIN.left : PANEL_MIN.right, Math.min(800, startWidth + (side === 'left' ? dx : -dx))); root.style.setProperty(side === 'left' ? '--left-width' : '--right-width', `${width}px`); state.settings[key] = width; },
      end: (e, moved) => { if (moved) { updateSettings({ [key]: state.settings[key] }, { quiet: true }); fitToolbar(); } },
    });
  }));

  root.querySelector('[data-split="center"]')?.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const ws = root.querySelector('#workspace');
    const rect = ws.getBoundingClientRect();
    pointerDrag(event, {
      cursor: 'col-resize',
      move: (dx, dy, e) => { const share = Math.round(Math.max(20, Math.min(80, ((e.clientX - rect.left) / rect.width) * 100))); root.style.setProperty('--split-share', `${share}%`); state.settings.splitShare = share; },
      end: (e, moved) => { if (moved) { updateSettings({ splitShare: state.settings.splitShare }, { quiet: true }); editor?.measure(); } },
    });
  });
  root.addEventListener('dblclick', (event) => { if (event.target.closest?.('[data-split="center"]')) { updateSettings({ splitShare: 50 }, { quiet: true }); root.style.setProperty('--split-share', '50%'); } });

  root.querySelector('[data-split="bottom"]')?.addEventListener('pointerdown', (event) => {
    if (!state.settings.showBottomPanel) return;
    event.preventDefault();
    const startH = state.settings.bottomHeight;
    pointerDrag(event, {
      cursor: 'row-resize',
      move: (dx, dy) => { const h = Math.max(PANEL_MIN.bottom, Math.min(window.innerHeight * 0.6, startH - dy)); root.style.setProperty('--bottom-height', `${h}px`); state.settings.bottomHeight = Math.round(h); },
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

  root.querySelector('#preview-scroll')?.addEventListener('wheel', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    setZoom(state.settings.docZoom + (event.deltaY < 0 ? DOC_ZOOM.step : -DOC_ZOOM.step));
  }, { passive: false });
  root.querySelector('#editor-host')?.addEventListener('wheel', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    setZoom(state.settings.docZoom + (event.deltaY < 0 ? DOC_ZOOM.step : -DOC_ZOOM.step));
  }, { passive: false });

  window.addEventListener('resize', frameThrottle(() => { fitToolbar(); if (desktop && state.minWidth && window.innerWidth < state.minWidth - 1) native.setMinimumSize(state.minWidth, 600).catch(() => {}); }));
  document.addEventListener('keydown', onKeyDown, true);

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) { const previous = state.settings; state.settings = loadSettings(globalThis.localStorage); applySettings(previous); }
    else if (event.key === RECENT_KEY || event.key === RECENT_DIRS_KEY) { state.recent = loadRecent(globalThis.localStorage); state.recentDirs = loadRecentDirs(globalThis.localStorage); if (state.showStart || !state.doc) renderStartPage(); }
  });

  window.addEventListener('beforeunload', (event) => { if (!desktop && isDirty()) { event.preventDefault(); event.returnValue = ''; } });

  if (!desktop) {
    let depth = 0;
    document.addEventListener('dragenter', (event) => { if ([...(event.dataTransfer?.types ?? [])].includes('Files')) { depth += 1; setDropActive(true); event.preventDefault(); } });
    document.addEventListener('dragover', (event) => { event.preventDefault(); });
    document.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) setDropActive(false); });
    document.addEventListener('drop', (event) => {
      event.preventDefault(); depth = 0; setDropActive(false);
      const files = [...(event.dataTransfer?.files ?? [])];
      const pictures = files.filter((f) => f.type.startsWith('image/'));
      if (pictures.length && state.doc && !state.showStart) insertPictureFiles(pictures);
      const rest = files.filter((f) => !f.type.startsWith('image/'));
      if (rest.length) addWebFiles(rest);
    });
  }

  setInterval(() => { const clock = root.querySelector('#status-clock'); if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 15000);
}

/** Ctrl+key shortcuts: [key, shift, command]. */
const SHORTCUTS = [
  ['n', false, 'newDoc'], ['o', false, 'openDoc'], ['o', true, 'addFolder'], ['a', true, 'addFiles'], ['s', false, 'save'], ['s', true, 'saveAs'], ['p', false, 'print'], ['e', false, 'exportMenu'], ['w', false, 'closeDoc'],
  ['z', false, 'undo'], ['y', false, 'redo'], ['z', true, 'redo'], ['f', false, 'find'], ['=', false, 'zoomIn'], ['+', false, 'zoomIn'], ['+', true, 'zoomIn'], ['-', false, 'zoomOut'], ['0', false, 'zoomReset'],
  [',', false, 'settings'], ['l', true, 'language'], ['!', true, 'leftPanel'], ['1', true, 'leftPanel'], ['@', true, 'rightPanel'], ['2', true, 'rightPanel'],
  ['q', false, 'exit'], ['h', true, 'startPage'], ['b', true, 'shuffleBackground'], ['r', false, 'recent'], ['j', false, 'bottomPanel'],
];

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  if (tutorial?.active && key === 'escape') { event.preventDefault(); tutorial.stop(); return; }
  const inEditor = Boolean(event.target.closest?.('#editor-host'));
  const editing = !inEditor && event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = event.ctrlKey || event.metaKey;
  if (event.altKey && !mod && ['1', '2', '3'].includes(key) && hasDoc()) { event.preventDefault(); run(['view:edit', 'view:preview', 'view:split'][Number(key) - 1]); return; }
  if (mod && !event.altKey) {
    if (editing && ['x', 'c', 'v', 'z', 'y', 'a'].includes(key)) return;
    // In the editor its own keys win (Ctrl+B, Ctrl+1…5 …, editor.js); Ctrl+F opens its find panel.
    if (inEditor && (['b', 'i', 'k', 'x', 'c', 'v', 'a'].includes(key) || (!event.shiftKey && ['1', '2', '3', '4', '5'].includes(key)))) return;
    if (inEditor && key === 'f') return;
    const shortcut = SHORTCUTS.find(([k, shift]) => k === key && shift === event.shiftKey);
    if (shortcut) { event.preventDefault(); event.stopPropagation(); run(shortcut[2]); }
    return;
  }
  if (key === 'f1') { event.preventDefault(); run('about'); return; }
  if (key === 'f5') { event.preventDefault(); run('remerge'); return; }
  if (key === 'f7') { event.preventDefault(); run('renumber'); return; }
  if (key === 'f11') { event.preventDefault(); run('tutorial'); return; }
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
  popups.on('print-content', () => sendPrintContent());
  popups.on('choose-logo', () => chooseLogo());
  popups.on('print-run', (job) => runPrint(job));
  popups.on('raise-test-panic', () => native.invoke('raise_test_panic').catch((error) => showError('error.unexpected', error)));
}

// ───────────────────────── tutorial

let tutorial = null;
async function startTutorial(options = {}) {
  tutorial ??= new Tutorial(appApi, root.querySelector('#tutorial-layer'));
  state.tutorial = tutorial;
  updateSettings({ tutorialOffered: true }, { quiet: true });
  await tutorial.start(options);
}

// ───────────────────────── start-up

/** What the start page reads. */
const panelApi = {
  state, commands, commandTip, commandEnabled, t, desktop,
  settings: () => state.settings,
  version: () => state.info?.version ?? VERSION,
};

/** What the tutorial and tests use. */
const appApi = {
  state, t, run, commands, popups, notify, showError, showStartPage, updateSettings, renderAll, ask, history,
  settings: () => state.settings, anchorBelow, openMenubarMenu, showMenu, openDocWindow, closeDocFrames, withProgress, setLeftTab, setCenterTab,
  version: () => state.info?.version ?? VERSION,
  // The tutorial keeps the user's document: it swaps in a sample and puts the user's back afterwards.
  takeDoc: () => state.doc,
  putDoc: (d) => { if (d) { state.doc = d; state.showStart = false; history.clear(); if (editor) editor.replaceKeepingView(d.text, 0, 0); cache = { text: null }; renderAll(); textChanged({ generated: false }); } else { state.doc = null; renderAll(); } },
  openTemplate: async (id) => {
    const files = sampleFiles(id, lang()).map((f) => ({ ...f, content: shortenDataImages(f.content), id: `f${(fileSeq += 1)}`, checked: true }));
    state.doc = newDoc({ name: t(`sample.${id}`) });
    state.doc.sourceDir = t(`sample.${id}`);
    state.doc.files = sortFiles(files, D().sortOrder);
    state.showStart = false;
    history.clear();
    await runMerge();
  },
};

async function start() {
  renderShell();
  bindEvents();
  bindPopupActions();
  configurePlatform({ defaultDir: () => state.settings.lastDirectory, dark: () => resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme).dark, title: () => `${exportName()} — MyMarkDownMaker` });
  await popups.init();
  const welcomeLikely = desktop && state.settings.showWelcome && state.settings.showStartPage !== false && !globalThis.__MYMARKDOWNMAKER_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome');
  if (welcomeLikely) popups.prewarm('welcome');
  state.info = await native.appInfo().catch(() => null);
  state.instance = await native.instanceInfo().catch(() => ({ first: true, others: 0 }));
  if (state.settings.animationRandom) updateSettings({ animation: randomAnimation(state.settings.animation) }, { quiet: true });
  setInterval(tickStartBackground, 1000);
  native.setBackendLanguage(state.settings.language);
  state.showStart = true;
  applySettings({});
  await loadBackground();

  if (desktop) {
    appWindow.onCloseRequested(async (event) => {
      if (state.quitting) return;
      event.preventDefault();
      if (await confirmExit()) { state.quitting = true; persistSession(); await native.quitApp(); }
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
  await restoreSession().catch((error) => showError('error.restore', error));
  const startup = await native.startupFiles().catch(() => []);
  if (startup.length) await handleDroppedPaths(startup);
  state.showStart = !state.doc || (state.settings.showStartPage && !startup.length);
  renderAll();
  if (!state.showStart && ['edit', 'split'].includes(state.settings.centerTab)) setCenterTab(state.settings.centerTab);
  const welcome = state.settings.showWelcome && state.showStart && !globalThis.__MYMARKDOWNMAKER_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome');
  if (welcome) openWelcome();
  else if (welcomeLikely) popups.close('welcome');
  if (desktop) {
    if (!welcome) await appWindow.setFocus();
    const warm = () => { popups.prewarm('menu').then(() => popups.prewarm('progress', { warm: true })); };
    if (welcome) popups.whenDrawn('welcome', 1500).then(() => setTimeout(warm, 200)); else setTimeout(warm, 400);
  }
}

async function openWelcome() {
  updateSettings({ tutorialOffered: true }, { quiet: true });
  const result = await popups.open('welcome', {});
  if (result?.choice === 'tutorial') startTutorial();
  else if (result?.choice === 'sample') openSample('manual');
}

// Test hook: E2E suites and the smoke script drive the app through this.
window.__mymarkdownmaker = {
  state, t, commands, popups, run, history,
  menus: { MENUS, SUBMENUS, enabled: (id) => commandEnabled(id) },
  app: appApi,
  text: () => currentText(),
  editor: () => editor,
  derived: () => derived(),
  actions: { addItems, runMerge, remerge, renumberNow, openSample, setCenterTab, setLeftTab, updateDoc, exportAs, saveDoc, newDocument, undo, redo, toggleFile, moveFile, reorderFile, removeFile, checkAll, settleNow, showStartPage, updateSettings, withProgress },
  domain: { tutorialSteps: () => TUTORIAL_STEPS.length, SAMPLE_IDS },
  tutorial: () => tutorial,
  startBackground: () => startBackground,
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => { if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {}); });
