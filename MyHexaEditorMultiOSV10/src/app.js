// MyHexaMaster main window. The shell is MyHexaMaster's (after MySketchBook): the menu bar (also the title
// bar), the toolbar that folds into », side panels that collapse to rails, the bottom panel, the status bar, the
// start page of movable cards over a moving background, every popup an OS window of its own.
//
// Inside: documents in tabs (hex/editor.js; files, disks and process memory on the desktop, files in the browser),
// each shown by a hex view (hex/hexview.js) or a compare view; the left panel is the explorer, the right panel the
// document's properties (panels/props.js), the bottom panel the log and information. Tools (find, go to, strings,
// disassembler, calculator, recovery, devices, compare, templates, history, file tools) are toolbar buttons that
// open windows of their own (tools/toolwin.js ↔ tools/host.js). Everything that understands bytes is the Rust core.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import APP_ICON from '../assets/icon-256.png';
import { animationPace, ANIMATIONS, PANEL_MIN, RECENT_KEY, SESSION_KEY, STORAGE_KEY, BYTES_PER_ROW, GROUP_SIZES, loadSettings, storeSettings } from './domain/settings.js';
import { addRecent, removeRecent } from './domain/recent.js';
import { SAMPLES, sampleBytes } from './domain/samples.js';
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
import { call as core, fromBase64, loadWasm, onCoreProgress, setLongCallHook, toBase64 } from './core/core.js';
import { openSuggest, isOpen as paletteOpen, promptText, useWindows, fuzzy } from './ui/palette.js';
import { createExplorer } from './panels/explorer.js';
import { createProps, fmtSize, RIGHT_ICONS } from './panels/props.js';
import { createEditor, baseName } from './hex/editor.js';
import { HexView, formatOffset } from './hex/hexview.js';
import { CHARSETS, CHARSET_NAMES } from './hex/charsets.js';
import { createToolHost, userTemplates } from './tools/host.js';
import { createTextEditor } from './hex/textmode.js';
import { configurePlatform, printDirect, printDocument, printToPdfFile } from './lib/platform.js';
import './hex/hex.css';
import './app.css';

const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const APP_NAME = 'MyHexaMaster';
const h = escapeHtml;

const loadJson = (key, fallback) => { try { return JSON.parse(globalThis.localStorage?.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; } };
const saveJson = (key, value) => { try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* full or private */ } };

const state = {
  settings: loadSettings(globalThis.localStorage),
  recent: loadJson(RECENT_KEY, []),
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
  toolbarHidden: [],
  backgroundUrl: null,
  builtins: [],
};
const settings = () => state.settings;
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
  if (/^cancelled$/i.test(message)) { notify('info', t('notice.cancelled')); return undefined; }
  const detail = error?.stack && !String(error.stack).startsWith(message) ? error.stack : '';
  console.error(titleKey, error);
  notify('error', `${t(titleKey)}: ${message}`, [context, detail].filter(Boolean).join('\n'));
  const info = state.info;
  return popups.open('error', { title: t(titleKey), message, detail, context, time: new Date().toLocaleString(), app: info ? `${info.name} ${info.version} (${info.web ? 'web' : `${info.os}/${info.arch}`}, ${info.commit})` : `${APP_NAME} ${VERSION}` });
}

window.addEventListener('error', (event) => { if (/^ResizeObserver loop/.test(String(event.message ?? ''))) return; if (event.error || event.message) showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''); });
window.addEventListener('unhandledrejection', (event) => { if (/cancel|abort/i.test(String(event.reason?.message ?? event.reason))) return; showError('error.unexpected', event.reason); });

// ───────────────────────── documents (hex/editor.js), properties, tools

const editor = createEditor({
  desktop, settings, notify, showError,
  updateSettings: (patch, options) => updateSettings(patch, options),
  ask: (params) => ask(params),
  withProgress: (...args) => withProgress(...args),
  rendered: ({ structure = false } = {}) => { if (structure) { if (editor.tabs.length && onStart()) state.showStart = false; renderAll(); } else { renderPanels(); renderStatus(); } },
  opened: (tab) => documentOpened(tab),
  docChanged: (tab) => { if (tab === editor.active()) { props.caretMoved(); scheduleChrome(); } else renderTabs(); },
  caretMoved: (tab) => { if (tab === editor.active()) { props.caretMoved(); scheduleChrome(); popups.post('disasm', { type: 'tool-caret', offset: tab.view.caret }); } },
  contextMenu: (event, tab) => hexContextMenu(event, tab),
  viewScrolled: (tab, view) => syncCompareScroll(tab, view),
  remember: (tab) => rememberRecent(tab),
});
const activeTab = () => editor.active();
const activeDoc = () => editor.activeDoc();
const activeView = () => editor.activeView();
const hasDoc = () => Boolean(activeTab()?.view);
const writable = () => hasDoc() && !activeDoc().readonly;
const resizable = () => writable() && activeDoc().resizable;
const hasSelection = () => (activeView()?.selection().length ?? 0) > 0;

let chromeTimer = 0;
function scheduleChrome() { clearTimeout(chromeTimer); chromeTimer = setTimeout(() => { renderTabs(); renderToolbarState(); renderStatus(); if (settings().rightTab !== 'inspector') renderRight(); else if (settings().showRightPanel) renderRightSoon(); }, 40); }
let rightTimer = 0;
function renderRightSoon() { clearTimeout(rightTimer); rightTimer = setTimeout(renderRight, 70); }

const props = createProps({
  editor, settings, notify, showError, popups, withProgress: (...a) => withProgress(...a),
  updateSettings: (patch, options) => updateSettings(patch, options),
  copyText: (text) => copyText(text), rerender: () => renderRight(), promptText: (o) => promptText(o),
  runTemplate: (tab, opts) => runTemplate(tab, opts), openTool: (kind, params) => openTool(kind, params),
  templates: () => state.builtins, userTemplates: () => userTemplates(),
  panelTemplate: () => root.querySelector('[data-template-select]')?.value ?? 'auto',
});

const toolHostApp = {
  editor, settings, notify, popups, desktop, ask: (p) => ask(p),
  updateSettings: (patch, options) => updateSettings(patch, options),
  withProgress: (...a) => withProgress(...a), copyText: (text) => copyText(text),
  openCompare: (a, b, mode) => openCompare(a, b, mode), runTemplate: (tab, opts) => runTemplate(tab, opts),
  openDocWindow: (kind) => openDocWindow(kind), openFileDialog: (o) => openFileDialog(o),
};
const toolHost = createToolHost(toolHostApp);

async function documentOpened(tab) {
  rememberRecent(tab);
  notify('success', t('notice.opened', { name: tab.doc.name, size: fmtSize(tab.doc.len) }));
  if (settings().autoTemplate && tab.doc.len) {
    try {
      const det = await core('detect', { id: tab.doc.id });
      tab.doc.detected = det;
      const saved = editor.filePrefs(tab.doc).template;
      const template = saved ?? det.template;
      if (template && template !== 'bin') await runTemplate(tab, { template, quiet: true });
    } catch { /* not every file has a known type */ }
  }
  renderPanels();
}

function rememberRecent(tab) {
  const d = tab.doc;
  if (!d.path && d.source.kind !== 'disk' && d.source.kind !== 'process') return;
  const path = d.source.kind === 'process' ? `process:${d.source.pid}` : d.path;
  state.recent = addRecent(state.recent, { path, title: d.source.label ?? d.name, kind: d.source.kind, size: d.len, at: Date.now() }, 20);
  saveJson(RECENT_KEY, state.recent);
  saveSession();
}

function saveSession() {
  const files = editor.tabs.filter((x) => x.kind === 'hex' && x.doc.source.kind === 'file' && x.doc.path).map((x) => x.doc.path);
  saveJson(SESSION_KEY, { files, at: Date.now() });
}

/** Runs a template (built-in id, user template, or source) on a tab and shows the structure in the right panel. */
async function runTemplate(tab, { template = 'auto', source = null, offset = 0, name = null, quiet = false } = {}) {
  if (!tab?.doc) return null;
  let args = { id: tab.doc.id, offset };
  let label = name;
  if (source) args.source = source;
  else if (template === 'auto') {
    const det = tab.doc.detected ?? await core('detect', { id: tab.doc.id });
    if (!det.template) { if (!quiet) notify('warning', t('template.noneFor', { type: det.name })); return null; }
    args.template = det.template; label = det.template;
  } else if (template.startsWith('user:')) {
    const u = userTemplates().find((x) => x.id === template.slice(5));
    if (!u) return null;
    args.source = u.source; label = u.name;
  } else { args.template = template; label = state.builtins.find((b) => b.id === template)?.name ?? template; }
  const r = await withProgress('progress.template', tab.doc.name, (op) => core('template', args, op), { cancellable: true, delay: 500 });
  tab.doc.template = { ...r, template: source ? 'source' : args.template ?? template, name: label };
  // Colour the template's fields in the hex view (the top level and one level down).
  const marks = [];
  const walk = (nodes, depth) => { for (const n of nodes ?? []) { if (n.color && n.size && n.size <= 65536) marks.push({ start: n.offset, end: n.offset + n.size, color: n.color }); if (depth < 2) walk(n.children, depth + 1); } };
  walk(r.nodes, 0);
  tab.doc.marks.template = marks.slice(0, 20000);
  if (!source && !template.startsWith('user:')) editor.setFilePrefs(tab.doc, { template: args.template });
  tab.view?.schedule();
  props.resetCollapse();
  if (!quiet) { notify(r.errors?.length ? 'warning' : 'success', t('template.done', { name: label ?? '', n: (r.count ?? 0).toLocaleString() })); updateSettings({ rightTab: 'structure', showRightPanel: true }); } else renderRight();
  return r;
}

// ───────────────────────── opening and saving

async function openFileDialog({ activate = true } = {}) {
  try {
    if (desktop) {
      const paths = await native.chooseAnyFiles(settings().lastDirectory, true);
      let last = null;
      for (const path of paths) last = await openFile(path, { activate });
      if (paths[0]) updateSettings({ lastDirectory: paths[0].replace(/[\\/][^\\/]*$/, '') }, { quiet: true });
      return last;
    }
    const picked = await native.pickOpenWeb(true);
    let last = null;
    for (const { file, handle } of picked) last = await withProgress('progress.open', file.name, (op, report) => editor.openWebFile(file, handle, report), { delay: 150 });
    return last;
  } catch (error) { showError('error.open', error); return null; }
}

async function openFile(path, { readonly = false, activate = true } = {}) {
  try {
    const before = editor.activeId;
    const tab = await withProgress('progress.open', baseName(path), () => editor.openPath(path, { readonly }));
    if (!activate && before) editor.activate(before);
    return tab;
  } catch (error) { showError('error.open', error, path); return null; }
}

async function openRecent(entry) {
  if (entry.kind === 'disk') return editor.openDisk({ path: entry.path, name: entry.title }).catch((e) => showError('error.open', e, entry.path));
  if (entry.kind === 'process') return editor.openProcess({ pid: Number(String(entry.path).replace('process:', '')), name: entry.title }).catch((e) => showError('error.open', e, entry.path));
  if (!desktop) { notify('info', t('recent.webReopen')); return openFileDialog(); }
  return openFile(entry.path);
}

function forgetRecent(path) { state.recent = removeRecent(state.recent, path); saveJson(RECENT_KEY, state.recent); renderStartPage(); }
function clearRecentAll() { state.recent = []; saveJson(RECENT_KEY, []); notify('success', t('notice.recentCleared')); renderStartPage(); }

async function openSample(id) {
  try {
    const sample = SAMPLES.find((x) => x.id === id);
    if (!sample) return null;
    const bytes = await sampleBytes(id);
    return editor.openBytesAs(bytes, sample.file);
  } catch (error) { showError('error.open', error, id); return null; }
}

async function newFile() {
  try { await editor.newDocument(0); } catch (error) { showError('error.open', error); }
}

async function newFileSized() {
  const r = await popups.open('form', { title: t('action.newSized'), icon: 'fileNew', fields: [
    { key: 'size', type: 'text', label: t('form.size'), value: '256', icon: 'ruler', hint: t('form.sizeHint') },
    { key: 'mode', type: 'select', label: t('fill.mode'), value: 'zero', icon: 'fill', options: [['zero', t('fill.zero')], ['pattern', t('fill.pattern')], ['random', t('fill.random')], ['increment', t('fill.increment')]] },
    { key: 'pattern', type: 'text', label: t('fill.patternHex'), value: 'FF', icon: 'hexCode', when: { mode: 'pattern' } },
  ] });
  if (!r?.values) return;
  const size = parseNumber(r.values.size);
  if (!Number.isFinite(size) || size < 0) return notify('warning', t('form.badNumber', { value: r.values.size }));
  const tab = await editor.newDocument(0);
  if (size) await editor.edit(tab.doc, 'fill', { offset: 0, length: size, insert: true, mode: r.values.mode, pattern: hexToB64(r.values.pattern), seed: Date.now() });
}

async function saveAll() { for (const tab of editor.tabs.filter((x) => x.kind === 'hex' && x.doc.modified)) if (!(await editor.save(tab))) return false; return true; }

// ───────────────────────── editing helpers

const parseNumber = (text) => {
  const s = String(text ?? '').trim().replace(/[_\s]/g, '').toLowerCase();
  if (!s) return NaN;
  const mult = /[kmg]$/.test(s) ? { k: 1024, m: 1048576, g: 1073741824 }[s.slice(-1)] : 1;
  const body = mult > 1 ? s.slice(0, -1) : s;
  const n = /^0x/.test(body) ? parseInt(body.slice(2), 16) : /h$/.test(body) ? parseInt(body.slice(0, -1), 16) : /^\d+(\.\d+)?$/.test(body) ? Number(body) : NaN;
  return Math.round(n * mult);
};
const hexToB64 = (text) => { const d = String(text ?? '').replace(/0x/gi, '').replace(/[^0-9a-f]/gi, ''); return toBase64(Uint8Array.from(d.match(/../g) ?? [], (x) => parseInt(x, 16))); };

/** The range an operation works on: the selection, else the whole document (after asking for large ranges). */
function opRange({ whole = true } = {}) {
  const view = activeView();
  const sel = view.selection();
  if (sel.length) return { offset: sel.start, length: sel.length };
  return whole ? { offset: 0, length: activeDoc().len } : { offset: view.caret, length: 0 };
}

async function selectAll() { const v = activeView(); if (v) v.select(0, activeDoc().len, { reveal: false }); }

async function selectBlock() {
  const v = activeView();
  const sel = v.selection();
  const r = await popups.open('form', { title: t('action.selectBlock'), icon: 'selectBlock', fields: [
    { key: 'start', type: 'text', label: t('form.start'), value: `0x${(sel.length ? sel.start : v.caret).toString(16).toUpperCase()}`, icon: 'locate' },
    { key: 'how', type: 'segmented', label: t('form.endBy'), value: 'length', options: [['length', t('form.length')], ['end', t('form.end')]] },
    { key: 'value', type: 'text', label: t('form.lengthOrEnd'), value: sel.length ? String(sel.length) : '16', icon: 'ruler', hint: t('form.sizeHint') },
  ] });
  if (!r?.values) return;
  const start = parseNumber(r.values.start);
  const v2 = parseNumber(r.values.value);
  if (!Number.isFinite(start) || !Number.isFinite(v2)) return notify('warning', t('form.badNumber', { value: `${r.values.start} / ${r.values.value}` }));
  const end = r.values.how === 'end' ? v2 + 1 : start + v2;
  v.select(start, end, { center: true });
}

async function fillDialog({ insert = false } = {}) {
  const v = activeView();
  const sel = v.selection();
  const r = await popups.open('form', { title: t(insert ? 'action.insertBytes' : 'action.fill'), icon: insert ? 'byteInsert' : 'fill', fields: [
    { key: 'length', type: 'text', label: t('form.count'), value: String(sel.length || 16), icon: 'ruler', hint: t('form.sizeHint') },
    { key: 'mode', type: 'select', label: t('fill.mode'), value: 'pattern', icon: 'fill', options: [['pattern', t('fill.pattern')], ['zero', t('fill.zero')], ['random', t('fill.random')], ['increment', t('fill.increment')]] },
    { key: 'pattern', type: 'text', label: t('fill.patternHex'), value: '00', icon: 'hexCode', when: { mode: 'pattern' } },
    { key: 'start', type: 'text', label: t('fill.start'), value: '0', icon: 'hash', when: { mode: 'increment' } },
    { key: 'step', type: 'text', label: t('fill.step'), value: '1', icon: 'hash', when: { mode: 'increment' } },
    { key: 'width', type: 'select', label: t('form.width'), value: '1', icon: 'ruler', options: [['1', '1'], ['2', '2'], ['4', '4'], ['8', '8']], when: { mode: 'increment' } },
  ] });
  if (!r?.values) return;
  const length = parseNumber(r.values.length);
  if (!Number.isFinite(length) || length <= 0) return notify('warning', t('form.badNumber', { value: r.values.length }));
  const offset = sel.length && !insert ? sel.start : v.caret;
  const doc = activeDoc();
  if (!insert && offset + length > doc.len && !doc.resizable) return notify('warning', t('edit.fixedSize'));
  const res = await editor.edit(doc, 'fill', { offset, length, insert, mode: r.values.mode, pattern: hexToB64(r.values.pattern), start: parseNumber(r.values.start) || 0, step: parseNumber(r.values.step) || 1, width: Number(r.values.width), endian: settings().endian, seed: Date.now() });
  if (res) v.select(offset, offset + length);
}

async function deleteSelection() {
  const v = activeView();
  const sel = v.selection();
  if (!sel.length) return;
  if (!activeDoc().resizable) return notify('warning', t('edit.fixedSize'));
  await editor.edit(activeDoc(), 'delete', { offset: sel.start, length: sel.length });
  v.setCaret(sel.start);
}

async function operationDialog(op) {
  const lists = await core('operations');
  const v = activeView();
  const range = opRange();
  const info = lists.operations.find((x) => x.id === op);
  const r = await popups.open('form', { title: t(`op.${op}`), icon: 'operation', message: t('op.range', { range: rangeText(range) }), fields: [
    ...(info?.operand ? [{ key: 'operand', type: 'text', label: t(['shl', 'shr', 'rol', 'ror'].includes(op) ? 'op.bits' : 'op.operand'), value: op === 'xor' ? 'FF' : '1', icon: 'hash', hint: t('op.operandHint') }] : []),
    ...(info?.width ? [{ key: 'width', type: 'segmented', label: t('form.width'), value: '1', options: [['1', '8 bit'], ['2', '16 bit'], ['4', '32 bit'], ['8', '64 bit']] }, { key: 'endian', type: 'segmented', label: t('settings.endian'), value: settings().endian, options: [['le', t('endian.le')], ['be', t('endian.be')]] }] : []),
  ], okLabel: t('common.apply') });
  if (!r?.values) return;
  const res = await withProgress('progress.operation', activeDoc().name, () => editor.edit(activeDoc(), 'operation', { ...range, op, operand: r.values.operand ?? '', width: Number(r.values.width ?? 1), endian: r.values.endian ?? settings().endian }));
  if (res) v.select(res.offset, res.offset + res.length);
}

async function quickOperation(op, width = 1) {
  const range = opRange();
  const res = await editor.edit(activeDoc(), 'operation', { ...range, op, width, endian: settings().endian });
  if (res) activeView().select(res.offset, res.offset + res.length);
}

const rangeText = (r) => (r.length === activeDoc()?.len && r.offset === 0 ? t('scope.all') : t('scope.range', { from: `${r.offset.toString(16).toUpperCase()}h`, n: r.length.toLocaleString() }));

/** Encryption, compression, encodings on the selection (or the whole document): into place or into a new tab. */
async function transformDialog(kind) {
  const lists = await core('operations');
  const info = lists.transforms.find((x) => x.id === kind) ?? {};
  const range = opRange();
  const r = await popups.open('form', { title: t(`tr.${kind}`), icon: info.group === 'crypto' ? (/Decrypt/.test(kind) ? 'decrypt' : 'encrypt') : info.group === 'compression' ? (/Decompress/.test(kind) ? 'decompress' : 'compress') : 'encode', message: t('op.range', { range: rangeText(range) }), fields: [
    ...(info.key ? [{ key: 'key', type: 'text', label: t('tr.key'), value: '', icon: 'lock', placeholder: t('tr.keyHint') }, { key: 'keyText', type: 'check', label: t('tr.keyText'), value: false }] : []),
    ...(info.modes?.length ? [{ key: 'mode', type: 'segmented', label: t('tr.mode'), value: info.modes.includes('cbc') ? 'cbc' : info.modes[0], options: info.modes.map((m) => [m, m.toUpperCase()]) }] : []),
    ...(info.iv && info.modes?.length ? [{ key: 'iv', type: 'text', label: t('tr.iv'), value: '', icon: 'hash', placeholder: t('tr.ivHint'), when: { mode: ['cbc', 'ctr'] } }, { key: 'padding', type: 'segmented', label: t('tr.padding'), value: 'pkcs7', options: [['pkcs7', 'PKCS#7'], ['none', t('tr.noPadding')]] }] : []),
    ...(info.iv && !info.modes?.length ? [{ key: 'iv', type: 'text', label: t('tr.nonce'), value: '', icon: 'hash', placeholder: t('tr.nonceHint') }] : []),
    ...(info.group === 'compression' && /Compress$/.test(kind) ? [{ key: 'level', type: 'select', label: t('tr.level'), value: '6', icon: 'compress', options: Array.from({ length: 11 }, (_, i) => [String(i), String(i)]) }] : []),
    { key: 'target', type: 'segmented', label: t('tr.target'), value: info.group === 'compression' && /Decompress/.test(kind) ? 'new' : 'replace', options: [['replace', t('tr.replace')], ['new', t('tr.newTab')]] },
  ], okLabel: t('common.apply') });
  if (!r?.values) return;
  const args = { ...range, kind, key: r.values.key ?? '', keyText: Boolean(r.values.keyText), iv: r.values.iv ?? '', mode: r.values.mode, padding: r.values.padding, level: Number(r.values.level ?? 6), target: r.values.target, name: `${activeDoc().name}.${kind}` };
  try {
    const res = await withProgress('progress.transform', activeDoc().name, () => core('transform', { id: activeDoc().id, ...args }));
    if (r.values.target === 'new') { await editor.addDocument(res, { kind: 'memory' }); return; }
    activeDoc().changed(res.info);
    activeView().select(res.offset, res.offset + res.length);
    notify('success', t('tr.done', { name: t(`tr.${kind}`), n: res.length.toLocaleString() }));
  } catch (error) { showError('error.transform', error); }
}

// ───────────────────────── export, import, print

const EXPORT_FORMATS = [
  ['hexdump', 'hexCode'], ['hex', 'hexCode'], ['hexSpaced', 'hexCode'], ['c', 'code'], ['cpp', 'code'], ['csharp', 'code'], ['java', 'code'], ['javascript', 'code'],
  ['python', 'code'], ['rust', 'code'], ['go', 'code'], ['pascal', 'code'], ['vb', 'code'], ['asm', 'cpu'], ['base64', 'encode'], ['base32', 'encode'], ['base85', 'encode'],
  ['uuencode', 'encode'], ['intelhex', 'chip'], ['srec', 'chip'], ['html', 'exportFile'], ['rtf', 'exportFile'], ['markdown', 'exportFile'], ['json', 'code'], ['escaped', 'code'], ['binary', 'bytes'],
];
const EXT_TYPE = { txt: 'txt', hex: 'hex', s19: 'srec', html: 'html', rtf: 'rtf', json: 'json', md: 'md', b64: 'b64', bin: 'bin' };

async function exportAs(format) {
  const doc = activeDoc();
  const range = opRange();
  const list = await core('exportFormats');
  const fmt = list.find((x) => x.id === format) ?? { ext: 'txt', kind: 'text' };
  const name = `${doc.name.replace(/\.[^.]+$/, '')}.${fmt.ext}`;
  try {
    const r = await withProgress('progress.export', name, (op) => core('export', { id: doc.id, ...range, format, uppercase: settings().uppercase, bytesPerLine: Math.min(64, settings().bytesPerRow || 16), name: doc.name.replace(/\.[^.]+$/, ''), encoding: settings().charset, base: range.offset + (settings().baseAddress || 0) }, op));
    const content = r.text != null ? r.text : fromBase64(r.data);
    if (desktop) {
      const path = await native.chooseSavePath(name, [EXT_TYPE[fmt.ext] ?? (fmt.kind === 'text' ? 'src' : 'bin'), 'all']);
      if (!path) return;
      if (typeof content === 'string') await native.writeTextFile(path, content, ''); else await native.writeBase64File(path, toBase64(content), '');
      notify('success', t('notice.exported', { name: baseName(path) }));
    } else {
      await native.saveFileWeb(typeof content === 'string' ? new Blob([content], { type: 'text/plain' }) : content, { name, saveAs: true, mime: typeof content === 'string' ? 'text/plain' : 'application/octet-stream' });
    }
  } catch (error) { showError('error.export', error); }
}

async function exportToClipboard(format) {
  const doc = activeDoc();
  const range = opRange();
  if (range.length > 16 << 20) return notify('warning', t('copy.tooLarge'));
  const r = await core('export', { id: doc.id, ...range, format, uppercase: settings().uppercase, bytesPerLine: 16, name: 'data', encoding: settings().charset, base: range.offset + (settings().baseAddress || 0) });
  if (r.text != null) await copyText(r.text);
}

async function importAs() {
  const r = await popups.open('form', { title: t('action.import'), icon: 'importHex', fields: [
    { key: 'format', type: 'select', label: t('import.format'), value: 'hex', icon: 'importHex', options: (await core('exportFormats')).filter((x) => x.import).map((x) => [x.id, t(`export.${x.id}`), 'importHex']) },
    { key: 'source', type: 'segmented', label: t('import.from'), value: 'clipboard', options: [['clipboard', t('import.clipboard')], ['file', t('import.file')], ['text', t('import.text')]] },
    { key: 'text', type: 'textarea', label: t('import.text'), value: '', rows: 6, when: { source: 'text' } },
    { key: 'target', type: 'segmented', label: t('tr.target'), value: hasDoc() ? 'caret' : 'new', options: [['new', t('tr.newTab')], ['caret', t('import.atCaret')]] },
  ], okLabel: t('action.import') });
  if (!r?.values) return;
  let text = r.values.text;
  try {
    if (r.values.source === 'clipboard') text = await native.clipboardRead().catch(() => navigator.clipboard?.readText?.() ?? '');
    if (r.values.source === 'file') {
      if (desktop) { const [path] = await native.chooseAnyFiles(settings().lastDirectory, false); if (!path) return; text = await native.readTextFile(path, ''); } else { const [p] = await native.pickOpenWeb(false); if (!p) return; text = await p.file.text(); }
    }
    const res = await core('import', { format: r.values.format, text });
    const bytes = fromBase64(res.data);
    if (r.values.target === 'caret' && hasDoc()) {
      const v = activeView();
      await editor.edit(activeDoc(), settings().insertMode ? 'insert' : 'write', { offset: v.caret, data: bytes, kind: 'import' });
      v.select(v.caret, v.caret + bytes.length);
    } else await editor.openBytesAs(bytes, `import.${r.values.format}.bin`);
    notify('success', t('import.done', { n: bytes.length.toLocaleString(), offset: (res.offset ?? 0).toString(16).toUpperCase() }));
  } catch (error) { showError('error.import', error); }
}

/** The print document: a hex dump of the selection or the whole document. */
async function printHtml() {
  const doc = activeDoc();
  const range = opRange();
  const limit = 4 << 20;
  const r = await core('export', { id: doc.id, offset: range.offset, length: Math.min(range.length, limit), format: 'hexdump', uppercase: settings().uppercase, bytesPerLine: 16, encoding: settings().charset, base: range.offset + (settings().baseAddress || 0) });
  const title = `${doc.name} — ${rangeText(range)}${range.length > limit ? ` (${t('print.cut', { n: fmtSize(limit) })})` : ''}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${h(doc.name)}</title><style>
    @page { size: A4; margin: 14mm 12mm; } body { font: 8.6pt/1.35 "Cascadia Mono", Consolas, "D2Coding", monospace; color: #111; }
    h1 { font: 600 11pt "Segoe UI", sans-serif; margin: 0 0 6pt; } p { font: 8pt "Segoe UI", sans-serif; color: #555; margin: 0 0 8pt; } pre { margin: 0; white-space: pre; }
  </style></head><body><h1>${h(title)}</h1><p>${h(`${APP_NAME} v${VERSION} · ${new Date().toLocaleString()} · ${fmtSize(doc.len)}`)}</p><pre>${h(r.text)}</pre></body></html>`;
}

let printJobHtml = null;
async function printDump() {
  try {
    printJobHtml = await printHtml();
    await popups.open('print', { title: activeDoc().name });
  } catch (error) { showError('error.print', error); }
}
async function sendPrintContent() {
  const printers = await native.listPrinters().catch(() => ({ printers: [], defaultPrinter: '', filePrinters: [] }));
  popups.post('print', { type: 'print-content', html: printJobHtml ?? (hasDoc() ? await printHtml() : '<p></p>'), printers });
}
async function runPrint(job) {
  try {
    const html = printJobHtml ?? await printHtml();
    if (!desktop || !job.printer) { await printDocument({ html }); return; }
    if ((job.filePrinters ?? []).includes(job.printer) || /pdf|xps/i.test(job.printer)) {
      const path = await native.chooseSavePath(`${activeDoc()?.name ?? 'hexdump'}.pdf`, ['pdf']);
      if (path) { await printToPdfFile({ html, path, widthMm: job.widthMm, heightMm: job.heightMm }); notify('success', t('notice.exported', { name: baseName(path) })); }
      return;
    }
    await printDirect({ html, printer: job.printer, copies: job.copies, widthMm: job.widthMm, heightMm: job.heightMm, pageRanges: job.pageRanges });
    notify('success', t('print.sent', { printer: job.printer }));
  } catch (error) { showError('error.print', error); }
}

// ───────────────────────── compare

async function openCompare(aId, bId, mode = settings().compareMode) {
  const a = editor.tabs.find((x) => x.kind === 'hex' && x.doc.id === aId)?.doc;
  const b = editor.tabs.find((x) => x.kind === 'hex' && x.doc.id === bId)?.doc;
  if (!a || !b) return notify('warning', t('compare.need'));
  const r = await withProgress('progress.compare', `${a.name} ↔ ${b.name}`, (op) => core('compare', { a: a.id, b: b.id, mode, limit: 200000 }, op), { cancellable: true });
  const tab = editor.makeTab(a, 'compare');
  tab.docB = b;
  tab.diffs = r;
  tab.diffIndex = -1;
  markDiffs(tab);
  notify(r.equal ? 'success' : 'info', r.equal ? t('compare.equal') : t('compare.found', { n: r.diffs.length.toLocaleString(), bytes: (r.differentBytes ?? 0).toLocaleString() }));
  renderAll();
  return tab;
}

function markDiffs(tab) {
  const list = tab.diffs.diffs.slice(0, 50000);
  tab.doc.marks.diff = list.filter((d) => d.aLength).map((d) => ({ start: d.aOffset, end: d.aOffset + d.aLength, cls: d.kind === 'delete' ? 'di' : 'df' }));
  tab.docB.marks.diff = list.filter((d) => d.bLength).map((d) => ({ start: d.bOffset, end: d.bOffset + d.bLength, cls: d.kind === 'insert' ? 'di' : 'df' }));
}

async function compareWith(path) {
  const a = activeTab();
  if (!a) return;
  const b = await openFile(path, { activate: false });
  if (b) await openCompare(a.doc.id, b.doc.id);
}

function stepDiff(step) {
  const tab = activeTab();
  if (tab?.kind !== 'compare' || !tab.diffs.diffs.length) return;
  const n = tab.diffs.diffs.length;
  tab.diffIndex = (tab.diffIndex + step + n) % n;
  const d = tab.diffs.diffs[tab.diffIndex];
  tab.view?.select(d.aOffset, d.aOffset + Math.max(1, d.aLength), { center: true });
  tab.viewB?.select(d.bOffset, d.bOffset + Math.max(1, d.bLength), { center: true });
  renderTabBar();
}

let syncing = false;
function syncCompareScroll(tab, view) {
  if (tab.kind !== 'compare' || syncing) return;
  const other = view === tab.view ? tab.viewB : tab.view;
  if (!other) return;
  syncing = true;
  other.scrollToRow(view.topRow);
  syncing = false;
}

// ───────────────────────── text mode (UltraEdit): the document as text

async function toggleTextMode() {
  const tab = activeTab();
  if (!tab || tab.kind !== 'hex') return;
  if (tab.textMode) { tab.textMode = false; tab.textEditor?.destroy(); tab.textEditor = null; renderCenter(); return; }
  if (tab.doc.len > 32 << 20) return notify('warning', t('textMode.tooLarge'));
  const bytes = await tab.doc.read(0, tab.doc.len);
  tab.textValue = await editor.decodeText(bytes, settings().charset);
  tab.textMode = true;
  renderCenter();
}

async function applyText(tab) {
  if (!tab?.textEditor) return;
  const r = await core('encode', { text: tab.textEditor.text(), encoding: ['utf16le', 'utf16be', 'utf8', 'cp1252', 'latin1', 'ascii', 'euc-kr', 'shift_jis', 'ebcdic', 'cp437'].includes(settings().charset) ? settings().charset : 'utf8' }).catch((error) => { showError('error.encode', error); return null; });
  if (!r) return;
  if (!tab.doc.resizable && fromBase64(r.data).length !== tab.doc.len) return notify('warning', t('edit.fixedSize'));
  await editor.edit(tab.doc, 'replace', { offset: 0, length: tab.doc.len, data: r.data, kind: 'text' });
  notify('success', t('textMode.applied'));
}

// ───────────────────────── commands

const toggle = (key) => updateSettings({ [key]: !settings()[key] });
const withView = (fn) => () => { const v = activeView(); if (v) return fn(v, activeDoc()); return undefined; };
const tool = (kind, params = {}) => () => openTool(kind, params);
const isCompare = () => activeTab()?.kind === 'compare';
const opCmd = (op, glyph) => ({ icon: glyph, label: `op.${op}`, enabled: writable, run: () => operationDialog(op) });
const trCmd = (kind, glyph) => ({ icon: glyph, label: `tr.${kind}`, enabled: writable, run: () => transformDialog(kind) });

const commands = {
  // file
  newFile: { icon: 'fileNew', label: 'action.newFile', key: 'Ctrl+N', run: () => newFile() },
  newSized: { icon: 'fileNew', label: 'action.newSized', run: () => newFileSized() },
  open: { icon: 'folderOpen', label: 'action.open', key: 'Ctrl+O', run: () => openFileDialog() },
  openReadonly: { icon: 'lock', label: 'action.openReadonly', hidden: !desktop, run: async () => { const [p] = await native.chooseAnyFiles(settings().lastDirectory, false); if (p) openFile(p, { readonly: true }); } },
  openDisk: { icon: 'disk', label: 'action.openDisk', hidden: !desktop, run: tool('devices', { tab: 'disks' }) },
  openProcess: { icon: 'memory', label: 'action.openProcess', hidden: !desktop, run: tool('devices', { tab: 'processes' }) },
  save: { icon: 'save', label: 'action.save', key: 'Ctrl+S', enabled: () => hasDoc() && activeDoc().modified, run: () => editor.save() },
  saveAs: { icon: 'saveAs', label: 'action.saveAs', key: 'Ctrl+Shift+S', enabled: hasDoc, run: () => editor.save(activeTab(), { as: true }) },
  saveImage: { icon: 'disk', label: 'action.saveImage', hidden: !desktop, enabled: () => hasDoc() && ['disk', 'process'].includes(activeDoc().source.kind), run: () => editor.saveRange(activeDoc(), 0, activeDoc().len, `${(activeDoc().source.label ?? activeDoc().name).replace(/[\\/:*?"<>|]+/g, '_')}.img`) },
  saveAll: { icon: 'saveAll', label: 'action.saveAll', key: 'Ctrl+Alt+S', enabled: () => editor.tabs.some((x) => x.doc.modified), run: () => saveAll() },
  saveSelection: { icon: 'exportFile', label: 'action.saveSelection', enabled: hasSelection, run: () => { const s = activeView().selection(); return editor.saveRange(activeDoc(), s.start, s.length, `${activeDoc().name}.part.bin`); } },
  reload: { icon: 'refresh', label: 'action.reload', hidden: !desktop, enabled: () => hasDoc() && Boolean(activeDoc().path), run: () => editor.reload() },
  close: { icon: 'closeTab', label: 'action.close', key: 'Ctrl+W', enabled: () => Boolean(activeTab()), run: () => editor.close() },
  closeAll: { icon: 'closeAll', label: 'action.closeAll', enabled: () => editor.tabs.length > 0, run: () => editor.closeAll() },
  exportMenu: { icon: 'exportHex', label: 'action.export', enabled: hasDoc, run: (c) => exportMenu(c?.anchor) },
  import: { icon: 'importHex', label: 'action.import', run: () => importAs() },
  print: { icon: 'print', label: 'action.print', key: 'Ctrl+P', enabled: hasDoc, run: () => printDump() },
  revealSystem: { icon: 'folderOpen', label: 'file.revealSystem', hidden: !desktop, enabled: () => Boolean(activeDoc()?.path), run: () => native.openExternal(activeDoc().path.replace(/[\\/][^\\/]*$/, '')) },
  copyPath: { icon: 'copy', label: 'file.copyPath', enabled: () => Boolean(activeDoc()?.path), run: () => copyText(activeDoc().path) },
  startPage: { icon: 'home', label: 'action.startPage', key: 'Ctrl+Shift+H', checked: onStart, run: () => toggleStart() },
  exit: { icon: 'exit', label: 'action.exit', key: isMac ? 'Ctrl+Q' : 'Alt+F4', hidden: !desktop, run: () => requestExit() },
  // edit
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: () => Boolean(activeDoc()?.info.canUndo), run: () => editor.undo() },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: () => Boolean(activeDoc()?.info.canRedo), run: () => editor.redo() },
  cut: { icon: 'cut', label: 'action.cut', key: 'Ctrl+X', enabled: writable, run: () => editor.cut() },
  copy: { icon: 'copy', label: 'action.copy', key: 'Ctrl+C', enabled: hasDoc, run: () => editor.copy() },
  paste: { icon: 'paste', label: 'action.paste', key: 'Ctrl+V', enabled: writable, run: () => editor.paste() },
  ...Object.fromEntries(['hex', 'hexSpaced', 'text', 'c', 'python', 'base64', 'escaped'].map((f) => [`copy:${f}`, { icon: f === 'text' ? 'editorText' : 'copyHex', label: `copy.${f}`, enabled: hasDoc, run: () => editor.copy(f) }])),
  'paste:hex': { icon: 'pasteHex', label: 'paste.hex', enabled: writable, run: () => editor.paste('hex') },
  'paste:text': { icon: 'paste', label: 'paste.text', key: 'Ctrl+Shift+V', enabled: writable, run: () => editor.paste('text') },
  selectAll: { icon: 'selectAll', label: 'action.selectAll', key: 'Ctrl+A', enabled: hasDoc, run: () => selectAll() },
  selectBlock: { icon: 'selectBlock', label: 'action.selectBlock', key: 'Ctrl+B', enabled: hasDoc, run: () => selectBlock() },
  deleteSel: { icon: 'byteDelete', label: 'action.deleteSelection', enabled: () => resizable() && hasSelection(), run: () => deleteSelection() },
  fill: { icon: 'fill', label: 'action.fill', key: 'Ctrl+E', enabled: writable, run: () => fillDialog() },
  insertBytes: { icon: 'byteInsert', label: 'action.insertBytes', key: 'Ctrl+I', enabled: resizable, run: () => fillDialog({ insert: true }) },
  insertMode: { icon: 'insert', label: 'action.insertMode', key: 'Insert', checked: () => settings().insertMode, run: () => toggle('insertMode') },
  readonly: { icon: 'lock', label: 'action.readonly', key: 'Ctrl+R', enabled: hasDoc, checked: () => Boolean(activeDoc()?.readonly), run: async () => {
    const d = activeDoc();
    // A disk opens read-only: unlocking it for writing is confirmed (changes go to the device when saved).
    if (d.readonly && d.source.kind === 'disk' && await ask({ kind: 'unlockDisk', icon: 'warning', title: t('save.diskTitle'), message: t('save.unlockDisk', { name: d.source.label ?? d.name }), buttons: [{ id: 'cancel', label: t('common.cancel'), primary: true }, { id: 'unlock', label: t('save.unlock'), icon: 'unlock', danger: true }] }) !== 'unlock') return;
    d.changed(await core('setReadonly', { id: d.id, readonly: !d.readonly }));
  } },
  history: { icon: 'history', label: 'tool.history', enabled: hasDoc, run: tool('history') },
  // search
  find: { icon: 'search', label: 'tool.find', key: 'Ctrl+F', enabled: hasDoc, run: async () => openTool('find', { value: (await selectionForFind()) ?? undefined }) },
  replace: { icon: 'replace', label: 'action.replace', key: 'Ctrl+H', enabled: writable, run: () => openTool('find', { replace: true }) },
  findNext: { icon: 'findNext', label: 'action.findNext', key: 'F3', enabled: () => hasDoc() && Boolean(toolHost && state.lastSearch()), run: () => toolHost.ops.findNext(state.lastSearch()).then((r) => notify(r.found ? 'info' : 'warning', r.message)) },
  findPrev: { icon: 'findPrev', label: 'action.findPrev', key: 'Shift+F3', enabled: () => hasDoc() && Boolean(state.lastSearch()), run: () => toolHost.ops.findPrev(state.lastSearch()).then((r) => notify(r.found ? 'info' : 'warning', r.message)) },
  goto: { icon: 'goto', label: 'tool.goto', key: 'Ctrl+G', enabled: hasDoc, run: tool('goto') },
  bookmarkToggle: { icon: 'bookmarkAdd', label: 'bookmark.toggle', key: 'Ctrl+D', enabled: hasDoc, run: () => editor.toggleBookmark() },
  bookmarkNext: { icon: 'chevronDown', label: 'bookmark.next', key: 'F2', enabled: () => (activeDoc()?.bookmarks.length ?? 0) > 0, run: () => editor.stepBookmark(1) },
  bookmarkPrev: { icon: 'chevronUp', label: 'bookmark.prev', key: 'Shift+F2', enabled: () => (activeDoc()?.bookmarks.length ?? 0) > 0, run: () => editor.stepBookmark(-1) },
  bookmarks: { icon: 'bookmark', label: 'panel.bookmarks', run: () => showRightTab('bookmarks') },
  // data
  operations: { icon: 'operation', label: 'action.operations', enabled: writable, run: (c) => submenuAt('ops', c?.anchor) },
  ...Object.fromEntries([['xor', 'operation'], ['and', 'operation'], ['or', 'operation'], ['add', 'operation'], ['sub', 'operation'], ['mul', 'operation'], ['div', 'operation'], ['mod', 'operation'], ['shl', 'operation'], ['shr', 'operation'], ['rol', 'operation'], ['ror', 'operation'], ['set', 'fill']].map(([op, g]) => [`op:${op}`, opCmd(op, g)])),
  'op:not': { icon: 'operation', label: 'op.not', enabled: writable, run: () => quickOperation('not') },
  'op:neg': { icon: 'operation', label: 'op.neg', enabled: writable, run: () => quickOperation('neg') },
  'op:reverse': { icon: 'reverse', label: 'op.reverse', enabled: writable, run: () => quickOperation('reverse') },
  'op:bitrev': { icon: 'reverse', label: 'op.bitrev', enabled: writable, run: () => quickOperation('bitrev') },
  'op:nibble': { icon: 'swap', label: 'op.nibble', enabled: writable, run: () => quickOperation('nibble') },
  'op:swap2': { icon: 'swap', label: 'op.swap2', enabled: writable, run: () => quickOperation('swap', 2) },
  'op:swap4': { icon: 'swap', label: 'op.swap4', enabled: writable, run: () => quickOperation('swap', 4) },
  'op:swap8': { icon: 'swap', label: 'op.swap8', enabled: writable, run: () => quickOperation('swap', 8) },
  ...Object.fromEntries([['xorKey', 'encrypt'], ['aesEncrypt', 'encrypt'], ['aesDecrypt', 'decrypt'], ['desEncrypt', 'encrypt'], ['desDecrypt', 'decrypt'], ['tdesEncrypt', 'encrypt'], ['tdesDecrypt', 'decrypt'], ['rc4', 'encrypt'], ['rot13', 'encode'],
    ...['blowfish', 'twofish', 'cast5', 'camellia', 'tea', 'xtea'].flatMap((c) => [[`${c}Encrypt`, 'encrypt'], [`${c}Decrypt`, 'decrypt']]), ['chacha20', 'encrypt'], ['salsa20', 'encrypt'],
    ['zlibCompress', 'compress'], ['zlibDecompress', 'decompress'], ['deflateCompress', 'compress'], ['deflateDecompress', 'decompress'], ['gzipCompress', 'compress'], ['gzipDecompress', 'decompress'],
    ['base64Encode', 'encode'], ['base64Decode', 'encode'], ['hexEncode', 'encode'], ['hexDecode', 'encode'], ['urlEncode', 'encode'], ['urlDecode', 'encode']].map(([k, g]) => [`tr:${k}`, trCmd(k, g)])),
  checksums: { icon: 'hash', label: 'action.checksums', key: 'Ctrl+Shift+K', enabled: hasDoc, run: () => props.runHashes().catch((e) => showError('error.hash', e)) },
  statistics: { icon: 'chartBar', label: 'action.statistics', enabled: hasDoc, run: () => props.runStats().catch((e) => showError('error.stats', e)) },
  extract: { icon: 'newTab', label: 'action.extract', enabled: hasSelection, run: async () => { const s = activeView().selection(); const info = await core('extract', { id: activeDoc().id, offset: s.start, length: s.length, name: `${activeDoc().name} [${s.start.toString(16).toUpperCase()}h]` }); editor.addDocument(info, { kind: 'memory' }); } },
  // tools (toolbar buttons; each opens its window)
  toolFind: { icon: 'search', label: 'tool.find', enabled: hasDoc, run: () => commands.find.run() },
  strings: { icon: 'textStrings', label: 'tool.strings', key: 'Ctrl+Shift+T', enabled: hasDoc, run: tool('strings') },
  disasm: { icon: 'cpu', label: 'tool.disasm', key: 'Ctrl+Shift+D', enabled: hasDoc, run: tool('disasm') },
  calc: { icon: 'calculate', label: 'tool.calc', run: tool('calc') },
  carve: { icon: 'recover', label: 'tool.carve', key: 'Ctrl+Shift+F', enabled: hasDoc, run: tool('carve') },
  devices: { icon: 'drive', label: 'tool.devices', run: tool('devices') },
  compare: { icon: 'compare', label: 'tool.compare', key: 'Ctrl+K', run: tool('compare') },
  template: { icon: 'code', label: 'tool.template', key: 'Ctrl+T', enabled: hasDoc, run: () => openTool('template', { template: activeDoc()?.template?.template }) },
  runTemplate: { icon: 'structureTree', label: 'template.runAuto', enabled: hasDoc, run: () => runTemplate(activeTab(), { template: 'auto' }) },
  filetools: { icon: 'fileTools', label: 'tool.filetools', run: tool('filetools') },
  processor: { icon: 'operation', label: 'tool.processor', run: tool('processor') },
  filesystem: { icon: 'disk', label: 'tool.filesystem', enabled: hasDoc, run: tool('filesystem') },
  yara: { icon: 'shieldCheck', label: 'tool.yara', key: 'Ctrl+Shift+Y', enabled: hasDoc, run: tool('yara') },
  diffNext: { icon: 'diffNext', label: 'compare.next', key: 'F8', enabled: isCompare, run: () => stepDiff(1) },
  diffPrev: { icon: 'diffPrev', label: 'compare.prev', key: 'Shift+F8', enabled: isCompare, run: () => stepDiff(-1) },
  // view
  columnMode: { icon: 'columns', label: 'textMode.columnMode', key: 'Alt+C', enabled: () => Boolean(activeTab()?.textMode), checked: () => Boolean(activeTab()?.columnMode), run: () => { const tb = activeTab(); tb.columnMode = !tb.columnMode; renderTabBar(); } },
  textWrap: { icon: 'textMode', label: 'textMode.wrapLines', enabled: () => Boolean(activeTab()?.textMode), checked: () => Boolean(activeTab()?.textWrap), run: () => { const tb = activeTab(); tb.textWrap = !tb.textWrap; tb.textEditor?.setWrap(tb.textWrap); renderTabBar(); } },
  textMode: { icon: 'textMode', label: 'action.textMode', key: 'Ctrl+M', enabled: () => activeTab()?.kind === 'hex', checked: () => Boolean(activeTab()?.textMode), run: () => toggleTextMode() },
  ...Object.fromEntries(BYTES_PER_ROW.map((n) => [`bpr:${n}`, { icon: 'columns', label: n ? 'view.bprN' : 'view.bprAuto', labelArgs: { n }, checked: () => settings().bytesPerRow === n, run: () => updateSettings({ bytesPerRow: n }) }])),
  ...Object.fromEntries(GROUP_SIZES.map((n) => [`group:${n}`, { icon: 'group', label: 'view.groupN', labelArgs: { n }, checked: () => settings().groupSize === n, run: () => updateSettings({ groupSize: n }) }])),
  ...Object.fromEntries(['hex', 'dec', 'oct'].map((b) => [`offbase:${b}`, { icon: 'hash', label: `base.${b}`, checked: () => settings().offsetBase === b, run: () => updateSettings({ offsetBase: b }) }])),
  ...Object.fromEntries(['hex', 'dec', 'oct', 'bin'].map((b) => [`valbase:${b}`, { icon: b === 'bin' ? 'binary' : 'hexCode', label: `base.${b}`, checked: () => settings().valueBase === b, run: () => updateSettings({ valueBase: b }) }])),
  ...Object.fromEntries(CHARSETS.map((c) => [`charset:${c}`, { icon: 'globe', label: `charset.${c}`, plain: CHARSET_NAMES[c], checked: () => settings().charset === c, run: () => updateSettings({ charset: c }) }])),
  showText: { icon: 'editorText', label: 'view.showText', checked: () => settings().showText, run: () => toggle('showText') },
  showOffsets: { icon: 'lineNumbers', label: 'view.showOffsets', checked: () => settings().showOffsets, run: () => toggle('showOffsets') },
  showHeader: { icon: 'columns', label: 'view.showHeader', checked: () => settings().showHeader, run: () => toggle('showHeader') },
  byteColors: { icon: 'palette', label: 'view.byteColors', checked: () => settings().byteColors, run: () => toggle('byteColors') },
  highlightModified: { icon: 'edit', label: 'view.highlightModified', checked: () => settings().highlightModified, run: () => toggle('highlightModified') },
  crosshair: { icon: 'locate', label: 'view.crosshair', checked: () => settings().crosshair, run: () => toggle('crosshair') },
  uppercase: { icon: 'caseSensitive', label: 'settings.uppercase', checked: () => settings().uppercase, run: () => toggle('uppercase') },
  endianLe: { icon: 'swap', label: 'endian.le', checked: () => settings().endian === 'le', run: () => updateSettings({ endian: 'le' }) },
  endianBe: { icon: 'swap', label: 'endian.be', checked: () => settings().endian === 'be', run: () => updateSettings({ endian: 'be' }) },
  leftPanel: { icon: 'panelLeft', label: 'action.leftPanel', key: 'Ctrl+Shift+1', checked: () => settings().showLeftPanel, run: () => toggle('showLeftPanel') },
  rightPanel: { icon: 'panelRight', label: 'action.rightPanel', key: 'Ctrl+Shift+2', checked: () => settings().showRightPanel, run: () => toggle('showRightPanel') },
  bottomPanel: { icon: 'panelBottom', label: 'action.bottomPanel', key: 'Ctrl+J', checked: () => settings().showBottomPanel, run: () => toggle('showBottomPanel') },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => settings().showStatusBar, run: () => toggle('showStatusBar') },
  ...Object.fromEntries(['inspector', 'structure', 'info', 'hashes', 'stats', 'bookmarks'].map((id) => [`right:${id}`, { icon: RIGHT_ICONS[id], label: `panel.${id}`, checked: () => settings().showRightPanel && settings().rightTab === id, run: () => showRightTab(id) }])),
  ...Object.fromEntries([['messages', 'info'], ['info', 'docProperties']].map(([id, glyph]) => [`bottom:${id}`, { icon: glyph, label: `bottom.${id}`, checked: () => settings().showBottomPanel && settings().bottomTab === id, run: () => showBottomTab(id) }])),
  nextTab: { icon: 'chevronRight', label: 'tab.next', key: 'Ctrl+Tab', hidden: true, run: () => cycleTab(1) },
  prevTab: { icon: 'chevronLeft', label: 'tab.prev', key: 'Ctrl+Shift+Tab', hidden: true, run: () => cycleTab(-1) },
  zoomIn: { icon: 'zoomIn', label: 'action.zoomIn', key: 'Ctrl+=', run: () => updateSettings({ hexFontSize: Math.min(32, settings().hexFontSize + 1) }) },
  zoomOut: { icon: 'zoomOut', label: 'action.zoomOut', key: 'Ctrl+-', run: () => updateSettings({ hexFontSize: Math.max(9, settings().hexFontSize - 1) }) },
  zoomReset: { icon: 'zoomReset', label: 'action.zoomReset', key: 'Ctrl+0', run: () => updateSettings({ hexFontSize: 14 }) },
  fullscreen: { icon: 'fullscreen', label: 'view.fullscreen', key: 'F11', run: () => toggleFullscreen() },
  commandPalette: { icon: 'command', label: 'action.commandPalette', key: 'Ctrl+Shift+P', run: () => commandPalette() },
  // appearance, help
  theme: { icon: 'palette', label: 'action.themeRandom', run: () => updateSettings({ theme: randomThemeId(settings().theme) }) },
  themeMenu: { icon: 'chevronDown', label: 'action.themeChoose', run: (c) => openThemePicker(c?.anchor) },
  language: { icon: 'globe', label: 'action.language', key: 'Ctrl+Shift+L', run: () => updateSettings({ language: getLanguage() === 'ko' ? 'en' : 'ko' }) },
  shuffleBackground: { icon: 'dice', label: 'action.shuffleBackground', key: 'Ctrl+Shift+B', run: () => shuffleBackground() },
  backgroundImage: { icon: 'imageBg', label: 'action.backgroundImage', run: () => chooseBackground() },
  clearBackground: { icon: 'imageClear', label: 'action.clearBackground', enabled: () => Boolean(settings().backgroundImage) || settings().backgroundKind !== 'none', run: () => removeBackground() },
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

state.lastSearch = () => toolHostApp.lastSearch ?? null;

const labelOf = (id) => { const c = commands[id]; return c.plain ?? t(c.label, c.labelArgs ?? null); };
function commandEnabled(id) { const c = commands[id]; return Boolean(c) && (c.enabled ? Boolean(c.enabled()) : true); }
function commandTip(id) {
  const c = commands[id];
  if (!c) return id;
  const tip = t(`tip.${id.replace(':', '.')}`, null, '');
  const on = c.checked && !id.includes(':') && id !== 'startPage' ? ` — ${t(c.checked() ? 'opts.on' : 'opts.off')}` : '';
  return `${labelOf(id)}${c.key ? ` (${keyLabel(c.key)})` : ''}${on}${tip ? ` — ${tip}` : ''}`;
}
async function run(id, context) {
  const c = commands[id];
  if (!c || !commandEnabled(id)) return undefined;
  try { const result = await c.run(context); renderToolbarState(); return result; } catch (error) { return showError('error.command', error, labelOf(id)); }
}

function cycleTab(step) {
  const list = editor.tabs;
  if (list.length < 2) return;
  const i = list.findIndex((x) => x.id === editor.activeId);
  editor.activate(list[(i + step + list.length) % list.length].id);
}

async function toggleFullscreen() {
  if (desktop) { const on = await appWindow.isFullscreen(); await appWindow.setFullscreen(!on); return; }
  if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen?.();
}

async function selectionForFind() {
  const v = activeView();
  const sel = v?.selection();
  if (!sel?.length || sel.length > 64) return null;
  const bytes = await activeDoc().read(sel.start, sel.length);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function openTool(kind, params = {}) {
  popups.hideMenu();
  return popups.open(kind, params);
}

async function commandPalette() {
  const items = Object.keys(commands).filter((id) => !commands[id].hidden && commandEnabled(id)).map((id) => ({ id, label: labelOf(id), icon: commands[id].icon, kbd: commands[id].key ? keyLabel(commands[id].key) : '' }));
  const item = await openSuggest({ placeholder: t('palette.commands'), icon: 'command', items: (q) => items.map((x) => ({ ...x, positions: fuzzy(q, x.label) })).filter((x) => x.positions) });
  if (item) run(item.id);
}

// ───────────────────────── menus

const SUBMENUS = {
  openMore: { icon: 'folderOpen', items: ['openReadonly', 'openDisk', 'openProcess', 'saveImage', '-', 'newSized'] },
  exportAs: { icon: 'exportHex', items: ['exportMenu', 'saveSelection', 'import', '-', 'print'] },
  copyAs: { icon: 'copyHex', items: ['copy:hex', 'copy:hexSpaced', 'copy:text', 'copy:c', 'copy:python', 'copy:base64', 'copy:escaped'] },
  pasteAs: { icon: 'pasteHex', items: ['paste:hex', 'paste:text'] },
  ops: { icon: 'operation', items: ['op:xor', 'op:and', 'op:or', 'op:not', '-', 'op:add', 'op:sub', 'op:mul', 'op:div', 'op:mod', 'op:neg', '-', 'op:shl', 'op:shr', 'op:rol', 'op:ror', '-', 'op:set', 'op:reverse', 'op:bitrev', 'op:nibble'] },
  swaps: { icon: 'swap', items: ['op:swap2', 'op:swap4', 'op:swap8', '-', 'op:reverse'] },
  crypto: { icon: 'encrypt', items: ['tr:xorKey', 'tr:rot13', '-', 'tr:aesEncrypt', 'tr:aesDecrypt', 'tr:desEncrypt', 'tr:desDecrypt', 'tr:tdesEncrypt', 'tr:tdesDecrypt', '-', 'tr:blowfishEncrypt', 'tr:blowfishDecrypt', 'tr:twofishEncrypt', 'tr:twofishDecrypt', 'tr:cast5Encrypt', 'tr:cast5Decrypt', 'tr:camelliaEncrypt', 'tr:camelliaDecrypt', 'tr:teaEncrypt', 'tr:teaDecrypt', 'tr:xteaEncrypt', 'tr:xteaDecrypt', '-', 'tr:rc4', 'tr:chacha20', 'tr:salsa20'] },
  compression: { icon: 'compress', items: ['tr:zlibCompress', 'tr:zlibDecompress', 'tr:deflateCompress', 'tr:deflateDecompress', 'tr:gzipCompress', 'tr:gzipDecompress'] },
  encodings: { icon: 'encode', items: ['tr:base64Encode', 'tr:base64Decode', 'tr:hexEncode', 'tr:hexDecode', 'tr:urlEncode', 'tr:urlDecode'] },
  bytesPerRow: { icon: 'columns', items: BYTES_PER_ROW.map((n) => `bpr:${n}`) },
  grouping: { icon: 'group', items: GROUP_SIZES.map((n) => `group:${n}`) },
  offsetBase: { icon: 'hash', items: ['offbase:hex', 'offbase:dec', 'offbase:oct'] },
  valueBase: { icon: 'hexCode', items: ['valbase:hex', 'valbase:dec', 'valbase:oct', 'valbase:bin'] },
  charset: { icon: 'globe', items: CHARSETS.map((c) => `charset:${c}`) },
  endian: { icon: 'swap', items: ['endianLe', 'endianBe'] },
  columns: { icon: 'columns', items: ['showText', 'showOffsets', 'showHeader', '-', 'byteColors', 'highlightModified', 'crosshair', 'uppercase'] },
  rightTabs: { icon: 'panelRight', items: ['right:inspector', 'right:structure', 'right:info', 'right:hashes', 'right:stats', 'right:bookmarks'] },
  bottomTabs: { icon: 'panelBottom', items: ['bottomPanel', '-', 'bottom:messages', 'bottom:info', '-', 'clearMessages'] },
  zoom: { icon: 'zoomIn', items: ['zoomIn', 'zoomOut', 'zoomReset'] },
  appearance: { icon: 'palette', items: ['theme', 'themeMenu', 'language', '-', 'shuffleBackground', 'backgroundImage', 'clearBackground'] },
  bookmarksMenu: { icon: 'bookmark', items: ['bookmarkToggle', 'bookmarkNext', 'bookmarkPrev', 'bookmarks'] },
};
const sub = (key) => ({ sub: key });
const MENUS = {
  file: ['newFile', 'open', sub('openMore'), '-', 'save', 'saveAs', 'saveAll', 'reload', '-', sub('exportAs'), 'print', '-', 'revealSystem', 'copyPath', '-', 'close', 'closeAll', '-', 'startPage', 'exit'],
  edit: ['undo', 'redo', 'history', '-', 'cut', 'copy', sub('copyAs'), 'paste', sub('pasteAs'), '-', 'selectAll', 'selectBlock', 'deleteSel', '-', 'fill', 'insertBytes', 'insertMode', 'readonly'],
  search: ['find', 'replace', 'findNext', 'findPrev', '-', 'goto', sub('bookmarksMenu'), '-', 'strings', 'carve'],
  view: ['textMode', 'columnMode', 'textWrap', '-', sub('bytesPerRow'), sub('grouping'), sub('offsetBase'), sub('valueBase'), sub('charset'), sub('endian'), sub('columns'), '-', 'leftPanel', 'rightPanel', 'bottomPanel', 'statusBar', sub('rightTabs'), sub('bottomTabs'), '-', sub('zoom'), sub('appearance'), 'fullscreen'],
  data: [sub('ops'), sub('swaps'), '-', sub('crypto'), sub('compression'), sub('encodings'), '-', 'checksums', 'statistics', 'extract'],
  tools: ['toolFind', 'goto', 'strings', 'disasm', 'calc', 'carve', 'filesystem', 'yara', 'devices', '-', 'compare', 'diffNext', 'diffPrev', '-', 'template', 'runTemplate', 'processor', '-', 'history', 'filetools', '-', 'commandPalette'],
  help: ['welcome', 'tutorial', 'tutorialDoc', 'userGuide', 'shortcuts', '-', 'settings', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', search: 'search', view: 'eye', data: 'operation', tools: 'tools', help: 'question' };

// Tools are toolbar buttons (the user's rule): find, go to, strings, disassembler, calculator, recovery, devices,
// compare, template, history, file tools.
const TOOLBAR = [
  ['newFile', 'open', 'save', 'exportMenu', 'print'],
  ['undo', 'redo'],
  ['cut', 'copy', 'paste'],
  ['insertMode', 'fill', 'operations', 'readonly'],
  ['toolFind', 'goto', 'bookmarkToggle'],
  ['strings', 'disasm', 'calc', 'carve', 'filesystem', 'yara', 'devices', 'compare', 'template', 'processor', 'history', 'filetools'],
  ['checksums', 'textMode'],
];
const MENUBAR_PANELS = ['leftPanel', 'bottomPanel', 'rightPanel'];
const TOOLBAR_RIGHT = ['tutorial', 'themeSplit', 'language', 'settings', 'about'];
const TOOLBAR_MAIN = { themeSplit: 'theme' };

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
          <div id="workspace" class="ws-root hex-workspace"></div>
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
  const brand = `<div class="app-brand" data-window-drag title="${h(`${APP_NAME} v${VERSION}`)}"><img class="app-brand-icon" src="${APP_ICON}" alt="" data-window-drag /><span class="app-brand-name" data-window-drag>${APP_NAME}</span><span class="app-brand-version" data-window-drag>v${h(VERSION)}</span></div>`;
  const button = (id, glyph, key) => `<button class="window-button ${id === 'close' ? 'close' : ''}" data-window="${id}" title="${h(t(key))}" aria-label="${h(t(key))}">${icon(glyph)}</button>`;
  const controls = desktop ? `<div class="window-controls">${button('minimize', 'winMinimize', 'window.minimize')}${state.maximized ? button('maximize', 'winRestore', 'window.restore') : button('maximize', 'winMaximize', 'window.maximize')}${button('close', 'winClose', 'window.close')}</div>` : '';
  const project = '<span class="menubar-project" data-window-drag><span class="app-brand-project-name" data-window-drag></span><span class="app-brand-dirty" data-window-drag>●</span></span>';
  const panels = `<div class="menubar-panels" role="group">${MENUBAR_PANELS.map((id) => `<button class="tool-button mini menubar-panel" data-command="${id}" title="${h(commandTip(id))}" aria-label="${h(labelOf(id))}" aria-pressed="${Boolean(commands[id].checked())}">${icon(commands[id].icon)}</button>`).join('')}</div>`;
  menubar.innerHTML = brand + home + Object.keys(MENUS).map((name) => `<button class="menubar-item ${state.openMenu === name ? 'open' : ''}" data-menu="${name}" role="menuitem" aria-haspopup="true" title="${h(t(`menu.${name}`))}">${icon(MENU_ICONS[name])}<span>${h(t(`menu.${name}`))}</span></button>`).join('') + project + `<div class="menubar-drag" data-window-drag></div>${panels}${controls}`;
  renderTitleProject();
}

function renderTitleProject() {
  const box = root.querySelector('.menubar-project');
  if (!box) return;
  const doc = onStart() ? null : activeDoc();
  box.classList.toggle('empty', !doc);
  box.classList.toggle('dirty', Boolean(doc?.modified));
  box.querySelector('.app-brand-project-name').textContent = doc ? doc.name : '';
  box.title = doc ? doc.path ?? doc.source.label ?? doc.name : '';
  const title = `${doc ? `${doc.modified ? '● ' : ''}${doc.name} — ` : ''}${APP_NAME} v${state.info?.version ?? VERSION}`;
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
  for (const type of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(type, () => markTime('myhexa.main.input'), { capture: true, passive: true });
  window.addEventListener('focus', () => markTime('myhexa.main.focus'));
}

let toolbarLanguage = null;
function renderToolbar() {
  const toolbar = root.querySelector('#toolbar');
  toolbarLanguage = getLanguage();
  const plain = (id, extra = '') => `<button class="tool-button ${extra}" data-command="${id}" title="${h(commandTip(id))}" aria-label="${h(labelOf(id))}">${id === 'language' ? switchFlag(getLanguage()) : icon(commands[id].icon)}</button>`;
  const split = (main, arrow, label) => `<span class="split-button">${plain(main)}<button class="tool-button split-arrow" data-command="${arrow}" title="${h(commandTip(arrow))}" aria-label="${h(t(label))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
  const button = (id) => (id === 'themeSplit' ? split('theme', 'themeMenu', 'action.themeChoose') : plain(id));
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
  root.querySelector('#toolbar [data-command="save"]')?.classList.toggle('dirty', Boolean(activeDoc()?.modified));
  renderTitleProject();
}

function updateMinimumWidth() {
  const right = root.querySelector('.toolbar-right');
  if (!right) return;
  requestAnimationFrame(() => {
    const menus = [...root.querySelectorAll('.app-brand, .menubar-item, .menubar-panels, .window-controls')].reduce((sum, el) => sum + el.offsetWidth + 2, 48);
    // Every toolbar button stays visible: the window is never narrower than the whole toolbar.
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

// ───────────────────────── the centre: tabs and views

const TAB_ICONS = { file: 'hexFile', memory: 'hexFile', web: 'hexFile', disk: 'disk', process: 'memory' };
const tabIcon = (tab) => (tab.kind === 'compare' ? 'compare' : TAB_ICONS[tab.doc.source.kind] ?? 'hexFile');
const tabTitle = (tab) => (tab.kind === 'compare' ? `${tab.doc.name} ↔ ${tab.docB.name}` : tab.doc.source.label ?? tab.doc.name);

function renderCenter() {
  const ws = root.querySelector('#workspace');
  if (!ws || onStart()) return;
  const tab = activeTab();
  ws.innerHTML = `<div class="ws-leaf is-active hex-leaf"><div class="ws-tabs"><div class="ws-tab-list" role="tablist"></div>
      <button class="icon-button" data-tab-step="-1" title="${h(t('tabs.left'))}" aria-label="${h(t('tabs.left'))}">${icon('chevronLeft')}</button>
      <button class="icon-button" data-tab-step="1" title="${h(t('tabs.right'))}" aria-label="${h(t('tabs.right'))}">${icon('chevronRight')}</button>
      <button class="icon-button" data-command="newFile" title="${h(commandTip('newFile'))}">${icon('plus')}</button>
      <button class="icon-button" data-command="open" title="${h(commandTip('open'))}">${icon('folderOpen')}</button></div>
    <div class="ws-leaf-body hex-body"></div></div>`;
  renderTabs();
  const body = ws.querySelector('.hex-body');
  if (!tab) {
    body.innerHTML = `<div class="hex-empty"><div class="hint">${icon('hexFile')}<b>${h(t('empty.title'))}</b><span>${h(t('empty.hint'))}</span>
      <div class="tw-line"><button class="button primary" data-command="open">${icon('folderOpen')}<span>${h(t('action.open'))}</span></button><button class="button" data-command="newFile">${icon('fileNew')}<span>${h(t('action.newFile'))}</span></button>${desktop ? `<button class="button" data-command="devices">${icon('drive')}<span>${h(t('tool.devices'))}</span></button>` : ''}</div></div></div>`;
    return;
  }
  if (tab.kind === 'compare') {
    body.innerHTML = `<div class="hex-tab"><div class="hex-tab-bar"></div><div class="compare-panes">
      <div class="compare-side"><div class="compare-side-head">${icon('file')}<b>${h(tab.doc.name)}</b><span class="muted">${h(fmtSize(tab.doc.len))}</span></div><div class="hx-slot" data-side="a"></div></div>
      <div class="compare-side"><div class="compare-side-head">${icon('file')}<b>${h(tab.docB.name)}</b><span class="muted">${h(fmtSize(tab.docB.len))}</span></div><div class="hx-slot" data-side="b"></div></div></div></div>`;
    tab.view?.destroy(); tab.viewB?.destroy();
    tab.view = null;
    editor.mount(tab, body.querySelector('[data-side="a"]'));
    const twin = { ...tab, doc: tab.docB, view: null };
    tab.viewB = editor.mount(twin, body.querySelector('[data-side="b"]'));
    tab.viewB.opts.onCaret = () => { props.caretMoved(); renderStatus(); };
    renderTabBar();
    return;
  }
  if (tab.textMode) {
    body.innerHTML = '<div class="hex-tab"><div class="hex-tab-bar"></div><div class="text-mode"></div></div>';
    tab.textEditor?.destroy();
    tab.textEditor = createTextEditor(body.querySelector('.text-mode'), { text: tab.textValue ?? '', readonly: tab.doc.readonly, columnMode: () => Boolean(tab.columnMode), wrap: Boolean(tab.textWrap), onChange: (value) => { tab.textValue = value; tab.textDirty = true; } });
    renderTabBar();
    tab.textEditor.focus();
    return;
  }
  body.innerHTML = '<div class="hex-tab"><div class="hex-tab-bar"></div><div class="hx-slot"></div></div>';
  tab.view = null;
  editor.mount(tab, body.querySelector('.hx-slot'));
  renderTabBar();
  tab.view.focus();
  props.caretMoved();
}

function renderTabs() {
  const list = root.querySelector('.ws-tab-list');
  if (!list) return;
  const scroll = list.scrollLeft;
  list.innerHTML = editor.tabs.map((tab) => `<div class="ws-tab ${tab.id === editor.activeId ? 'active' : ''}" data-tab="${tab.id}" role="tab" title="${h(tab.doc.path ?? tabTitle(tab))}">${icon(tabIcon(tab))}<span class="ws-tab-title ${tab.doc.modified || tab.docB?.modified ? 'dirty' : ''}">${h(tabTitle(tab))}</span><button class="ws-tab-close" data-tab-close="${tab.id}" title="${h(t('action.close'))}" aria-label="${h(t('action.close'))}">${icon('close')}</button></div>`).join('');
  list.scrollLeft = scroll;
  list.querySelector('.ws-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const [back, fwd] = root.querySelectorAll('[data-tab-step]');
  if (back) { back.disabled = list.scrollLeft <= 0; fwd.disabled = list.scrollLeft + list.clientWidth >= list.scrollWidth - 1; }
  renderTabBar();
}

function renderTabBar() {
  const bar = root.querySelector('.hex-tab-bar');
  const tab = activeTab();
  if (!bar || !tab) return;
  const s = settings();
  const d = tab.doc;
  const chips = [];
  chips.push(`<span class="chip">${icon(tabIcon(tab))}${h(t(`source.${d.source.kind}`))}</span>`);
  chips.push(`<span class="chip">${icon('ruler')}${h(fmtSize(d.len))}</span>`);
  if (d.detected?.id && d.detected.id !== 'unknown') chips.push(`<span class="chip" title="${h(d.detected.details ?? '')}">${icon('fileType')}${h(d.detected.name)}</span>`);
  if (tab.kind === 'compare') {
    const r = tab.diffs;
    chips.push(`<span class="chip ${r.equal ? '' : 'warn'}">${icon('compare')}${h(r.equal ? t('compare.equal') : t('compare.chip', { n: r.diffs.length.toLocaleString(), i: tab.diffIndex + 1 }))}</span>`);
    chips.push(`<button class="icon-button" data-command="diffPrev" title="${h(commandTip('diffPrev'))}">${icon('diffPrev')}</button><button class="icon-button" data-command="diffNext" title="${h(commandTip('diffNext'))}">${icon('diffNext')}</button>`);
  } else {
    chips.push(`<button class="chip ${s.insertMode ? 'warn' : ''}" data-command="insertMode" title="${h(commandTip('insertMode'))}">${icon(s.insertMode ? 'insert' : 'overwrite')}${h(t(s.insertMode ? 'edit.insertShort' : 'edit.overwriteShort'))}</button>`);
    if (d.readonly) chips.push(`<button class="chip warn" data-command="readonly" title="${h(commandTip('readonly'))}">${icon('lock')}${h(t('edit.readonlyShort'))}</button>`);
    if (!d.resizable) chips.push(`<span class="chip">${icon('ruler')}${h(t('edit.fixedShort'))}</span>`);
    if (tab.textMode) {
      chips.push(`<button class="chip ${tab.columnMode ? 'warn' : ''}" data-command="columnMode" title="${h(commandTip('columnMode'))}">${icon('columns')}${h(t('textMode.column'))}</button>`);
      chips.push(`<button class="chip ${tab.textWrap ? 'warn' : ''}" data-command="textWrap" title="${h(commandTip('textWrap'))}">${icon('textMode')}${h(t('textMode.wrap'))}</button>`);
      chips.push(`<button class="button small primary" data-text-apply title="${h(t('textMode.apply'))}">${icon('check')}<span>${h(t('textMode.apply'))}</span></button>`);
    }
  }
  chips.push('<span class="grow"></span>');
  chips.push(`<button class="chip" data-menu-sub="charset" title="${h(t('settings.charset'))}">${icon('globe')}${h(CHARSET_NAMES[s.charset])}</button>`);
  chips.push(`<button class="chip" data-menu-sub="bytesPerRow" title="${h(t('settings.bytesPerRow'))}">${icon('columns')}${h(s.bytesPerRow ? String(s.bytesPerRow) : t('settings.auto'))}</button>`);
  chips.push(`<button class="chip" data-menu-sub="valueBase" title="${h(t('settings.valueBase'))}">${icon('hexCode')}${h(t(`base.${s.valueBase}`))}</button>`);
  chips.push(`<button class="chip" data-menu-sub="endian" title="${h(t('settings.endian'))}">${icon('swap')}${h(t(`endian.${s.endian}Short`))}</button>`);
  bar.innerHTML = chips.join('');
}

// ───────────────────────── panels

const explorer = createExplorer({
  desktop, native, settings: () => settings(), updateSettings: (patch, options) => updateSettings(patch, options),
  vault: () => null, openFile: (path, options) => openFile(path, options), copyText: (text) => copyText(text),
  notify: (kind, text) => notify(kind, text), redraw: () => renderLeft(),
  isOpen: (path) => editor.tabs.some((x) => x.doc.path === path), hasActive: () => hasDoc(), compareWith: (path) => compareWith(path),
  activateTab: (id) => editor.activate(id),
  openDocs: () => editor.tabs.map((x) => ({ tab: x.id, name: tabTitle(x), path: x.doc.path, len: x.doc.len, modified: x.doc.modified, active: x.id === editor.activeId, icon: tabIcon(x) })),
});

function railHtml(side) {
  const key = side === 'left' ? 'leftPanel' : 'rightPanel';
  const tabs = side === 'left' ? [['explorer', 'folderOpen']] : Object.entries(RIGHT_ICONS);
  return `<div class="panel-rail"><button class="rail-button expand" data-command="${key}" title="${h(t(`panel.expand${side === 'left' ? 'Left' : 'Right'}`))}">${icon(side === 'left' ? 'panelLeftOpen' : 'panelRightOpen')}<span class="rail-label">${h(t('panel.expand'))}</span></button>
    ${tabs.map(([id, glyph]) => `<button class="rail-button" data-${side}-tab="${id}" title="${h(t(`panel.${id}`))}">${icon(glyph)}</button>`).join('')}</div>`;
}

function renderLeft() {
  const panel = root.querySelector('#left-panel');
  if (!panel || onStart()) return;
  if (!settings().showLeftPanel) { panel.innerHTML = railHtml('left'); return; }
  const scroll = panel.querySelector('.panel-body')?.scrollTop ?? 0;
  panel.innerHTML = `<div class="panel-header">${icon('folderOpen')}<span class="panel-vault">${h(t('panel.explorer'))}</span>
      <button class="icon-button" data-command="leftPanel" title="${h(t('panel.collapseLeft'))}">${icon('panelLeftClose')}</button></div>
    <div class="panel-body left-explorer">${explorer.html()}</div>`;
  panel.querySelector('.panel-body').scrollTop = scroll;
}

function renderRight() {
  const panel = root.querySelector('#right-panel');
  if (!panel || onStart()) return;
  if (!settings().showRightPanel) { panel.innerHTML = railHtml('right'); return; }
  const tab = settings().rightTab;
  const focused = document.activeElement;
  if (focused && panel.contains(focused) && focused.matches('input, select')) { clearTimeout(renderRight.timer); renderRight.timer = setTimeout(() => { if (!panel.contains(document.activeElement)) renderRight(); }, 500); return; }
  if (!panel.querySelector('.right-shell')) {
    panel.innerHTML = `<div class="right-shell"><div class="panel-header">${icon('panelRight')}<span data-right-title></span><button class="icon-button" data-command="rightPanel" title="${h(t('panel.collapseRight'))}">${icon('panelRightClose')}</button></div>
      <div class="editor-tabs icon-tabs" role="tablist" data-right-tabs></div><div class="panel-body right-body"></div></div>`;
  }
  panel.querySelector('[data-right-title]').textContent = t(`panel.${tab}`);
  panel.querySelector('[data-right-tabs]').innerHTML = Object.entries(RIGHT_ICONS).map(([id, glyph]) => `<button class="editor-tab ${tab === id ? 'active' : ''}" data-right-tab="${id}" role="tab" title="${h(t(`panel.${id}`))}">${icon(glyph)}</button>`).join('');
  const body = panel.querySelector('.right-body');
  const scroll = body.scrollTop;
  body.innerHTML = props.html(tab);
  body.scrollTop = scroll;
  props.afterRender(body);
}

let panelsTimer = 0;
function renderPanels() { clearTimeout(panelsTimer); panelsTimer = setTimeout(() => { renderLeft(); renderRight(); renderStatus(); }, 50); }

function showRightTab(tab) { updateSettings({ rightTab: tab, showRightPanel: true }); if (tab === 'inspector') props.refreshInspector(); }
function showBottomTab(tab) { updateSettings({ bottomTab: tab, showBottomPanel: true }); }

const SEV_ICON = { error: 'error', warning: 'warning', info: 'info', success: 'check' };
function renderBottom() {
  const host = root.querySelector('#bottom-panel');
  if (!host) return;
  const tab = settings().bottomTab;
  const tabs = [['messages', 'info'], ['info', 'docProperties']].map(([id, glyph]) => `<button class="editor-tab ${tab === id ? 'active' : ''}" data-bottom-tab="${id}">${icon(glyph)}<span>${h(t(`bottom.${id}`))}</span>${id === 'messages' ? `<span class="badge">${state.log.length}</span>` : ''}</button>`).join('');
  let body;
  if (tab === 'messages') body = state.log.map((e, i) => `<div class="problem-row sev-${e.kind}" data-log="${i}" title="${h(e.detail || e.text)}">${icon(SEV_ICON[e.kind] ?? 'info')}<span class="problem-text">${h(e.text)}</span><span class="path">${h(e.at.toLocaleTimeString())}</span></div>`).join('') || `<div class="problems-empty">${icon('info')}<span>${h(t('bottom.noMessages'))}</span></div>`;
  else {
    const info = state.info;
    const d = activeDoc();
    const rows = [[t('info.app'), `${APP_NAME} ${info?.version ?? VERSION}`], [t('info.platform'), info ? (info.web ? 'Web' : `${info.os} / ${info.arch}`) : desktop ? 'Desktop' : 'Web'], [t('info.core'), desktop ? t('info.coreNative') : t('info.coreWasm')],
      [t('info.documents'), String(editor.tabs.length)], [t('info.name'), d?.name ?? '—'], [t('info.size'), d ? fmtSize(d.len) : '—'], [t('info.source'), d ? t(`source.${d.source.kind}`) : '—'],
      [t('info.undoSteps'), d ? `${d.info.undoCount ?? 0} / ${d.info.redoCount ?? 0}` : '—'], [t('info.templates'), String(state.builtins.length + userTemplates().length)]];
    body = `<table class="info-table">${rows.map(([k, v]) => `<tr><th>${h(k)}</th><td>${h(String(v))}</td></tr>`).join('')}</table>`;
  }
  host.innerHTML = `<div class="problems-header">${tabs}<span class="grow"></span>${(() => { const open = settings().showBottomPanel; const tip = t(open ? 'bottom.fold' : 'bottom.unfold'); return `<button class="icon-button bottom-fold" data-command="bottomPanel" title="${h(tip)}" aria-label="${h(tip)}" aria-expanded="${open}">${icon(open ? 'panelBottomClose' : 'panelBottomOpen')}</button>`; })()}</div><div class="problems-list bottom-${tab}">${body}</div>`;
}

function renderStatus() {
  const bar = root.querySelector('#statusbar');
  if (!bar) return;
  const s = settings();
  const notice = state.notice;
  const hint = notice?.text ?? t('status.ready');
  const items = [`<span class="status-notice ${notice?.kind ?? 'hint'}" title="${h(hint)}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : 'info')}<span>${h(hint)}</span></span>`];
  const v = activeView();
  const d = activeDoc();
  if (v && !onStart()) {
    const off = (n) => formatOffset(n + (s.baseAddress || 0), s.offsetBase, 8, s.uppercase);
    const sel = v.selection();
    const b = d.byte(v.caret);
    items.push(`<button class="status-item" data-command="goto" title="${h(t('status.offset'))}">${icon('locate')}<span>${h(t('status.at', { hex: off(v.caret), dec: v.caret.toLocaleString() }))}</span></button>`);
    if (sel.length) items.push(`<button class="status-item" data-command="selectBlock" title="${h(t('info.selection'))}">${icon('selectAll')}<span>${h(t('status.selection', { n: sel.length.toLocaleString(), hex: sel.length.toString(16).toUpperCase() }))}</span></button>`);
    if (b !== undefined) items.push(`<span class="status-item" title="${h(t('status.value'))}">${icon('hexCode')}<span>${h(`${b.toString(16).padStart(2, '0').toUpperCase()} · ${b} · ${b.toString(2).padStart(8, '0')}`)}</span></span>`);
    items.push(`<button class="status-item" data-command="right:info" title="${h(t('info.size'))}">${icon('ruler')}<span>${h(fmtSize(d.len))}</span></button>`);
    items.push(`<button class="status-item ${s.insertMode ? 'warn' : ''}" data-command="insertMode" title="${h(commandTip('insertMode'))}"><span>${h(t(s.insertMode ? 'edit.insertShort' : 'edit.overwriteShort'))}</span></button>`);
    if (d.readonly) items.push(`<span class="status-item warn">${icon('lock')}<span>${h(t('edit.readonlyShort'))}</span></span>`);
    items.push(d.modified ? `<span class="status-item warn" title="${h(t('doc.unsaved'))}">${icon('save')}<span>${h(t('doc.unsavedShort'))}</span></span>` : `<span class="status-item">${icon('check')}<span>${h(t('status.savedShort'))}</span></span>`);
    items.push(`<span class="status-item">${icon('globe')}<span>${h(CHARSET_NAMES[s.charset])}</span></span>`);
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
  if (!onStart()) { renderCenter(); renderLeft(); renderRight(); }
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
  host.innerHTML = startPageHtml({ state, settings, version: () => state.info?.version ?? VERSION, desktop, docs: editor.tabs });
  startCards = startBoard(host.querySelector('.start-board'), { saved: settings().startLayout, reduced: Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches), onSave: (layout) => { state.settings.startLayout = layout; storeSettings(globalThis.localStorage, state.settings); } });
  host.querySelector('.start-scroll').scrollTop = scrollTop;
  for (const holder of host.querySelectorAll('.start-speed')) syncSliderSteps(holder);
  const canvas = host.querySelector('.start-bg');
  const carry = startBackground ? { time: startBackground.time, kind: startBackground.kind } : null;
  startBackground?.destroy();
  startBackground = new AnimatedBackground(canvas, { colors: backgroundColors, speed: () => animationPace(settings().animationSpeed), kind: settings().animation, vivid: true });
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

function showStartPage(show = true) { state.showStart = Boolean(show); renderAll(); }
function toggleStart() { return showStartPage(!onStart()); }

async function onStartAction(target) {
  const value = target.dataset.value;
  switch (target.dataset.start) {
    case 'open': return openFileDialog();
    case 'new': return newFile();
    case 'new-sized': return newFileSized();
    case 'disk': return openTool('devices', { tab: 'disks' });
    case 'process': return openTool('devices', { tab: 'processes' });
    case 'compare': return openTool('compare');
    case 'calc': return openTool('calc');
    case 'import': return importAs();
    case 'tool': return run(value);
    case 'sample': return openSample(value);
    case 'open-recent': { const entry = state.recent.find((x) => x.path === value); return entry ? openRecent(entry) : undefined; }
    case 'remove-recent': return forgetRecent(value);
    case 'clear-recent': return clearRecentAll();
    case 'arrange': return startCards?.arrange();
    case 'start-settings': return popups.open('settings', { tab: 'start' });
    case 'settings': return run('settings');
    case 'continue': return editor.tabs.length ? showStartPage(false) : state.recent[0] ? openRecent(state.recent[0]) : openFileDialog();
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
    if (desktop) { const path = await native.chooseImage(settings().lastDirectory); if (path) { const stored = await withProgress('progress.background', baseName(path), (op) => native.importBackground(path, op)); updateSettings({ backgroundImage: stored, backgroundName: baseName(path), backgroundKind: 'image' }); await loadBackground(); } }
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

const VIEW_KEYS = ['bytesPerRow', 'groupSize', 'offsetBase', 'valueBase', 'uppercase', 'charset', 'showText', 'showOffsets', 'showHeader', 'byteColors', 'highlightModified', 'crosshair', 'hexFontSize', 'hexFontFamily', 'hexLineHeight', 'offsetPrefix', 'baseAddress', 'insertMode'];

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
    const right = root.querySelector('#right-panel');
    if (right) right.innerHTML = '';
  }
  if (s.backgroundImage !== previous.backgroundImage) loadBackground();
  if (s.theme !== previous.theme && previous.theme) notify('info', t('notice.theme', { name: themeName(s.theme, getLanguage()) }));
  const viewChanged = VIEW_KEYS.some((k) => previous[k] !== s[k]);
  if (viewChanged) for (const tab of editor.tabs) { tab.view?.applySettings(); tab.viewB?.applySettings(); }
  if (previous.endian !== s.endian) props.refreshInspector();
  // The views keep themselves; the rest of the window is drawn again (not the centre, unless a view setting changed the bar).
  renderMenubar();
  if (toolbarLanguage !== getLanguage()) renderToolbar(); else renderToolbarState();
  root.classList.toggle('no-status', !s.showStatusBar);
  root.classList.toggle('no-left', !s.showLeftPanel);
  root.classList.toggle('no-right', !s.showRightPanel);
  root.classList.toggle('no-bottom', !s.showBottomPanel);
  root.style.setProperty('--bottom-height', `${s.bottomHeight}px`);
  root.style.setProperty('--left-width', `${s.leftWidth}px`);
  root.style.setProperty('--right-width', `${s.rightWidth}px`);
  if (languageChanged || onStart() !== Boolean(root.classList.contains('on-start'))) renderAll();
  else { if (!onStart()) { renderTabBar(); renderLeft(); renderRight(); } else renderStartPage(); renderBottom(); renderStatus(); updateBackgroundState(); }
  updateMinimumWidth();
}

async function openThemePicker(anchor) {
  const element = root.querySelector('.split-button [data-command="themeMenu"]')?.closest('.split-button') ?? root.querySelector('[data-command="themeMenu"]');
  const current = settings().theme;
  const handlers = {};
  const item = (theme, glyph = null) => { const id = `custom:theme:${theme.id ?? theme}`; handlers[id] = () => updateSettings({ theme: theme.id ?? theme }); return { id, label: themeName(theme.id ?? theme, getLanguage()), icon: glyph ?? 'palette', swatch: theme.swatch ?? null, checked: current === (theme.id ?? theme) }; };
  handlers['custom:theme-edit'] = () => popups.open('settings', { tab: 'appearance', themeGroup: 'custom' });
  handlers['custom:theme-random'] = () => updateSettings({ theme: randomThemeId(current) });
  const items = [
    { columns: [[item(customTheme(settings().customTheme), 'palette')], [{ id: 'custom:theme-edit', label: t('theme.customSettings'), icon: 'gear' }]], row: true }, { separator: true },
    { columns: [DARK_THEMES.map((x) => item(x)), LIGHT_THEMES.map((x) => item(x))], heads: [t('theme.darkGroup', { count: DARK_THEMES.length }), t('theme.lightGroup', { count: LIGHT_THEMES.length })], headIcons: ['moon', 'sun'] },
    { separator: true }, { id: 'custom:theme-random', label: t('action.themeRandom'), icon: 'dice' },
  ];
  await showMenu(items, anchor ?? anchorBelow(element), 'theme', { handlers, header: { icon: 'palette', title: t('action.themeChoose') } });
}

function exportMenu(anchor) {
  const handlers = {};
  const items = EXPORT_FORMATS.map(([id, glyph]) => { handlers[`custom:export:${id}`] = () => exportAs(id); return { id: `custom:export:${id}`, label: t(`export.${id}`), icon: glyph }; });
  const copyItems = ['hexdump', 'c', 'python', 'base64', 'intelhex', 'srec'].map((id) => { handlers[`custom:clip:${id}`] = () => exportToClipboard(id); return { id: `custom:clip:${id}`, label: t(`export.${id}`), icon: 'copy' }; });
  items.push({ separator: true }, { id: 'submenu:clip', label: t('export.toClipboard'), icon: 'copy', submenu: true, children: copyItems }, { separator: true }, ...menuItems(['saveSelection', 'import', 'print']));
  return showMenu(items, anchor ?? anchorBelow(root.querySelector('[data-command="exportMenu"]') ?? root.querySelector('#toolbar')), 'context', { handlers, header: { icon: 'exportHex', title: t('action.export') } });
}

function submenuAt(key, anchor) {
  return showMenu(menuItems(SUBMENUS[key].items), anchor ?? anchorBelow(root.querySelector(`[data-command="${key === 'ops' ? 'operations' : key}"]`) ?? root.querySelector('#toolbar')), 'context', { header: { icon: SUBMENUS[key].icon, title: t(`submenu.${key}`) } });
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
  popups.actions.set(`cancel:${op}`, () => { signal.cancelled = true; native.invoke('core_cancel', { op }).catch(() => {}); });
  const onProgress = (progress) => { if (progress.op !== op) return; last = progress; if (shown) popups.post('progress', { type: 'progress', ...progress }); };
  const unlisten = await native.listen('io-progress', onProgress);
  const unlistenWeb = onCoreProgress(onProgress);
  try {
    return await task(op, (progress) => { last = { op, done: Math.round((progress.fraction ?? 0) * 1000), total: 1000, text: progress.text ?? '' }; if (shown) popups.post('progress', { type: 'progress', ...last }); }, signal);
  } finally {
    clearTimeout(timer);
    unlisten();
    unlistenWeb();
    popups.actions.delete(`cancel:${op}`);
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
  const dirty = editor.tabs.filter((x) => x.kind === 'hex' && x.doc.modified);
  if (!dirty.length) { saveSession(); return true; }
  const choice = await ask({ kind: 'exit', icon: 'save', title: t('confirm.exitTitle'), message: t('confirm.exitUnsaved', { n: dirty.length, names: dirty.map((x) => x.doc.name).join(', ') }), buttons: [{ id: 'cancel', label: t('common.cancel') }, { id: 'discard', label: t('confirm.exitDiscard'), icon: 'exit', danger: true }, { id: 'save', label: t('action.saveAll'), icon: 'saveAll', primary: true }] });
  if (choice === 'save') { const ok = await saveAll(); if (ok) saveSession(); return ok; }
  if (choice === 'discard') { saveSession(); return true; }
  return false;
}

async function copyText(value) {
  try { await native.clipboardWrite(value); } catch { notify('warning', t('notice.clipboardRefused')); return; }
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
  } : { id, label: labelOf(id), icon: commands[id].icon, shortcut: commands[id].key ? keyLabel(commands[id].key) : '', disabled: !commandEnabled(id), checked: commands[id].checked?.() }));
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
  const header = context.header ?? (MENUS[name] ? { icon: MENU_ICONS[name], title: t(`menu.${name}`) } : { icon: 'hexCode', title: APP_NAME });
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

function hexContextMenu(event, tab) {
  const sel = tab.view?.selection();
  return showMenu([
    ...menuItems(['cut', 'copy', { sub: 'copyAs' }, 'paste', { sub: 'pasteAs' }, '-', 'selectAll', 'selectBlock', 'deleteSel', '-', 'fill', 'insertBytes', '-', 'bookmarkToggle', 'goto', 'toolFind']),
    { separator: true }, ...menuItems([{ sub: 'ops' }, { sub: 'crypto' }, { sub: 'compression' }, { sub: 'encodings' }, '-', 'checksums', 'statistics', 'extract', 'saveSelection', '-', 'disasm', 'strings', 'template']),
  ], anchorAt(event), 'context', { header: { icon: 'hexCode', title: sel?.length ? t('status.selection', { n: sel.length.toLocaleString(), hex: sel.length.toString(16).toUpperCase() }) : tab.doc.name } });
}

function tabMenu(event, tabId) {
  const tab = editor.tabs.find((x) => x.id === tabId);
  if (!tab) return undefined;
  const handlers = {
    'custom:close': () => editor.close(tab),
    'custom:others': async () => { for (const x of editor.tabs.filter((y) => y !== tab)) if (!(await editor.close(x))) return; },
    'custom:copyPath': () => copyText(tab.doc.path ?? tab.doc.name),
    'custom:reveal': () => native.openExternal(tab.doc.path.replace(/[\\/][^\\/]*$/, '')),
  };
  return showMenu([
    { id: 'custom:close', label: t('action.close'), icon: 'closeTab' }, { id: 'custom:others', label: t('tab.closeOthers'), icon: 'closeAll' }, { separator: true },
    ...menuItems(['save', 'saveAs', 'reload', 'print']), { separator: true },
    { id: 'custom:copyPath', label: t('file.copyPath'), icon: 'copy' }, ...(desktop && tab.doc.path ? [{ id: 'custom:reveal', label: t('file.revealSystem'), icon: 'folderOpen' }] : []),
  ], anchorAt(event), 'context', { handlers, header: { icon: tabIcon(tab), title: tabTitle(tab) } });
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
  if (!desktop) { globalThis.open(url, `myhexa-${docLabel(kind)}`)?.focus?.(); return undefined; }
  const dark = resolveTheme(settings().theme, prefersDark(), settings().customTheme).dark;
  try { await native.invoke('open_doc_window', { kind, title: docWindowTitle(t(info.title)), width: info.width, height: info.height, dark }); } catch (error) { showError('error.docWindow', error); }
  return undefined;
}
function closeDocFrames() { for (const kind of Object.keys(DOC_KINDS)) if (popups.frames.has(docLabel(kind))) popups.close(docLabel(kind)); }

// ───────────────────────── drag & drop (files from the system)

function setDropActive(active) { if (state.dropActive === active) return; state.dropActive = active; root.classList.toggle('drop-active', active); }

async function handleDroppedPaths(paths) {
  for (const p of paths) {
    const [isFile] = await native.invoke('hex_is_file', { paths: [p] }).catch(() => [true]);
    if (isFile) await openFile(p); else notify('warning', t('drop.folder', { name: baseName(p) }));
  }
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
      move: (dx) => { const width = Math.max(side === 'left' ? PANEL_MIN.left : PANEL_MIN.right, Math.min(900, startWidth + (side === 'left' ? dx : -dx))); root.style.setProperty(side === 'left' ? '--left-width' : '--right-width', `${width}px`); state.settings[key] = width; },
      end: (e, moved) => { if (moved) { updateSettings({ [key]: settings()[key] }, { quiet: true }); fitToolbar(); renderRight(); } },
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
}

function bindEvents() {
  root.addEventListener('click', (event) => {
    const target = event.target;
    const menu = target.closest('[data-menu]');
    if (menu) { const name = menu.dataset.menu; if (state.lastMenuClose.name === name && Date.now() - state.lastMenuClose.at < 300) return undefined; return openMenubarMenu(name); }
    const subChip = target.closest('[data-menu-sub]');
    if (subChip) return showMenu(menuItems(SUBMENUS[subChip.dataset.menuSub].items), anchorBelow(subChip), 'context', { header: { icon: SUBMENUS[subChip.dataset.menuSub].icon, title: t(`submenu.${subChip.dataset.menuSub}`) } });
    if (target.closest('[data-home]')) return toggleStart();
    const start = target.closest('[data-start]');
    if (start && !start.disabled) return onStartAction(start);
    if (target.closest('[data-toolbar-more]')) return showToolbarMore(target.closest('[data-toolbar-more]'));
    if (target.closest('[data-text-apply]')) return applyText(activeTab());
    if (target.closest('#right-panel .right-body') && props.click(target, event)) return undefined;
    const command = target.closest('[data-command]');
    if (command && !command.disabled) { const id = command.dataset.command; const anchored = ['themeMenu', 'exportMenu', 'operations'].includes(id); return run(id, { anchor: anchored ? anchorBelow(command.closest('.split-button') ?? command) : undefined }); }
    const windowControl = target.closest('[data-window]');
    if (windowControl) return windowButton(windowControl.dataset.window);
    const leftTab = target.closest('[data-left-tab]');
    if (leftTab) return updateSettings({ showLeftPanel: true });
    const rightTab = target.closest('[data-right-tab]');
    if (rightTab) return showRightTab(rightTab.dataset.rightTab);
    const bottomTab = target.closest('[data-bottom-tab]');
    if (bottomTab) return updateSettings({ bottomTab: bottomTab.dataset.bottomTab, showBottomPanel: true });
    const tabStep = target.closest('[data-tab-step]');
    if (tabStep) { const list = root.querySelector('.ws-tab-list'); list.scrollBy({ left: Number(tabStep.dataset.tabStep) * Math.max(160, list.clientWidth * 0.6) }); setTimeout(() => renderTabs(), 350); return undefined; }
    const tabClose = target.closest('[data-tab-close]');
    if (tabClose) { event.stopPropagation(); const tab = editor.tabs.find((x) => x.id === tabClose.dataset.tabClose); return tab ? editor.close(tab) : undefined; }
    const tabEl = target.closest('.ws-tab');
    if (tabEl) { if (tabEl.dataset.tab !== editor.activeId) editor.activate(tabEl.dataset.tab); return undefined; }
    if (target.closest('#left-panel .left-explorer') && explorer.click(target)) return undefined;
    const log = target.closest('[data-log]');
    if (log) { const e = state.log[Number(log.dataset.log)]; if (e?.detail) copyText(`${e.text}\n${e.detail}`); return undefined; }
    return undefined;
  });
  root.addEventListener('dblclick', (event) => {
    if (event.target.closest('#left-panel .left-explorer') && explorer.dblclick(event.target)) return;
    const row = event.target.closest('#right-panel [data-inspect-edit]');
    if (row) props.click(row, { detail: 2 });
    if (event.target.closest('.ws-tabs') && !event.target.closest('.ws-tab, button')) newFile();
  });
  root.addEventListener('auxclick', (event) => { const tabEl = event.target.closest('.ws-tab'); if (event.button === 1 && tabEl) { event.preventDefault(); const tab = editor.tabs.find((x) => x.id === tabEl.dataset.tab); if (tab) editor.close(tab); } });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if ('startSpeed' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}`; state.settings.animationSpeed = Number(target.value); }
    if ('startOpacity' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}%`; root.querySelector('.start-inner')?.style.setProperty('--start-card-alpha', `${target.value}%`); }
    if (target.matches?.('.start-speed input[type="range"]')) syncSliderSteps(target.parentElement);
    if (target.matches?.('.text-mode textarea')) { const tab = activeTab(); if (tab) tab.textValue = target.value; }
  });
  root.addEventListener('change', (event) => {
    const target = event.target;
    if ('templateSelect' in target.dataset) { const tab = activeTab(); if (tab) runTemplate(tab, { template: target.value }); return undefined; }
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
    }
  });

  root.addEventListener('contextmenu', (event) => {
    if (event.target.closest('.hx-body')) return undefined;
    const editable = event.target.closest('input:not([type="range"]):not([type="checkbox"]), textarea');
    if (editable) { event.preventDefault(); return textContextMenu(editable, event); }
    event.preventDefault();
    const xpMenu = event.target.closest('#left-panel .left-explorer') ? explorer.menu(event.target) : null;
    if (xpMenu) return showMenu(xpMenu.items, anchorAt(event), 'context', { handlers: xpMenu.handlers, header: xpMenu.header });
    const tabEl = event.target.closest('.ws-tab');
    if (tabEl) return tabMenu(event, tabEl.dataset.tab);
    if (event.target.closest('#bottom-panel')) return showMenu(menuItems(['showMessages', 'clearMessages', '-', 'bottomPanel']), anchorAt(event), 'context', { header: { icon: 'panelBottom', title: t('bottom.title') } });
    if (event.target.closest('#start-page')) return showMenu(menuItems(['open', 'newFile', 'openDisk', 'openProcess', '-', 'shuffleBackground', 'backgroundImage', '-', 'tutorial', 'about']), anchorAt(event), 'context', { header: { icon: 'home', title: t('action.startPage') } });
    if (event.target.closest('#statusbar')) return showMenu(menuItems(['statusBar', 'insertMode', 'goto', '-', 'theme', 'language']), anchorAt(event), 'context', { header: { icon: 'statusBar', title: t('action.statusBar') } });
    return showMenu(menuItems(['newFile', 'open', 'commandPalette', '-', 'leftPanel', 'rightPanel', 'bottomPanel', 'statusBar', '-', 'settings', 'about']), anchorAt(event), 'context', { header: { icon: 'hexCode', title: APP_NAME } });
  });

  window.addEventListener('resize', frameThrottle(() => { fitToolbar(); if (desktop && state.minWidth && window.innerWidth < state.minWidth - 1) native.setMinimumSize(state.minWidth, 600).catch(() => {}); }));
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) { const previous = state.settings; state.settings = loadSettings(globalThis.localStorage); applySettings(previous); }
    else if (event.key === RECENT_KEY) { state.recent = loadJson(RECENT_KEY, []); if (onStart()) renderStartPage(); }
  });
  window.addEventListener('beforeunload', (event) => { saveSession(); if (!desktop && editor.tabs.some((x) => x.doc.modified)) { event.preventDefault(); event.returnValue = ''; } });
  if (!desktop) {
    let depth = 0;
    const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');
    document.addEventListener('dragenter', (event) => { if (hasFiles(event)) { depth += 1; setDropActive(true); event.preventDefault(); } });
    document.addEventListener('dragover', (event) => { if (hasFiles(event)) event.preventDefault(); });
    document.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) setDropActive(false); });
    document.addEventListener('drop', async (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault(); depth = 0; setDropActive(false);
      const items = [...(event.dataTransfer?.items ?? [])];
      const files = [...(event.dataTransfer?.files ?? [])];
      for (const [i, file] of files.entries()) {
        const handle = await items[i]?.getAsFileSystemHandle?.().catch(() => null);
        await withProgress('progress.open', file.name, (op, report) => editor.openWebFile(file, handle?.kind === 'file' ? handle : null, report), { delay: 150 }).catch((error) => showError('error.open', error, file.name));
      }
    });
  }
  setInterval(() => { const clock = root.querySelector('#status-clock'); if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 15000);
}

/** Ctrl+key: [key, shift, alt, command]. */
const SHORTCUTS = [
  ['n', false, false, 'newFile'], ['o', false, false, 'open'], ['s', false, false, 'save'], ['s', true, false, 'saveAs'], ['s', false, true, 'saveAll'], ['w', false, false, 'close'],
  ['z', false, false, 'undo'], ['y', false, false, 'redo'], ['z', true, false, 'redo'], ['x', false, false, 'cut'], ['c', false, false, 'copy'], ['c', true, false, 'copy:text'], ['v', false, false, 'paste'], ['v', true, false, 'paste:text'],
  ['a', false, false, 'selectAll'], ['b', false, false, 'selectBlock'], ['f', false, false, 'find'], ['h', false, false, 'replace'], ['g', false, false, 'goto'], ['d', false, false, 'bookmarkToggle'],
  ['e', false, false, 'fill'], ['i', false, false, 'insertBytes'], ['r', false, false, 'readonly'], ['k', false, false, 'compare'], ['t', false, false, 'template'], ['d', true, false, 'disasm'], ['t', true, false, 'strings'],
  ['f', true, false, 'carve'], ['y', true, false, 'yara'], ['k', true, false, 'checksums'], ['m', false, false, 'textMode'], ['p', false, false, 'print'], ['p', true, false, 'commandPalette'], [',', false, false, 'settings'], ['l', true, false, 'language'],
  ['!', true, false, 'leftPanel'], ['1', true, false, 'leftPanel'], ['@', true, false, 'rightPanel'], ['2', true, false, 'rightPanel'], ['j', false, false, 'bottomPanel'],
  ['h', true, false, 'startPage'], ['b', true, false, 'shuffleBackground'], ['=', false, false, 'zoomIn'], ['+', false, false, 'zoomIn'], ['-', false, false, 'zoomOut'], ['0', false, false, 'zoomReset'],
  ['tab', false, false, 'nextTab'], ['tab', true, false, 'prevTab'], ['q', false, false, 'exit'],
];

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  if (tutorial?.active && key === 'escape') { event.preventDefault(); tutorial.stop(); return; }
  if (paletteOpen() || event.isComposing) return;
  const inHex = Boolean(event.target.closest?.('.hx-view'));
  const editing = !inHex && event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = event.ctrlKey || event.metaKey;
  if (mod) {
    if (editing && ['x', 'c', 'v', 'z', 'y', 'a'].includes(key)) return;
    const shortcut = SHORTCUTS.find(([k, shift, alt]) => k === key && shift === event.shiftKey && alt === event.altKey);
    if (shortcut) { event.preventDefault(); event.stopPropagation(); run(shortcut[3]); }
    return;
  }
  const fkeys = { f1: event.shiftKey ? 'tutorial' : 'about', f2: event.shiftKey ? 'bookmarkPrev' : 'bookmarkNext', f3: event.shiftKey ? 'findPrev' : 'findNext', f8: event.shiftKey ? 'diffPrev' : 'diffNext', f11: 'fullscreen' };
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
  popups.on('open-recent', (data) => { const entry = state.recent.find((x) => x.path === data.path); if (entry) openRecent(entry); });
  popups.on('notice', (data) => notify(data.kind ?? 'info', data.text));
  popups.on('open-settings', (data) => popups.open('settings', { tab: data.tab ?? 'general', themeGroup: data.themeGroup }));
  popups.on('start-tutorial', () => startTutorial());
  popups.on('show-start', () => showStartPage(true));
  popups.on('progress-cancel', (data) => { popups.actions.get(`cancel:${data.op}`)?.(); });
  popups.on('open-external', (data) => native.openExternal(data.url));
  popups.on('print-content', () => sendPrintContent());
  popups.on('print-run', (job) => runPrint(job));
  popups.on('tool', (data) => toolHost.handle(data));
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
  else if (result?.choice === 'sample') openSample('mixed');
}

// ───────────────────────── start-up

/** What the tutorial and the tests use. */
const appApi = {
  state, t, run, commands, popups, notify, showError, ask, settings, updateSettings, renderAll, copyText, withProgress, showStartPage,
  core, isDesktop: desktop, editor, props, toolHost, activeTab, activeDoc, activeView,
  openSample, openFile, openCompare, runTemplate, openTool, anchorBelow, openMenubarMenu, showMenu, openDocWindow, closeDocFrames,
  version: () => state.info?.version ?? VERSION,
  setRightTab: showRightTab, setBottomTab: showBottomTab,
  takeDoc: () => editor.tabs.map((x) => x.id),
  putDoc: async (saved) => { for (const tab of [...editor.tabs]) if (!(saved ?? []).includes(tab.id)) await editor.close(tab, { force: true }); renderAll(); },
};

async function start() {
  renderShell();
  bindShellEvents();
  bindEvents();
  bindPopupActions();
  useWindows(popups);
  // Every long core call (a search, a hash, a template, a transform … from a button, a menu or a tool window) shows
  // the progress popup when it is still running after a moment.
  setLongCallHook((method, args, exec) => withProgress(`progress.method.${method}`, activeDoc()?.name ?? '', (op) => exec(op), { delay: 400, cancellable: true }));
  configurePlatform({ defaultDir: () => settings().lastDirectory, dark: () => resolveTheme(settings().theme, prefersDark(), settings().customTheme).dark, title: () => `${activeDoc()?.name ?? 'hexdump'} — ${APP_NAME}` });
  await popups.init();
  const welcomeLikely = desktop && settings().showWelcome && settings().showStartPage !== false && !globalThis.__MYHEXA_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome');
  if (welcomeLikely) popups.prewarm('welcome');
  state.info = await native.appInfo().catch(() => null);
  state.instance = await native.instanceInfo().catch(() => ({ first: true, others: 0 }));
  if (settings().animationRandom) updateSettings({ animation: randomAnimation(settings().animation) }, { quiet: true });
  setInterval(tickStartBackground, 1000);
  native.setBackendLanguage(settings().language);
  state.showStart = true;
  applySettings({});
  await loadBackground();
  if (!desktop) await loadWasm().catch((error) => showError('error.core', error));
  state.builtins = await core('templates').catch(() => []);

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

  trackMaximized();
  if (desktop) await appWindow.show();
  // Files on the command line ("Open with"), else the files open last time (desktop).
  const startup = await native.startupFiles().catch(() => []);
  const session = loadJson(SESSION_KEY, null);
  if (startup.length) await handleDroppedPaths(startup);
  else if (desktop && session?.files?.length && settings().restoreSession && (state.instance?.first ?? true) && !settings().showStartPage) {
    const exists = await native.pathsExist(session.files).catch(() => []);
    for (const [i, path] of session.files.entries()) if (exists[i]) await openFile(path).catch(() => {});
  }
  state.showStart = !editor.tabs.length;
  renderAll();
  const welcome = settings().showWelcome && onStart() && !globalThis.__MYHEXA_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome');
  if (welcome) openWelcome(); else if (welcomeLikely) popups.close('welcome');
  if (desktop) {
    if (!welcome) await appWindow.setFocus();
    const warm = () => { popups.prewarm('menu').then(() => popups.prewarm('progress', { warm: true })); };
    if (welcome) popups.whenDrawn('welcome', 1500).then(() => setTimeout(warm, 200)); else setTimeout(warm, 400);
  }
}

// Test hook: E2E suites and the smoke script drive the app through this.
window.__myhexa = {
  state, t, commands, popups, run, core, editor, props, toolHost, HexView,
  menus: { MENUS, SUBMENUS, TOOLBAR, enabled: (id) => commandEnabled(id) },
  app: appApi,
  tutorial: () => tutorial,
  startBackground: () => startBackground,
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => { if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {}); });
