// MyNetManager main window: the shell (title row with menus, toolbar, tabs, status bar, start page)
// in MyUMLMaker's style, and the capture tabs (views/capture.js). Commands are one table used by the
// menus, the toolbar, the shortcuts, the context menus and the tutorial.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import APP_ICON from '../assets/icon-256.png';
import { readCaptureAsync, writePcap, writePcapng } from './domain/capture/pcap.js';
import { CaptureDoc } from './domain/capture/doc.js';
import { DemoTraffic } from './domain/capture/synth.js';
import { SAMPLE_GROUPS, SAMPLES } from './domain/capture/samples.js';
import { sampleIcon } from './ui/startpage.js';
import { FIELDS, PROTOCOLS } from './domain/dissect/index.js';
import { checkFilter, conversationFilter, filterForNode, setDefaultFields, suggestFields, validateFilter } from './domain/filter/index.js';
import { COLORING_RULES, darkColors } from './domain/filter/coloring.js';
import { buildTopology } from './domain/analysis/topology.js';
import { buildReport, createAnalyzer } from './domain/analysis/findings.js';
import { DOC_FORMATS, exportDocument, toLines } from './domain/export/docexport.js';
import { defaultPrintOptions } from './print/packets.js';
import { encodeCanvas, IMAGE_FORMATS, imageMime, svgToCanvas } from './domain/export/images.js';
import { CAPTURE_PRESETS, togglePreset } from './domain/filter/presets.js';
import { followFilter, followFilterOut } from './domain/analysis/follow.js';
import { addRecent, loadRecent, loadRecentDirs, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import {
  ANIMATIONS, COLORING_KEY, DEFAULT_COLUMNS, loadSettings, pushRecentFilter, SESSION_KEY, storeSettings, TIME_FORMATS, zoomStep,
} from './domain/settings.js';
import { DOC_KINDS, docLabel, docWindowTitle } from './domain/helpdocs.js';
import { loadSavedFilters, storeSavedFilters } from './domain/filters-store.js';
import { switchFlag } from './flags.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { captureBackend, captureSetupInfo, interfaceActivity, listInterfaces, onCaptureSetup, onCaptureStopped, runCaptureSetup, startCapture } from './platform/capture.js';
import { PopupHost } from './platform/popups.js';
import { applyFont, applyTheme, randomThemeId, resolveTheme, themeName } from './themes.js';
import { escapeHtml, isMac, keyLabel } from './ui/dom.js';
import { bindSteppers } from './stepper.js';
import { AnimatedBackground } from './ui/background.js';
import { startPageHtml } from './ui/startpage.js';
import { startBoard } from './ui/startboard.js';
import { STEPS as TUTORIAL_STEPS, Tutorial } from './ui/tutorial.js';
import { CaptureView } from './views/capture.js';
import { columnTitle } from './views/packetlist.js';
import { displayValue } from './domain/capture/doc.js';
import * as analysis from './analysis-bridge.js';

setDefaultFields(FIELDS);
const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const DEMO_ID = 'demo';

const state = {
  settings: loadSettings(globalThis.localStorage),
  recent: loadRecent(globalThis.localStorage),
  recentDirs: loadRecentDirs(globalThis.localStorage),
  docs: [],
  active: null,
  notice: null,
  info: null,
  openMenu: null,
  lastMenuClose: { name: null, at: 0 },
  quitting: false,
  dropActive: false,
  minWidth: 0,
  maximized: false,
  showStart: false,
  view: null,
  /** Capture interfaces: [{ id, name, friendly, description, addresses, kind, loopback, up, wireless }] (the demo one first). */
  interfaces: [],
  backend: null,
  /** The display filter being typed in the active tab: its text and whether it is valid. */
  filter: { text: '', status: 'empty', error: '' },
  find: { mode: 'filter', text: '', where: 'details', matchCase: false },
  fonts: [],
  progress: null,
  untitled: 0,
  log: [],
};

const activeDoc = () => state.docs.find((doc) => doc.id === state.active) ?? null;
const lang = () => getLanguage();
const baseName = (path) => String(path ?? '').split(/[\\/]/).pop() ?? '';
const directoryOf = (path) => { const p = String(path ?? ''); const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')); return i > 0 ? p.slice(0, i) : ''; };
const stripExtension = (name) => String(name).replace(/\.(pcapng|pcap|cap|ntar|gz)+$/i, '');
const fileSafe = (text) => String(text ?? '').replace(/[\\/:*?"<>|]/g, '_');

// ───────────────────────── log (bottom panel › Log)

const LOG_MAX = 5000;
function addLog(level, text) {
  state.log.push({ time: Date.now(), level: level === 'success' || level === 'error' ? level : 'info', text: String(text) });
  if (state.log.length > LOG_MAX) state.log.splice(0, state.log.length - LOG_MAX);
  if (state.view?.bottom && state.settings.bottomTab === 'log') { clearTimeout(addLog.timer); addLog.timer = setTimeout(() => state.view?.bottom.render(), 200); }
}

// ───────────────────────── notices & errors

let noticeTimer = 0;
function notify(kind, text) {
  state.notice = { kind, text, at: Date.now() };
  addLog(kind, text);
  renderStatus();
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { state.notice = null; renderStatus(); }, kind === 'error' ? 12000 : 6000);
}

function formatError(error) {
  const text = native.errorText(error);
  if (error?.code && t(`captureError.${error.code}`, null, '') ) return { message: `${t(`captureError.${error.code}`)}\n${text}`, detail: error?.stack ?? '' };
  if (/^[a-z]+\.[a-zA-Z.]+$/.test(text) && t(text) !== text) return { message: t(text), detail: error?.detail ?? '' };
  return { message: text, detail: error?.stack && !String(error.stack).startsWith(text) ? error.stack : error?.stack?.split('\n').slice(1).join('\n') ?? '' };
}

function showError(titleKey, error, context = '') {
  const { message, detail } = formatError(error);
  console.error(titleKey, error);
  notify('error', `${t(titleKey)}: ${message.split('\n')[0]}`);
  const info = state.info;
  return popups.open('error', {
    title: t(titleKey), message, detail: detail ?? '', context, time: new Date().toLocaleString(),
    app: info ? `${info.name} ${info.version} (${info.web ? 'web' : `${info.os}/${info.arch}`}, ${info.commit})` : `MyNetManager ${VERSION}`,
  });
}

window.addEventListener('error', (event) => showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''));
window.addEventListener('unhandledrejection', (event) => { if (!event.reason?.cancelled) showError('error.unexpected', event.reason); });

// ───────────────────────── preferences the dissectors use

function dissectPrefs() {
  const s = state.settings;
  return {
    resolve: { mac: s.resolveMac, transport: s.resolveTransport, network: s.resolveNetwork },
    tcp: { relativeSeq: s.tcpRelativeSeq, analyze: s.tcpAnalyze },
    decodeAs: s.decodeAs,
    disabled: s.disabledProtocols,
  };
}

function loadColoring() {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(COLORING_KEY) ?? 'null');
    if (Array.isArray(saved) && saved.length) return saved;
  } catch { /* defaults */ }
  return COLORING_RULES;
}

/** Colouring rules with colours for the theme (a dark theme gets darker backgrounds). */
function themedColoring() {
  const rules = loadColoring();
  const dark = resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme).dark;
  return dark ? darkColors(rules) : rules;
}


// ───────────────────────── capture tabs

function addDoc(doc) {
  state.docs.push(doc);
  doc.setColoring(themedColoring());
  activate(doc.id);
  return doc;
}

function activate(id) {
  state.active = id;
  state.showStart = false;
  const doc = activeDoc();
  state.filter = { text: doc?.filterText ?? '', status: doc?.filterText ? 'valid' : 'empty', error: '' };
  mountView();
  renderAll();
  persistSession();
}

function mountView() {
  const host = root.querySelector('#view-host');
  if (!activeDoc() || state.showStart) { state.view?.destroy(); state.view = null; host.hidden = true; return; }
  host.hidden = false;
  if (!state.view) state.view = new CaptureView(host, viewApi);
  state.view.refresh({ keepNode: false });
  refreshMap();
}

function persistSession() {
  try {
    globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify({ files: state.docs.filter((doc) => doc.path).map((doc) => doc.path) }));
  } catch { /* private mode */ }
}

/** Runs the first pass with progress in the status bar (and a progress popup for big files). */
async function runPass(doc, task, labelKey = 'progress.dissect') {
  const controller = new AbortController();
  doc.busy = controller;
  const started = performance.now();
  let lastPaint = 0;
  const onProgress = (done, total) => {
    state.progress = { label: t(labelKey), done, total, doc: doc.id };
    const now = performance.now();
    if (now - lastPaint > 120) { lastPaint = now; renderStatus(); if (doc === activeDoc() && now - started > 300) state.view?.list.draw(true); }
  };
  try {
    await task({ onProgress, signal: controller.signal });
  } finally {
    doc.busy = null;
    state.progress = null;
    renderStatus();
  }
}

async function openCaptureBytes(name, bytes, { path = null, handle = null, quiet = false } = {}) {
  let file;
  try {
    file = await readCaptureAsync(bytes, name);
  } catch (error) {
    if (!quiet) showError('error.open', error, path ?? name);
    return null;
  }
  const doc = addDoc(new CaptureDoc({ name, path, file, prefs: dissectPrefs(), handle }));
  if (file.truncated) notify('error', t('notice.truncated', { name }));
  await runPass(doc, (options) => doc.firstPass(options));
  if (doc.displayed.length && doc.selected < 0) selectFrame(doc, doc.displayed[0], { remember: false });
  if (path) rememberRecent({ path });
  else if (handle) { rememberRecent({ path: name, web: true }); native.storeWebHandle(name, handle); }
  refreshAfterChange(doc);
  refreshMap();
  runAnalysis(doc);
  if (!quiet) notify('success', t('notice.opened', { name, count: doc.count }));
  return doc;
}

async function openPath(path, { quiet = false } = {}) {
  const open = state.docs.find((doc) => doc.path && doc.path.replace(/\\/g, '/').toLowerCase() === path.replace(/\\/g, '/').toLowerCase());
  if (open) { activate(open.id); return open; }
  try {
    const bytes = await withProgress('progress.read', baseName(path), (op) => native.readBinaryFile(path, op));
    return await openCaptureBytes(baseName(path), bytes, { path, quiet });
  } catch (error) {
    if (!quiet) showError('error.open', error, path);
    return null;
  }
}

async function openWithDialog(directory = null) {
  try {
    if (desktop) {
      const paths = await native.chooseCapturesToOpen(directory ?? state.settings.lastDirectory);
      for (const path of paths) await openPath(path);
    } else {
      for (const file of await native.pickCaptureFilesWeb()) await openCaptureBytes(file.name, file.content, { handle: file.handle });
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
        return openCaptureBytes(file.name, new Uint8Array(await file.arrayBuffer()), { handle });
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
    if (choice === 'remove') { state.recent = removeRecent(state.recent, path); storeRecent(globalThis.localStorage, state.recent); renderAll(); }
    return null;
  }
  return openPath(path);
}

async function openSample(id) {
  const sample = SAMPLES.find((s) => s.id === id) ?? SAMPLES[0];
  if (!sample) return null;
  const file = sample.build();
  const name = `${sample[lang()]?.[0] ?? sample.id}.pcapng`;
  const doc = addDoc(new CaptureDoc({ name, file, prefs: dissectPrefs() }));
  doc.sample = sample.id;
  await runPass(doc, (options) => doc.firstPass(options));
  if (doc.displayed.length) selectFrame(doc, doc.displayed[0], { remember: false });
  refreshAfterChange(doc);
  refreshMap();
  runAnalysis(doc);
  notify('success', t('notice.sampleOpened', { name: sample[lang()]?.[0] ?? id }));
  return doc;
}

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

/** Saves the capture (pcapng keeps comments; pcap when chosen). */
async function saveDoc(doc, { saveAs = false, format = null } = {}) {
  if (!doc) return false;
  const pcap = format === 'pcap' || (!format && /\.(pcap|cap)$/i.test(doc.path ?? ''));
  const extension = pcap ? 'pcap' : 'pcapng';
  try {
    const bytes = pcap ? writePcap(doc.file, doc.frames) : writePcapng(doc.file, doc.frames);
    if (desktop) {
      let path = !saveAs && doc.path && !doc.live && (pcap ? /\.(pcap|cap)$/i.test(doc.path) : /\.(pcapng|ntar)$/i.test(doc.path)) ? doc.path : null;
      if (!path) {
        const suggested = `${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${fileSafe(stripExtension(doc.name))}.${extension}`;
        path = await native.chooseSavePath(suggested, pcap ? ['pcap', 'pcapng'] : ['pcapng', 'pcap']);
        if (!path) return false;
      }
      await withProgress('progress.save', baseName(path), (op) => native.writeBinaryFile(path, bytes, op));
      doc.path = path;
      doc.name = baseName(path);
      rememberRecent({ path });
    } else {
      const saved = await native.saveFileWeb(new Blob([bytes], { type: 'application/octet-stream' }), { name: `${fileSafe(stripExtension(doc.name))}.${extension}`, handle: saveAs ? null : doc.handle, saveAs });
      if (!saved) return false;
      doc.handle = saved.handle;
      doc.name = saved.name;
    }
    doc.dirty = false;
    renderAll();
    persistSession();
    notify('success', t('notice.saved', { name: doc.name }));
    return true;
  } catch (error) {
    showError('error.save', error, doc.name);
    return false;
  }
}

/** Saves any text or bytes the user exports (dissections, objects, map pictures). */
async function saveExport(name, type, content, mime = 'text/plain') {
  try {
    if (desktop) {
      const path = await native.chooseSavePath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${fileSafe(name)}`, [type, 'any'].filter((x, i, a) => native.SAVE_TYPES[x] && a.indexOf(x) === i));
      if (!path) return false;
      if (content instanceof Uint8Array) await withProgress('progress.save', baseName(path), (op) => native.writeBinaryFile(path, content, op));
      else await withProgress('progress.save', baseName(path), (op) => native.writeTextFile(path, content, op));
      rememberDirectory(directoryOf(path));
      notify('success', t('notice.exported', { name: baseName(path) }));
    } else {
      const saved = await native.saveFileWeb(content instanceof Uint8Array ? new Blob([content], { type: mime }) : new Blob([content], { type: mime }), { name, saveAs: true, mime });
      if (saved) notify('success', t('notice.exported', { name: saved.name }));
    }
    return true;
  } catch (error) {
    showError('error.export', error, name);
    return false;
  }
}

async function closeDoc(doc, { force = false } = {}) {
  if (!doc) return true;
  if (doc.capture) await stopLiveCapture(doc);
  if (doc.dirty && !force && doc.count) {
    const choice = await ask({
      icon: 'save', title: t('confirm.unsavedTitle'), message: t('confirm.unsavedCapture', { name: doc.name, count: doc.count }),
      buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }],
    });
    if (choice === 'cancel') return false;
    if (choice === 'save' && !(await saveDoc(doc))) return false;
  }
  doc.busy?.abort();
  const index = state.docs.indexOf(doc);
  state.docs.splice(index, 1);
  if (state.active === doc.id) {
    const next = state.docs[Math.min(index, state.docs.length - 1)];
    state.active = next?.id ?? null;
    state.view?.destroy();
    state.view = null;
    if (next) activate(next.id); else { state.showStart = true; renderAll(); }
  } else renderAll();
  persistSession();
  return true;
}

// ───────────────────────── selection, navigation

function selectFrame(doc, index, { remember = true, reveal = false } = {}) {
  if (!doc || index == null || index < 0 || index >= doc.passed) return;
  doc.select(index, { remember });
  computeRelations(doc);
  if (doc === activeDoc() && state.view) {
    state.view.list.draw(true);
    if (reveal) state.view.list.reveal(index, { center: true });
    state.view.showSelected();
  }
  renderStatus();
  renderToolbarState();
}

/** Request/response partners of the selected packet (the marks in the No. column). */
function computeRelations(doc) {
  doc.relations = new Map();
  if (doc.selected < 0) return;
  const d = doc.dissection(doc.selected);
  for (const [name, nodes] of d.fields ?? []) {
    if (!/(response_in|request_in|response_to|ack_frame|reassembled_in|prev_frame)$/.test(name) && !/\.(response_in|request_in|response_to)$/.test(name)) continue;
    for (const node of nodes) {
      const no = Number(node.value);
      if (!Number.isInteger(no) || no < 1) continue;
      doc.relations.set(no - 1, /response_in/.test(name) ? 'response' : /request_in|response_to/.test(name) ? 'request' : 'related');
    }
  }
  if (doc.relations.size) doc.relations.set(doc.selected, 'self');
}

function goRow(delta) {
  const doc = activeDoc();
  if (!doc || !state.view) return;
  const list = state.view.list.list();
  const row = list.indexOf(doc.selected);
  const target = delta === -Infinity ? 0 : delta === Infinity ? list.length - 1 : Math.max(0, Math.min(list.length - 1, (row < 0 ? 0 : row) + delta));
  if (list[target] != null) selectFrame(doc, list[target], { reveal: true });
}

function goHistory(direction) {
  const doc = activeDoc();
  if (!doc) return;
  const from = direction < 0 ? doc.history.back : doc.history.forward;
  const to = direction < 0 ? doc.history.forward : doc.history.back;
  const index = from.pop();
  if (index == null) return;
  if (doc.selected >= 0) to.push(doc.selected);
  selectFrame(doc, index, { remember: false, reveal: true });
}

/** Next / previous packet in the same conversation (TCP or UDP stream, else same addresses). */
function goConversation(direction) {
  const doc = activeDoc();
  if (!doc || doc.selected < 0) return;
  const s = doc.summaries[doc.selected];
  const same = (i) => {
    const o = doc.summaries[i];
    if (s.tcpStream != null) return o.tcpStream === s.tcpStream;
    if (s.udpStream != null) return o.udpStream === s.udpStream;
    return (o.src === s.src && o.dst === s.dst) || (o.src === s.dst && o.dst === s.src);
  };
  const list = state.view.list.list();
  let row = list.indexOf(doc.selected);
  for (row += direction; row >= 0 && row < list.length; row += direction) if (same(list[row])) { selectFrame(doc, list[row], { reveal: true }); return; }
  notify('info', t('notice.noMore'));
}

async function goToPacket() {
  const doc = activeDoc();
  if (!doc) return;
  const result = await popups.open('goto', { max: doc.count, current: doc.selected + 1 });
  const no = Number(result?.value);
  if (!Number.isInteger(no) || no < 1 || no > doc.count) return;
  if (!doc.displayed.includes(no - 1)) { notify('info', t('notice.notDisplayed', { no })); return; }
  selectFrame(doc, no - 1, { reveal: true });
}

function goMark(direction, set) {
  const doc = activeDoc();
  if (!doc || !state.view) return;
  const list = state.view.list.list();
  let row = list.indexOf(doc.selected);
  for (row += direction; row >= 0 && row < list.length; row += direction) if (set(doc).has(list[row])) { selectFrame(doc, list[row], { reveal: true }); return; }
  notify('info', t('notice.noMore'));
}

// ───────────────────────── display filter

function filterButtons() {
  return loadSavedFilters().display.filter((f) => f.button);
}

const viewFilterState = () => {
  const doc = activeDoc();
  return { ...state.filter, applied: Boolean(doc?.filterText), shown: doc?.displayed.length ?? 0, total: doc?.passed ?? 0, buttons: filterButtons() };
};

function onFilterInput(text, caret = null) {
  state.filter.text = text;
  const result = validateFilter(text, { fields: FIELDS });
  const value = result.status;
  const error = result.error ?? (result.deprecated?.length ? result.deprecated.map((d) => d.message).join(' ') : '');
  state.filter.status = value;
  state.filter.error = error;
  state.view?.setFilterStatus(value, error);
  // Field names: the word being typed (letters, digits, dots, underscores) before the caret.
  if (caret != null && state.view) {
    const before = text.slice(0, caret);
    const match = /([A-Za-z_][A-Za-z0-9_.-]*)$/.exec(before);
    if (match && match[1].length >= 2) state.view.showSuggestions(suggestFields(match[1], 12, { fields: FIELDS }), caret - match[1].length);
    else state.view.hideSuggestions();
  }
}

async function applyDisplayFilter(text, { fromMap = false } = {}) {
  const doc = activeDoc();
  if (!doc) return false;
  const trimmed = String(text ?? '').trim();
  doc.busy?.abort();
  let result;
  await runPass(doc, async (options) => { result = await doc.applyFilter(trimmed, options); }, 'progress.filter').catch((error) => { if (!error?.cancelled) throw error; });
  if (!result) return false;
  if (!result.ok) {
    state.filter = { text: trimmed, status: 'invalid', error: result.error };
    state.view?.renderFilterBar();
    notify('error', t('filter.invalid', { error: result.error }));
    return false;
  }
  state.filter = { text: trimmed, status: trimmed ? 'valid' : 'empty', error: '' };
  if (trimmed) updateSettings({ recentDisplayFilters: pushRecentFilter(state.settings.recentDisplayFilters, trimmed) }, { quiet: true });
  if (!fromMap) state.view?.map.clearSelection();
  if (doc.selected >= 0 && !doc.displayed.includes(doc.selected)) doc.selected = doc.displayed[0] ?? -1;
  if (doc.selected < 0 && doc.displayed.length) doc.selected = doc.displayed[0];
  computeRelations(doc);
  refreshAfterChange(doc);
  if (doc.selected >= 0) state.view?.list.reveal(doc.selected, { center: true });
  notify('info', trimmed ? t('filter.applied', { shown: result.count, total: doc.passed }) : t('filter.cleared'));
  return true;
}

/** Apply / Prepare as Filter and the conversation filters: combine with the current text. */
function combineFilter(expr, how) {
  const current = state.view?.filterText().trim() ?? state.filter.text.trim();
  if (!current || how === 'selected' || how === 'not') return how === 'not' ? `!(${expr})` : expr;
  const joiner = { and: '&&', or: '||', andNot: '&& !', orNot: '|| !' }[how] ?? '&&';
  const wrap = (e) => (/\|\||&&|\bor\b|\band\b/.test(e) ? `(${e})` : e);
  return `${wrap(current)} ${joiner}${joiner.endsWith('!') ? '' : ' '}${how === 'andNot' || how === 'orNot' ? `(${expr})` : wrap(expr)}`;
}

function filterFromNode(how, apply) {
  const node = state.view?.details.selected;
  if (!node) return notify('info', t('notice.selectField'));
  const expr = filterForNode(node, { mode: 'selected' });
  if (!expr) return notify('info', t('notice.noFilterForField'));
  const text = combineFilter(expr, how);
  state.view.setFilterText(text);
  if (apply) return applyDisplayFilter(text);
  state.view.focusFilter();
  return undefined;
}

function applyConversationFilter(kind) {
  const doc = activeDoc();
  if (!doc || doc.selected < 0) return undefined;
  const expr = conversationFilter(kind, doc.dissection(doc.selected));
  if (!expr) return notify('info', t('notice.noConversation', { kind }));
  state.view.setFilterText(expr);
  return applyDisplayFilter(expr);
}

// ───────────────────────── network map

let mapTimer = 0;
function refreshMap({ keepPlaces = false } = {}) {
  clearTimeout(mapTimer);
  const doc = activeDoc();
  if (!state.view) return;
  if (!state.settings.showNetMap) return;
  if (!doc) { state.view.map.setTopology(null); return; }
  mapTimer = setTimeout(() => {
    const s = state.settings;
    // Big captures: the map comes from up to 20 000 frames spread over the file.
    const step = Math.max(1, Math.floor(doc.passed / 20000));
    const indices = [];
    for (let i = 0; i < doc.passed; i += step) indices.push(i);
    const topology = buildTopology(doc.frames, doc.summaries, (i) => doc.dissectOnce(i), { showExternal: s.netmapShowExternal, showMulticast: s.netmapShowMulticast, indices });
    topology.sampled = step > 1;
    doc.topology = topology;
    if (doc === activeDoc()) state.view?.map.setTopology(topology, { keepPlaces });
  }, keepPlaces ? 600 : 30);
}

function onMapSelect(selection) {
  if (!selection) {
    state.view?.setFilterText('');
    return applyDisplayFilter('', { fromMap: true });
  }
  const filter = selection.item.filter;
  if (!filter) return notify('info', t('netmap.noFilter'));
  state.view?.setFilterText(filter);
  notify('info', t('netmap.filtered', { name: selection.type === 'node' ? (selection.item.name || selection.item.label) : t('netmap.link') }));
  return applyDisplayFilter(filter, { fromMap: true });
}

/**
 * Saves a drawing (standalone SVG text) as a picture: the person picks PNG, JPEG, WebP, GIF, AVIF or SVG.
 * AVIF needs the desktop program when the web view cannot write it (images.js).
 */
async function saveImage(svg, name, { title = t('image.save'), message = t('image.saveMessage'), background = '#ffffff', format = null } = {}) {
  const choice = format ?? await ask({
    icon: 'exportImage', title, message,
    buttons: [{ id: 'cancel', label: t('confirm.cancel') }, ...IMAGE_FORMATS.map(([id, label]) => ({ id, label, icon: id === 'svg' ? 'svgFile' : 'imageFormat', primary: id === 'png' }))],
  });
  if (!IMAGE_FORMATS.some(([id]) => id === choice)) return undefined;
  const mime = imageMime(choice);
  if (choice === 'svg') return saveExport(`${name}.svg`, 'svg', svg, mime);
  try {
    // JPEG and GIF have no transparency: the drawing's own background goes under it.
    const canvas = await svgToCanvas(svg, { scale: 2, background: choice === 'jpg' || choice === 'gif' ? background : '' });
    const bytes = await encodeCanvas(canvas, choice, { avif: desktop ? native.encodeAvif : null });
    return saveExport(`${name}.${choice}`, choice, bytes, mime);
  } catch (error) {
    return showError('error.export', error, `${name}.${choice}`);
  }
}

async function exportMap() {
  if (!state.view) return;
  const theme = resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme).colors;
  const svg = state.view.map.svgText({ bg: theme.bg, text: theme.text, muted: theme.muted, accent: theme.accent, border: theme.border, link: theme.muted, node: theme.surface, subnet: `${theme.accent}14` });
  const name = `${fileSafe(stripExtension(activeDoc()?.name ?? 'capture'))}-map`;
  return saveImage(svg, name, { title: t('netmap.export'), message: t('netmap.exportMessage'), background: theme.bg });
}

// ───────────────────────── automatic analysis (bottom panel, navigator, reports)

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Analyses the capture in slices; the panels show the result when it is ready. */
async function runAnalysis(doc = activeDoc()) {
  if (!doc) return null;
  const token = (doc.analysisToken ?? 0) + 1;
  doc.analysisToken = token;
  const analyzer = createAnalyzer();
  let last = performance.now();
  for (let i = 0; i < doc.passed; i += 1) {
    let d = null;
    try { d = doc.dissectOnce(i); } catch { d = null; }
    analyzer.add(doc.frames[i], doc.summaries[i], d);
    if (performance.now() - last > 20) {
      await nextTick();
      if (doc.analysisToken !== token) return null;
      last = performance.now();
    }
  }
  doc.analysis = analyzer.result();
  doc.analysisAt = doc.passed;
  if (doc === activeDoc()) { state.view?.renderPanels(); renderStatus(); }
  const errors = doc.analysis.findings.filter((f) => f.severity === 'error').length;
  addLog(errors ? 'error' : 'info', t('log.analysisDone', { name: doc.name, findings: doc.analysis.findings.length, problems: doc.analysis.overview.problemCount }));
  return doc.analysis;
}

/**
 * Saves a document (docexport.js) as HTML, Markdown, PDF or Word. Markdown images are written into the
 * file (data URLs) or, with imageMode 'link', saved as files beside it and linked by name.
 */
async function exportDoc(doc, format, { imageMode = 'embed' } = {}) {
  const [ext, type, mime] = DOC_FORMATS[format] ?? DOC_FORMATS.html;
  const base = fileSafe(stripExtension(doc.title || 'document'));
  const images = doc.images ?? [];
  const linked = format === 'markdown' && imageMode === 'link' && images.length;
  const names = images.map((img, i) => `${base}-${i + 1}.${img.ext ?? 'png'}`);
  let content;
  try {
    content = exportDocument(linked ? { ...doc, images: images.map((img, i) => ({ ...img, href: names[i] })) } : doc, format, { lang: lang() });
  } catch (error) { return showError('error.export', error); }
  if (!linked) return saveExport(`${base}.${ext}`, type, content, mime);
  // Linked images: the Markdown first (its folder decides where the pictures go), then each picture.
  const bytes = (dataUrl) => Uint8Array.from(atob(dataUrl.split(',')[1] ?? ''), (ch) => ch.charCodeAt(0));
  if (desktop) {
    const path = await native.chooseSavePath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${base}.${ext}`, [type, 'any']);
    if (!path) return false;
    const dir = directoryOf(path);
    try {
      await native.writeTextFile(path, content);
      for (let i = 0; i < images.length; i++) await native.writeBinaryFile(`${dir}/${names[i]}`, bytes(images[i].dataUrl));
    } catch (error) { return showError('error.export', error); }
    rememberDirectory(dir);
    notify('success', t('notice.exported', { name: baseName(path) }));
    return true;
  }
  await saveExport(`${base}.${ext}`, type, content, mime);
  for (let i = 0; i < images.length; i++) await native.saveFileWeb(new Blob([bytes(images[i].dataUrl)], { type: images[i].mime ?? 'image/png' }), { name: names[i], saveAs: false, mime: images[i].mime ?? 'image/png' });
  return true;
}

const REPORT_SECTIONS = ['overview', 'findings', 'protocols', 'talkers', 'problems', 'log'];

async function openReport() {
  const doc = activeDoc();
  if (!doc) return notify('info', t('notice.noCapture'));
  if (!doc.analysis || doc.analysisAt !== doc.passed) await runAnalysis(doc);
  const choice = await popups.open('report', { doc: doc.name, sections: REPORT_SECTIONS });
  if (!choice) return undefined;
  const sections = new Set(choice.sections ?? REPORT_SECTIONS);
  const report = buildReport({ title: doc.name, file: doc.path ?? doc.name, analysis: doc.analysis, log: state.log }, sections, t);
  const base = `${fileSafe(stripExtension(doc.name))}-report`;
  if (choice.format === 'print') {
    state.printReport = report.lines;
    return popups.open('print', { doc: doc.name, report: true, count: 1, displayed: 1, marked: 0, selected: 0 });
  }
  if (choice.format === 'markdown') return saveExport(`${base}.md`, 'md', report.markdown, 'text/markdown');
  // PDF and Word: the same report through docexport.js (the generated-on line becomes the subtitle).
  if (choice.format === 'pdf' || choice.format === 'docx') {
    const [first, ...rest] = report.blocks;
    return exportDoc({ title: report.title, subtitle: first?.type === 'p' ? first.text : '', blocks: first?.type === 'p' ? rest : report.blocks }, choice.format);
  }
  return saveExport(`${base}.html`, 'html', report.html, 'text/html');
}

// ───────────────────────── panels: fold / unfold

const FOLD_SETTING = { left: 'showLeftPanel', map: 'showNetMap', bottom: 'showBottomPanel', details: 'showDetails', bytes: 'showBytes' };
function togglePanel(which) {
  const key = FOLD_SETTING[which];
  if (!key) return;
  updateSettings({ [key]: !state.settings[key] });
  if (which === 'map' && state.settings.showNetMap) refreshMap();
}

// ───────────────────────── live capture

const isDemo = (id) => id === DEMO_ID;

async function refreshInterfaces({ quiet = true } = {}) {
  const demo = { id: DEMO_ID, name: DEMO_ID, friendly: t('capture.demoName'), description: t('capture.demoDescription'), addresses: ['192.168.0.0/24'], kind: 'demo', up: true, linktype: 1 };
  let list = [];
  if (desktop) {
    state.backend = await captureBackend().catch((error) => ({ available: false, error: native.errorText(error) }));
    if (state.backend?.available) {
      list = await listInterfaces().catch((error) => { if (!quiet) showError('error.interfaces', error); return []; });
    }
  } else state.backend = { available: false, error: 'web' };
  state.interfaces = [demo, ...list.map((iface) => ({
    id: iface.name, name: iface.name, friendly: iface.friendly || iface.description || iface.name, description: iface.description, addresses: iface.addresses ?? [],
    kind: iface.loopback ? 'loopback' : iface.wireless ? 'wifi' : /bluetooth/i.test(`${iface.friendly} ${iface.description}`) ? 'bluetooth' : /vmware|virtual|hyper-v|vethernet|docker|wsl|miniport/i.test(`${iface.friendly} ${iface.description}`) ? 'virtual' : 'ethernet',
    up: iface.up !== false, running: iface.running, linktype: iface.linktype,
  }))];
  if (!state.settings.captureInterface || !state.interfaces.some((i) => i.id === state.settings.captureInterface)) {
    const best = state.interfaces.find((i) => i.kind !== 'demo' && i.kind !== 'virtual' && i.kind !== 'loopback' && i.up && i.addresses.length) ?? state.interfaces[0];
    updateSettings({ captureInterface: best.id }, { quiet: true });
  }
  if (state.showStart || !activeDoc()) renderStartPage();
  return state.interfaces;
}

// ───────────────────────── setting up live capture (Npcap / libpcap / BPF rights)

/**
 * Makes live capture work on this computer, after asking: Windows downloads and installs Npcap, Linux installs
 * libpcap and gives the program the capture rights, macOS gives access to /dev/bpf* (src-tauri capture/setup.rs).
 * `startup`: the question at start-up, which offers "don't ask again". `reinstall`: also when all is in place.
 */
async function setupCapture({ reinstall = false, startup = false } = {}) {
  if (!desktop) return false;
  const info = await captureSetupInfo().catch(() => null);
  if (!info) return false;
  if (!reinstall && !info.needed) { notify('success', t('setup.ready', { version: info.version ?? '' })); return true; }
  const what = reinstall ? 'reinstall' : info.needed;
  const buttons = [
    ...(startup ? [{ id: 'never', label: t('setup.never') }] : []),
    { id: 'cancel', label: t(startup ? 'setup.later' : 'confirm.cancel') },
    { id: 'manual', label: t('setup.manual'), icon: 'copy' },
    ...(info.automatic ? [{ id: 'go', label: t(reinstall ? 'setup.reinstall' : 'setup.install'), icon: 'download', primary: true }] : []),
  ];
  const choice = await ask({
    icon: 'interfaces',
    title: t(`setup.title.${info.os}`, null, t('setup.title.other')),
    message: [t(`setup.why.${what}`), t(`setup.how.${info.os}`, null, t('setup.how.other')), info.automatic ? '' : t('setup.noAuto')].filter(Boolean).join('\n\n'),
    buttons,
  });
  if (choice === 'never') { updateSettings({ captureSetupAsk: false }, { quiet: true }); notify('info', t('setup.neverNote')); return false; }
  if (choice === 'manual') { await copyText(info.manual, t('setup.manualWhat')); return false; }
  if (choice !== 'go') return false;
  addLog('info', t('setup.started'));
  const stop = await onCaptureSetup((s) => { const text = t(`setup.step.${s.step}`, { detail: s.detail ?? '' }); notify('info', text); addLog('info', text); }).catch(() => () => {});
  let result;
  try {
    result = await runCaptureSetup(reinstall);
  } catch (error) {
    result = { ok: false, restart: false, message: native.errorText(error) };
  } finally {
    stop?.();
  }
  if (!result.ok) {
    if (result.message === 'cancelled') { notify('info', t('setup.cancelled')); addLog('info', t('setup.cancelled')); return false; }
    addLog('error', t('setup.failed', { message: result.message }));
    showError('setup.failedTitle', Object.assign(new Error(result.message), { stack: info.manual }), t('setup.manualHint', { command: info.manual }));
    return false;
  }
  // Installed already (and as new as there is): nothing was opened or changed.
  if (String(result.message).startsWith('uptodate:')) {
    const version = result.message.slice('uptodate:'.length);
    notify('success', t('setup.upToDate', { version }));
    addLog('info', t('setup.upToDate', { version }));
    return true;
  }
  addLog('success', t('setup.done', { message: result.message }));
  if (result.restart) {
    const again = await ask({ icon: 'refresh', title: t('setup.restartTitle'), message: t('setup.restartMessage'), buttons: [{ id: 'later', label: t('setup.later') }, { id: 'restart', label: t('setup.restartNow'), icon: 'refresh', primary: true }] });
    if (again === 'restart') native.invoke('restart_app').catch(() => {});
    return true;
  }
  await refreshInterfaces({ quiet: false });
  notify('success', t('setup.doneNotice', { count: Math.max(0, state.interfaces.length - 1) }));
  return true;
}

/** At start-up: when live capture cannot work here, ask once (unless the user said not to). */
async function offerCaptureSetup() {
  if (!desktop || !state.settings.captureSetupAsk) return;
  const info = await captureSetupInfo().catch(() => null);
  if (info?.needed) setupCapture({ startup: true });
}

// ───────────────────────── interface activity lights (start page, capture card)

/** Each interface's last packet counter and whether it moved in the last second (true / false; null = not known yet). */
const activity = { counts: new Map(), moving: new Map(), timer: null, busy: false };

/** Reads the system's interface counters every second while the start page is on screen. */
function watchActivity() {
  if (activity.timer) return;
  activity.timer = setInterval(pollActivity, 1000);
  pollActivity();
}

async function pollActivity() {
  if (activity.busy || document.hidden || !(state.showStart || !activeDoc())) return;
  activity.busy = true;
  try {
    const list = desktop && state.backend?.available ? await interfaceActivity().catch(() => []) : [];
    const now = new Map(list.map((a) => [a.name, a.packets]));
    for (const iface of state.interfaces) {
      // The demo interface makes packets whenever it is captured: it is always ready.
      if (iface.kind === 'demo') { activity.moving.set(iface.id, true); continue; }
      const count = now.get(iface.id);
      const before = activity.counts.get(iface.id);
      activity.moving.set(iface.id, count == null || before == null ? null : count > before);
      if (count != null) activity.counts.set(iface.id, count);
    }
  } finally {
    activity.busy = false;
  }
  paintActivity();
}

/** Puts the lights on the rows of the capture card (also right after the start page is drawn again). */
function paintActivity() {
  for (const led of root.querySelectorAll('#start-page [data-led]')) {
    const moving = activity.moving.get(led.dataset.led);
    led.classList.toggle('on', moving === true);
    led.classList.toggle('off', moving === false);
    const label = t(moving === true ? 'start.ifaceActive' : moving === false ? 'start.ifaceIdle' : 'start.ifaceUnknown');
    led.setAttribute('aria-label', label);
    led.title = label;
  }
}

const captureDocs = () => state.docs.filter((doc) => doc.capture);
const capturing = () => Boolean(activeDoc()?.capture) || captureDocs().length > 0;

async function startLiveCapture(ifaceId = state.settings.captureInterface, { restart = null } = {}) {
  const s = state.settings;
  const iface = state.interfaces.find((i) => i.id === ifaceId) ?? state.interfaces[0];
  if (!iface) return null;
  if (s.captureFilter.trim() && !isDemo(iface.id)) updateSettings({ recentCaptureFilters: pushRecentFilter(s.recentCaptureFilters, s.captureFilter) }, { quiet: true });
  const file = {
    format: 'pcapng', name: '', size: 0, frames: [],
    interfaces: [{ name: iface.name, description: iface.friendly, linktype: iface.linktype ?? 1, snaplen: s.captureSnaplen, tsresol: 9, filter: isDemo(iface.id) ? '' : s.captureFilter }],
    section: { application: `MyNetManager ${VERSION}`, os: state.info?.os ?? navigator.platform },
  };
  const stamp = new Date();
  const name = `${fileSafe(iface.friendly)}_${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}_${String(stamp.getHours()).padStart(2, '0')}${String(stamp.getMinutes()).padStart(2, '0')}${String(stamp.getSeconds()).padStart(2, '0')}.pcapng`;
  const doc = restart ?? addDoc(new CaptureDoc({ name, file, prefs: dissectPrefs(), live: true }));
  if (restart) {
    restart.file = file;
    await restart.redissect(dissectPrefs());
    restart.selected = -1;
    restart.marked.clear(); restart.ignored.clear(); restart.timeRefs.clear();
  }
  doc.live = true;
  doc.dirty = true;
  doc.iface = iface;
  doc.captureStarted = Date.now();
  doc.capturedBytes = 0;
  const onFrames = (frames) => {
    for (const frame of frames) {
      frame.iface = 0;
      frame.no = doc.file.frames.length + 1;
      doc.file.frames.push(frame);
      doc.capturedBytes += frame.caplen;
    }
    scheduleLiveUpdate(doc);
    checkAutoStop(doc);
  };
  try {
    if (isDemo(iface.id)) {
      const demo = new DemoTraffic({ seed: Date.now() % 100000, rate: s.demoRate });
      let last = Date.now() / 1000;
      demo.next(last);
      const timer = setInterval(() => {
        const now = Date.now() / 1000;
        const frames = demo.next(now).map((f) => ({ ...f, linktype: f.linktype ?? 1 }));
        doc.stats = { recv: (doc.stats.recv ?? 0) + frames.length, drop: 0 };
        last = now;
        if (frames.length) onFrames(frames);
      }, 100);
      doc.capture = { demo: true, stop: async () => { clearInterval(timer); return doc.stats; }, stats: async () => doc.stats };
    } else {
      // Npcap for administrators only: Windows asks for permission (UAC) the first time; say so before it appears.
      if (state.backend?.needsPrompt) notify('info', t('capture.uacNotice'));
      const handle = await startCapture({
        iface: iface.name, snaplen: s.captureSnaplen, promisc: s.capturePromisc, monitor: s.captureMonitor, filter: s.captureFilter.trim(), bufferMb: s.captureBufferMb, timeoutMs: 100,
      }, onFrames);
      doc.file.interfaces[0].linktype = handle.linktype;
      doc.capture = handle;
      if (handle.warning) notify('info', handle.warning);
    }
  } catch (error) {
    doc.capture = null;
    doc.live = false;
    renderAll();
    showError('error.captureStart', error, iface.friendly);
    if (!restart && !doc.count) closeDoc(doc, { force: true });
    return null;
  }
  doc.statsTimer = setInterval(async () => { try { doc.stats = (await doc.capture?.stats?.()) ?? doc.stats; renderStatus(); } catch { /* ended */ } }, 1000);
  notify('success', t('notice.captureStarted', { name: iface.friendly }));
  renderAll();
  return doc;
}

const liveTimers = new Map();
function scheduleLiveUpdate(doc) {
  if (liveTimers.has(doc.id)) return;
  liveTimers.set(doc.id, setTimeout(() => {
    liveTimers.delete(doc.id);
    const atEnd = state.view?.list.atEnd() ?? true;
    doc.passNew();
    renderTabs();
    if (doc !== activeDoc() || !state.view) return;
    state.view.list.draw(true);
    if (state.settings.autoScroll && atEnd) state.view.list.scrollToEnd();
    if (doc.selected < 0 && doc.displayed.length) selectFrame(doc, doc.displayed[0], { remember: false });
    renderStatus();
    state.view.renderFilterBar?.();
    if (state.settings.showNetMap && (!doc.mapAt || Date.now() - doc.mapAt > 3000)) { doc.mapAt = Date.now(); refreshMap({ keepPlaces: true }); }
    if (!doc.analysisRunAt || Date.now() - doc.analysisRunAt > 2000) { doc.analysisRunAt = Date.now(); runAnalysis(doc); }
  }, 200));
}

function checkAutoStop(doc) {
  const s = state.settings;
  const reason = (s.captureStopPackets && doc.count >= s.captureStopPackets) ? 'packets'
    : (s.captureStopSeconds && Date.now() - doc.captureStarted >= s.captureStopSeconds * 1000) ? 'seconds'
      : (s.captureStopMegabytes && doc.capturedBytes >= s.captureStopMegabytes * 1e6) ? 'size' : null;
  if (reason) { stopLiveCapture(doc); notify('info', t(`notice.autoStop.${reason}`)); }
}

async function stopLiveCapture(doc = activeDoc()) {
  if (!doc?.capture) return;
  const capture = doc.capture;
  doc.capture = null;
  clearInterval(doc.statsTimer);
  try { doc.stats = (await capture.stop()) ?? doc.stats; } catch (error) { showError('error.captureStop', error); }
  doc.passNew();
  doc.live = false;
  refreshAfterChange(doc);
  refreshMap();
  runAnalysis(doc);
  notify('success', t('notice.captureStopped', { count: doc.count }));
}

async function restartLiveCapture() {
  const doc = activeDoc();
  if (!doc) return;
  const iface = doc.iface?.id ?? state.settings.captureInterface;
  await stopLiveCapture(doc);
  await startLiveCapture(iface, { restart: doc });
}

async function toggleCapture() {
  const doc = activeDoc();
  if (doc?.capture) return stopLiveCapture(doc);
  return startLiveCapture();
}

async function openCaptureOptions() {
  if (state.interfaces.length <= 1) await refreshInterfaces();
  const result = await popups.open('capopts', { interfaces: state.interfaces, backend: state.backend, saved: loadSavedFilters().capture });
  if (result?.start) startLiveCapture(state.settings.captureInterface);
}

// ───────────────────────── marks, time, comments

function selectedIndices() {
  const doc = activeDoc();
  return doc && doc.selected >= 0 ? [doc.selected] : [];
}

function redrawList() { state.view?.list.draw(true); renderStatus(); renderToolbarState(); }

async function editComment() {
  const doc = activeDoc();
  if (!doc || doc.selected < 0) return;
  const frame = doc.frames[doc.selected];
  const result = await popups.open('prompt', { icon: 'packetComment', title: t('action.packetComment'), label: t('comment.label', { no: doc.selected + 1 }), value: frame.comment ?? '', multiline: true });
  if (result?.value == null) return;
  if (doc.setComment(doc.selected, result.value)) { state.view?.showSelected(); renderAll(); notify('success', t('notice.commentSaved')); }
}

async function timeShift() {
  const doc = activeDoc();
  if (!doc) return;
  const result = await popups.open('timeshift', { count: doc.count, selected: doc.selected + 1 });
  if (!result) return;
  const shift = Number(result.seconds);
  if (!Number.isFinite(shift) || !shift) return;
  const delta = BigInt(Math.round(shift * 1e9));
  const frames = result.selectedOnly && doc.selected >= 0 ? [doc.frames[doc.selected]] : doc.frames;
  for (const frame of frames) {
    const total = BigInt(frame.sec) * 1000000000n + BigInt(frame.nsec) + delta;
    frame.sec = Number(total / 1000000000n);
    frame.nsec = Number(total % 1000000000n);
  }
  doc.dirty = true;
  await runPass(doc, (options) => doc.redissect(dissectPrefs(), options));
  refreshAfterChange(doc);
  notify('success', t('notice.timeShifted', { seconds: shift }));
}

// ───────────────────────── find packet

async function openFind() {
  const doc = activeDoc();
  if (!doc) return;
  const result = await popups.open('find', { ...state.find });
  if (!result) return;
  state.find = { ...state.find, ...result };
  findPacket(1);
}

function findPacket(direction) {
  const doc = activeDoc();
  if (!doc || !state.find.text) return openFind();
  const f = state.find;
  const list = state.view.list.list();
  let row = list.indexOf(doc.selected);
  let test;
  if (f.mode === 'filter') {
    const check = validateFilter(f.text, { fields: FIELDS });
    if (check.status === 'invalid') return notify('error', t('filter.invalid', { error: check.error ?? f.text }));
    test = (i) => analysis.matchesFilter(doc, i, f.text);
  } else if (f.mode === 'hex') {
    const bytes = String(f.text).replace(/[^0-9a-f]/gi, '').match(/../g)?.map((h) => parseInt(h, 16)) ?? [];
    if (!bytes.length) return notify('error', t('find.badHex'));
    test = (i) => indexOfBytes(doc.frames[i].data, bytes) >= 0;
  } else {
    const needle = f.matchCase ? f.text : f.text.toLowerCase();
    const norm = (s) => (f.matchCase ? s : s.toLowerCase());
    test = (i) => {
      if (f.where === 'list') { const s = doc.summaries[i]; return norm(`${s.src} ${s.dst} ${s.protocol} ${s.info}`).includes(needle); }
      if (f.where === 'bytes') return norm(new TextDecoder('latin1').decode(doc.frames[i].data)).includes(needle);
      return analysis.treeText(doc.dissectOnce(i)).some((line) => norm(line).includes(needle));
    };
  }
  for (let step = 1; step <= list.length; step += 1) {
    const next = (row + direction * step + list.length * 2) % list.length;
    if (test(list[next])) { selectFrame(doc, list[next], { reveal: true }); return undefined; }
  }
  return notify('info', t('find.notFound', { text: f.text }));
}

function indexOfBytes(data, bytes) {
  outer: for (let i = 0; i + bytes.length <= data.length; i += 1) {
    for (let j = 0; j < bytes.length; j += 1) if (data[i + j] !== bytes[j]) continue outer;
    return i;
  }
  return -1;
}

// ───────────────────────── copy

async function copyText(text, what = '') {
  try {
    await native.clipboardWrite(text);
    notify('success', t('notice.copied', { what: what || t('copy.text') }));
  } catch (error) {
    showError('error.copy', error);
  }
}

function copyAs(kind) {
  const doc = activeDoc();
  if (!doc || doc.selected < 0) return undefined;
  const node = state.view?.details.selected;
  const d = doc.dissection(doc.selected);
  switch (kind) {
    case 'summary': return copyText(analysis.summaryLine(doc, doc.selected, state.settings), t('copy.summary'));
    case 'summaryCsv': return copyText(analysis.summaryCsv(doc, doc.selected, state.settings), t('copy.summaryCsv'));
    case 'details': return copyText(analysis.treeText(d, { all: true }).join('\n'), t('copy.details'));
    case 'visible': return copyText(analysis.treeText(d, { expanded: state.view.details.expanded }).join('\n'), t('copy.visible'));
    case 'hexDump': return copyText(analysis.hexDump(doc.frames[doc.selected].data), t('copy.hexDump'));
    case 'hex': return copyText(Array.from(doc.frames[doc.selected].data, (b) => b.toString(16).padStart(2, '0')).join(''), t('copy.hex'));
    case 'json': return copyText(JSON.stringify(analysis.jsonOf(d), null, 2), 'JSON');
    case 'field': return node ? copyText(node.label, t('copy.field')) : undefined;
    case 'value': return node ? copyText(displayValue(node), t('copy.value')) : undefined;
    case 'filter': { const f = node ? filterForNode(node, { mode: 'selected' }) : null; return f ? copyText(f, t('copy.filter')) : notify('info', t('notice.noFilterForField')); }
    case 'nodeBytes': return node?.length ? copyText(Array.from(d.sources[node.source ?? 0].data.subarray(node.start, node.start + node.length), (b) => b.toString(16).padStart(2, '0')).join(''), t('copy.bytes')) : undefined;
    default: return undefined;
  }
}

// ───────────────────────── columns

function updateColumns(columns) {
  updateSettings({ columns }, { quiet: true });
  state.view?.list.render();
}

function applyAsColumn() {
  const node = state.view?.details.selected;
  if (!node?.abbrev) return notify('info', t('notice.selectField'));
  const columns = state.settings.columns.map((c) => ({ ...c }));
  if (columns.some((c) => c.kind === 'field' && c.field === node.abbrev)) return notify('info', t('notice.columnExists', { name: node.abbrev }));
  const info = FIELDS.get(node.abbrev);
  const at = Math.max(0, columns.findIndex((c) => c.kind === 'info'));
  columns.splice(at, 0, { id: `f-${node.abbrev}-${Date.now() % 10000}`, kind: 'field', field: node.abbrev, title: info?.name ?? node.abbrev, width: 130, visible: true });
  updateColumns(columns);
  return notify('success', t('notice.columnAdded', { name: info?.name ?? node.abbrev }));
}

// ───────────────────────── statistics, analysis windows (popups-net.js draws them)

const statsSource = (displayedOnly) => {
  const doc = activeDoc();
  if (!doc) return null;
  const indices = displayedOnly ? doc.displayed : Array.from({ length: doc.passed }, (_, i) => i);
  return { doc, indices, frames: indices.map((i) => doc.frames[i]), summaries: indices.map((i) => doc.summaries[i]), get: (frame) => doc.dissectOnce((frame.no ?? 1) - 1) };
};

function openStats(statKind, extra = {}) {
  if (!activeDoc()) return notify('info', t('notice.noCapture'));
  const kind = ['iograph', 'tcpgraph'].includes(statKind) ? 'chart' : statKind === 'flow' ? 'flowgraph' : statKind === 'follow' ? 'follow' : 'stats';
  return popups.open(kind, { statKind, doc: activeDoc().name, ...extra });
}

function postStats(data, kind) {
  const src = statsSource(Boolean(data.displayedOnly));
  if (!src) return;
  let result;
  try {
    result = analysis.computeStat(data.statKind, src, { ...data.options, settings: state.settings, t, lang: lang() });
  } catch (error) {
    result = { error: native.errorText(error) };
  }
  popups.post(kind, { type: 'stats-data', statKind: data.statKind, result });
}

function followCurrent(kind) {
  const doc = activeDoc();
  if (!doc || doc.selected < 0) return notify('info', t('notice.selectPacket'));
  const d = doc.dissection(doc.selected);
  const value = (name) => d.fields?.get(name)?.[0]?.value;
  const index = { tcp: value('tcp.stream'), udp: value('udp.stream'), tls: value('tcp.stream'), http: value('tcp.stream'), http2: value('tcp.stream'), quic: value('quic.connection.number') ?? value('udp.stream') }[kind];
  if (index == null) return notify('info', t('notice.noStream', { kind: kind.toUpperCase() }));
  const filter = followFilter(kind === 'quic' ? 'quic' : kind === 'udp' ? 'udp' : 'tcp', index);
  state.view.setFilterText(filter);
  applyDisplayFilter(filter);
  return openStats('follow', { kind, index: Number(index) });
}

async function exportDissections(format) {
  const doc = activeDoc();
  if (!doc) return undefined;
  const result = await popups.open('export', { format, count: doc.count, displayed: doc.displayed.length, marked: doc.marked.size, selected: doc.selected + 1 });
  if (!result) return undefined;
  try {
    const out = analysis.exportDoc(doc, { ...result, format: result.format ?? format, settings: state.settings, expanded: state.view?.details.expanded });
    const base = fileSafe(stripExtension(doc.name));
    if (out.bytes) return saveExport(`${base}.${out.extension}`, out.extension, out.bytes, 'application/octet-stream');
    return saveExport(`${base}.${out.extension}`, out.extension, out.text, out.mime ?? 'text/plain');
  } catch (error) {
    return showError('error.export', error);
  }
}

async function mergeFile() {
  const doc = activeDoc();
  if (!doc) return;
  let other = null;
  try {
    if (desktop) {
      const [path] = await native.chooseCapturesToOpen(state.settings.lastDirectory);
      if (!path) return;
      other = await readCaptureAsync(await native.readBinaryFile(path), baseName(path));
    } else {
      const [file] = await native.pickCaptureFilesWeb();
      if (!file) return;
      other = await readCaptureAsync(file.content, file.name);
    }
  } catch (error) {
    showError('error.open', error);
    return;
  }
  const choice = await ask({ icon: 'mergeFiles', title: t('action.merge'), message: t('merge.message', { a: doc.count, b: other.frames.length }), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'append', label: t('merge.append'), icon: 'goLast' }, { id: 'time', label: t('merge.chronological'), icon: 'timeReference', primary: true }] });
  if (choice === 'cancel' || !choice) return;
  const ifaceBase = doc.file.interfaces.length;
  doc.file.interfaces.push(...other.interfaces);
  const added = other.frames.map((f) => ({ ...f, iface: (f.iface ?? 0) + ifaceBase }));
  const all = [...doc.frames, ...added];
  if (choice === 'time') all.sort((a, b) => a.sec - b.sec || a.nsec - b.nsec);
  all.forEach((f, i) => { f.no = i + 1; });
  doc.file.frames = all;
  doc.dirty = true;
  await runPass(doc, (options) => doc.redissect(dissectPrefs(), options));
  refreshAfterChange(doc);
  refreshMap();
  notify('success', t('notice.merged', { count: added.length }));
}

/** Decode As / name resolution / protocol changes: every capture is dissected again. */
async function redissectAll() {
  for (const doc of state.docs) {
    if (doc.capture) continue;
    await runPass(doc, (options) => doc.redissect(dissectPrefs(), options));
    if (doc === activeDoc()) { refreshAfterChange(doc); refreshMap(); }
    runAnalysis(doc);
  }
}

function refreshAfterChange(doc = activeDoc()) {
  if (doc !== activeDoc() || !state.view) { renderTabs(); return; }
  doc.colors.clear();
  state.view.refresh();
  renderStatus();
  renderTabs();
  renderToolbarState();
}

// ───────────────────────── print

/**
 * Print… and Export ▸ (HTML, Markdown, PDF, Word) for one part of the capture in a context menu: the right-clicked
 * packet, its details, its bytes, or the packet list. `preset` is the print model's options for that part (range,
 * summary, details, bytes); the print window opens with them, and an export writes the same lines.
 */
function partMenu(preset, title) {
  const formats = [['html', 'protoWeb'], ['markdown', 'notes'], ['pdf', 'exportReport'], ['docx', 'exportFile']];
  const enabled = Boolean(activeDoc());
  return {
    items: [
      { separator: true },
      { id: 'custom:part:print', label: t('context.print'), icon: 'print', disabled: !enabled },
      {
        id: 'submenu:partExport', label: t('context.export'), icon: 'exportFile', submenu: true, disabled: !enabled,
        children: formats.map(([id, glyph]) => ({ id: `custom:part:export:${id}`, label: t(`docExport.${id}`), icon: glyph })),
      },
    ],
    handlers: {
      'custom:part:print': () => printPackets(preset),
      ...Object.fromEntries(formats.map(([id]) => [`custom:part:export:${id}`, () => exportPart(preset, title, id)])),
    },
  };
}

/** One part of the capture (partMenu) as a document: the same lines the print window would print. */
function exportPart(preset, title, format) {
  const doc = activeDoc();
  if (!doc) return undefined;
  let model;
  try {
    model = analysis.printModel(doc, { ...defaultPrintOptions(), ...preset, settings: state.settings, expanded: state.view?.details.expanded, t });
  } catch (error) { return showError('error.export', error); }
  const lines = model.packets.flatMap((packet, i) => (i ? ['', ...packet.lines] : packet.lines));
  return exportDoc({ title: title || doc.name, subtitle: doc.name, pre: lines }, format);
}

/** File › Print: the print window (its own window) asks for the packet lines with 'print-request'. */
function printPackets(preset = null) {
  const doc = activeDoc();
  if (!doc) return undefined;
  // preset (context menus): what to print — that packet, its details, its bytes or the list — over the saved options.
  return popups.open('print', { doc: doc.name, count: doc.count, displayed: doc.displayed.length, marked: doc.marked.size, selected: doc.selected + 1, preset });
}

// ───────────────────────── commands

const hasDoc = () => Boolean(activeDoc()) && !state.showStart;
const hasSel = () => hasDoc() && activeDoc().selected >= 0;
const hasNode = () => hasSel() && Boolean(state.view?.details.selected);
const toggle = (key) => updateSettings({ [key]: !state.settings[key] });
const fieldOf = (name) => { const doc = activeDoc(); return hasSel() ? doc.dissection(doc.selected).fields?.get(name)?.[0]?.value : undefined; };

const commands = {
  // File
  open: { icon: 'folderOpen', label: 'action.open', key: 'Ctrl+O', run: () => openWithDialog() },
  recent: { icon: 'recent', label: 'action.recent', run: () => popups.open('recent', {}) },
  merge: { icon: 'mergeFiles', label: 'action.merge', enabled: hasDoc, run: () => mergeFile() },
  closeTab: { icon: 'closeTab', label: 'action.closeTab', key: 'Ctrl+W', enabled: () => Boolean(activeDoc()), run: () => closeDoc(activeDoc()) },
  closeAll: { icon: 'closeAll', label: 'action.closeAll', enabled: () => state.docs.length > 0, run: () => closeAll() },
  save: { icon: 'save', label: 'action.save', key: 'Ctrl+S', enabled: hasDoc, run: () => saveDoc(activeDoc()) },
  saveAs: { icon: 'saveAs', label: 'action.saveAs', key: 'Ctrl+Shift+S', enabled: hasDoc, run: () => saveDoc(activeDoc(), { saveAs: true }) },
  savePcap: { icon: 'saveAs', label: 'action.savePcap', enabled: hasDoc, run: () => saveDoc(activeDoc(), { saveAs: true, format: 'pcap' }) },
  exportSpecified: { icon: 'exportPackets', label: 'action.exportSpecified', enabled: hasDoc, run: () => exportDissections('pcapng') },
  exportText: { icon: 'exportDissections', label: 'action.exportText', enabled: hasDoc, run: () => exportDissections('text') },
  exportCsv: { icon: 'csvFile', label: 'action.exportCsv', enabled: hasDoc, run: () => exportDissections('csv') },
  exportJson: { icon: 'exportDissections', label: 'action.exportJson', enabled: hasDoc, run: () => exportDissections('json') },
  exportPdml: { icon: 'exportDissections', label: 'action.exportPdml', enabled: hasDoc, run: () => exportDissections('pdml') },
  exportPsml: { icon: 'exportDissections', label: 'action.exportPsml', enabled: hasDoc, run: () => exportDissections('psml') },
  exportC: { icon: 'exportDissections', label: 'action.exportC', enabled: hasDoc, run: () => exportDissections('c') },
  exportBytes: { icon: 'exportFile', label: 'action.exportBytes', enabled: hasNode, run: () => { const doc = activeDoc(); const node = state.view.details.selected; const d = doc.dissection(doc.selected); const data = d.sources[node.source ?? 0].data.subarray(node.start, node.start + node.length); return saveExport(`${fileSafe(node.abbrev ?? 'bytes')}.bin`, 'bin', data, 'application/octet-stream'); } },
  exportObjectsHttp: { icon: 'exportObjects', label: 'action.exportObjectsHttp', enabled: hasDoc, run: () => openStats('objects', { objectKind: 'http' }) },
  exportObjectsTftp: { icon: 'exportObjects', label: 'action.exportObjectsTftp', enabled: hasDoc, run: () => openStats('objects', { objectKind: 'tftp' }) },
  exportObjectsImf: { icon: 'exportObjects', label: 'action.exportObjectsImf', enabled: hasDoc, run: () => openStats('objects', { objectKind: 'imf' }) },
  exportObjectsFtp: { icon: 'exportObjects', label: 'action.exportObjectsFtp', enabled: hasDoc, run: () => openStats('objects', { objectKind: 'ftp-data' }) },
  print: { icon: 'print', label: 'action.print', key: 'Ctrl+P', enabled: hasDoc, run: () => printPackets() },
  startPage: { icon: 'home', label: 'action.startPage', key: 'Ctrl+Shift+H', run: () => showStartPage(true) },
  exit: { icon: 'exit', label: 'action.exit', key: 'Ctrl+Q', run: () => requestExit() },
  // Edit
  copySummary: { icon: 'copy', label: 'action.copySummary', enabled: hasSel, run: () => copyAs('summary') },
  copySummaryCsv: { icon: 'copy', label: 'action.copySummaryCsv', enabled: hasSel, run: () => copyAs('summaryCsv') },
  copyDetails: { icon: 'copy', label: 'action.copyDetails', enabled: hasSel, run: () => copyAs('details') },
  copyVisible: { icon: 'copy', label: 'action.copyVisible', enabled: hasSel, run: () => copyAs('visible') },
  copyHexDump: { icon: 'copy', label: 'action.copyHexDump', enabled: hasSel, run: () => copyAs('hexDump') },
  copyHex: { icon: 'copy', label: 'action.copyHex', enabled: hasSel, run: () => copyAs('hex') },
  copyJson: { icon: 'copy', label: 'action.copyJson', enabled: hasSel, run: () => copyAs('json') },
  copyField: { icon: 'copyValue', label: 'action.copyField', enabled: hasNode, run: () => copyAs('field') },
  copyValue: { icon: 'copyValue', label: 'action.copyValue', enabled: hasNode, run: () => copyAs('value') },
  copyFilter: { icon: 'copyValue', label: 'action.copyFilter', enabled: hasNode, run: () => copyAs('filter') },
  copyNodeBytes: { icon: 'copyValue', label: 'action.copyNodeBytes', enabled: hasNode, run: () => copyAs('nodeBytes') },
  findPacket: { icon: 'findPacket', label: 'action.findPacket', key: 'Ctrl+F', enabled: hasDoc, run: () => openFind() },
  findNext: { icon: 'goNext', label: 'action.findNext', key: 'Ctrl+N', enabled: hasDoc, run: () => findPacket(1) },
  findPrev: { icon: 'goPrev', label: 'action.findPrev', key: 'Ctrl+B', enabled: hasDoc, run: () => findPacket(-1) },
  markPacket: { icon: 'markPacket', label: 'action.markPacket', key: 'Ctrl+M', enabled: hasSel, run: () => { activeDoc().toggleMark(selectedIndices()); redrawList(); } },
  markAll: { icon: 'markPacket', label: 'action.markAll', enabled: hasDoc, run: () => { activeDoc().toggleMark([...activeDoc().displayed]); redrawList(); } },
  unmarkAll: { icon: 'markPacket', label: 'action.unmarkAll', enabled: () => hasDoc() && activeDoc().marked.size > 0, run: () => { activeDoc().marked.clear(); redrawList(); } },
  nextMark: { icon: 'goNext', label: 'action.nextMark', enabled: () => hasDoc() && activeDoc().marked.size > 0, run: () => goMark(1, (d) => d.marked) },
  prevMark: { icon: 'goPrev', label: 'action.prevMark', enabled: () => hasDoc() && activeDoc().marked.size > 0, run: () => goMark(-1, (d) => d.marked) },
  ignorePacket: { icon: 'ignorePacket', label: 'action.ignorePacket', key: 'Ctrl+D', enabled: hasSel, run: () => { activeDoc().toggleIgnore(selectedIndices()); redrawList(); } },
  ignoreAll: { icon: 'ignorePacket', label: 'action.ignoreAll', enabled: hasDoc, run: () => { activeDoc().toggleIgnore([...activeDoc().displayed]); redrawList(); } },
  unignoreAll: { icon: 'ignorePacket', label: 'action.unignoreAll', enabled: () => hasDoc() && activeDoc().ignored.size > 0, run: () => { activeDoc().ignored.clear(); redrawList(); } },
  timeReference: { icon: 'timeReference', label: 'action.timeReference', key: 'Ctrl+T', enabled: hasSel, run: () => { activeDoc().toggleTimeRef(activeDoc().selected); redrawList(); } },
  unsetTimeRefs: { icon: 'timeReference', label: 'action.unsetTimeRefs', enabled: () => hasDoc() && activeDoc().timeRefs.size > 0, run: () => { activeDoc().timeRefs.clear(); redrawList(); } },
  nextTimeRef: { icon: 'goNext', label: 'action.nextTimeRef', enabled: () => hasDoc() && activeDoc().timeRefs.size > 0, run: () => goMark(1, (d) => d.timeRefs) },
  prevTimeRef: { icon: 'goPrev', label: 'action.prevTimeRef', enabled: () => hasDoc() && activeDoc().timeRefs.size > 0, run: () => goMark(-1, (d) => d.timeRefs) },
  timeShift: { icon: 'timeShift', label: 'action.timeShift', enabled: hasDoc, run: () => timeShift() },
  packetComment: { icon: 'packetComment', label: 'action.packetComment', key: 'Ctrl+Alt+C', enabled: hasSel, run: () => editComment() },
  deleteComments: { icon: 'packetComment', label: 'action.deleteComments', enabled: () => hasDoc() && activeDoc().frames.some((f) => f.comment), run: async () => { const doc = activeDoc(); if (await ask({ icon: 'trash', title: t('action.deleteComments'), message: t('confirm.deleteComments'), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.delete'), icon: 'trash', danger: true, primary: true }] }) !== 'ok') return; doc.frames.forEach((f, i) => doc.setComment(i, '')); state.view?.showSelected(); renderAll(); } },
  settings: { icon: 'gear', label: 'action.settings', key: 'Ctrl+Shift+P', run: () => popups.open('settings', { tab: 'general' }) },
  // View
  filterBar: { icon: 'filterBar', label: 'action.filterBar', checked: () => state.settings.showFilterBar, run: () => toggle('showFilterBar') },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => state.settings.showStatusBar, run: () => toggle('showStatusBar') },
  paneList: { icon: 'paneList', label: 'action.paneList', checked: () => state.settings.showPacketList, run: () => toggle('showPacketList') },
  paneDetails: { icon: 'paneDetails', label: 'action.paneDetails', checked: () => state.settings.showDetails, run: () => toggle('showDetails') },
  paneBytes: { icon: 'paneBytes', label: 'action.paneBytes', checked: () => state.settings.showBytes, run: () => toggle('showBytes') },
  netMap: { icon: 'paneMap', label: 'action.netMap', key: 'Ctrl+Shift+N', checked: () => state.settings.showNetMap, run: () => togglePanel('map') },
  leftPanel: { icon: 'panelLeft', label: 'action.leftPanel', key: 'Ctrl+Shift+1', checked: () => state.settings.showLeftPanel, run: () => togglePanel('left') },
  rightPanel: { icon: 'panelRight', label: 'action.rightPanel', key: 'Ctrl+Shift+2', checked: () => state.settings.showNetMap, run: () => togglePanel('map') },
  bottomPanel: { icon: 'panelBottom', label: 'action.bottomPanel', key: 'Ctrl+J', checked: () => state.settings.showBottomPanel, run: () => togglePanel('bottom') },
  report: { icon: 'reportHtml', label: 'action.report', enabled: hasDoc, run: () => openReport() },
  analyzeNow: { icon: 'refresh', label: 'action.analyzeNow', enabled: hasDoc, run: async () => { await runAnalysis(); notify('success', t('notice.analyzed')); } },
  layoutStack: { icon: 'paneList', label: 'action.layoutStack', checked: () => state.settings.paneLayout === 'stack', run: () => updateSettings({ paneLayout: 'stack' }) },
  layoutDetailsRight: { icon: 'paneDetails', label: 'action.layoutDetailsRight', checked: () => state.settings.paneLayout === 'details-right', run: () => updateSettings({ paneLayout: 'details-right' }) },
  layoutBytesRight: { icon: 'paneBytes', label: 'action.layoutBytesRight', checked: () => state.settings.paneLayout === 'bytes-right', run: () => updateSettings({ paneLayout: 'bytes-right' }) },
  ...Object.fromEntries(TIME_FORMATS.map((f) => [`time:${f}`, { icon: 'clock', label: `time.${f}`, checked: () => state.settings.timeFormat === f, run: () => updateSettings({ timeFormat: f }) }])),
  ...Object.fromEntries(['auto', 0, 3, 6, 9].map((p) => [`precision:${p}`, { icon: 'clock', label: `precision.${p}`, checked: () => String(state.settings.timePrecision) === String(p), run: () => updateSettings({ timePrecision: p === 'auto' ? 'auto' : Number(p) }) }])),
  resolveMac: { icon: 'resolvedAddresses', label: 'action.resolveMac', checked: () => state.settings.resolveMac, run: async () => { toggle('resolveMac'); await redissectAll(); } },
  resolveTransport: { icon: 'resolvedAddresses', label: 'action.resolveTransport', checked: () => state.settings.resolveTransport, run: async () => { toggle('resolveTransport'); await redissectAll(); } },
  resolveNetwork: { icon: 'resolvedAddresses', label: 'action.resolveNetwork', checked: () => state.settings.resolveNetwork, run: async () => { toggle('resolveNetwork'); await redissectAll(); } },
  colorize: { icon: 'colorize', label: 'action.colorize', checked: () => state.settings.colorize, run: () => { toggle('colorize'); redrawList(); } },
  coloringRules: { icon: 'coloringRules', label: 'action.coloringRules', run: () => popups.open('coloring', {}) },
  textZoomIn: { icon: 'textZoomIn', label: 'action.textZoomIn', key: 'Ctrl+=', run: () => updateSettings({ textZoom: zoomStep(state.settings.textZoom, 1) }) },
  textZoomOut: { icon: 'textZoomOut', label: 'action.textZoomOut', key: 'Ctrl+-', run: () => updateSettings({ textZoom: zoomStep(state.settings.textZoom, -1) }) },
  textZoomReset: { icon: 'textZoomReset', label: 'action.textZoomReset', key: 'Ctrl+0', run: () => updateSettings({ textZoom: 100 }) },
  resizeColumns: { icon: 'resizeColumns', label: 'action.resizeColumns', key: 'Ctrl+Shift+R', enabled: hasDoc, run: () => state.view?.list.fitAll() },
  columnPrefs: { icon: 'columns', label: 'action.columnPrefs', run: () => popups.open('columns', {}) },
  expandSub: { icon: 'expandSub', label: 'action.expandSub', key: 'Ctrl+Right', enabled: hasNode, run: () => state.view.details.setSubtree(state.view.details.selected, true) },
  collapseSub: { icon: 'collapseAll', label: 'action.collapseSub', key: 'Ctrl+Left', enabled: hasNode, run: () => state.view.details.setSubtree(state.view.details.selected, false) },
  expandAll: { icon: 'expandAll', label: 'action.expandAll', key: 'Ctrl+Shift+Right', enabled: hasSel, run: () => state.view.details.setAll(true) },
  collapseAll: { icon: 'collapseAll', label: 'action.collapseAll', key: 'Ctrl+Shift+Left', enabled: hasSel, run: () => state.view.details.setAll(false) },
  bytesHex: { icon: 'paneBytes', label: 'action.bytesHex', checked: () => state.settings.bytesView === 'hex', run: () => { updateSettings({ bytesView: 'hex' }); state.view?.bytes.render(); } },
  bytesBits: { icon: 'paneBytes', label: 'action.bytesBits', checked: () => state.settings.bytesView === 'bits', run: () => { updateSettings({ bytesView: 'bits' }); state.view?.bytes.render(); } },
  bytesAscii: { icon: 'paneBytes', label: 'action.bytesAscii', checked: () => state.settings.bytesEncoding === 'ascii', run: () => { updateSettings({ bytesEncoding: 'ascii' }); state.view?.bytes.render(); } },
  bytesEbcdic: { icon: 'paneBytes', label: 'action.bytesEbcdic', checked: () => state.settings.bytesEncoding === 'ebcdic', run: () => { updateSettings({ bytesEncoding: 'ebcdic' }); state.view?.bytes.render(); } },
  packetWindow: { icon: 'showPacketWindow', label: 'action.packetWindow', enabled: hasSel, run: () => openStats('packet', { index: activeDoc().selected }) },
  reload: { icon: 'reload', label: 'action.reload', key: 'Ctrl+R', enabled: () => hasDoc() && !activeDoc().capture, run: async () => { const doc = activeDoc(); if (doc.path) { await closeDoc(doc, { force: !doc.dirty }); await openPath(doc.path); } else { await runPass(doc, (o) => doc.redissect(dissectPrefs(), o)); refreshAfterChange(doc); refreshMap(); } } },
  theme: { icon: 'palette', label: 'action.theme', run: () => updateSettings({ theme: randomThemeId(state.settings.theme) }) },
  themeMenu: { icon: 'palette', label: 'action.themeChoose', run: (context) => openThemePicker(context?.anchor) },
  language: { icon: 'globe', label: 'action.language', key: 'Ctrl+Shift+L', run: () => updateSettings({ language: lang() === 'ko' ? 'en' : 'ko' }) },
  shuffleBackground: { icon: 'dice', label: 'action.shuffleBackground', run: () => shuffleBackground() },
  // Go
  goPacket: { icon: 'goPacket', label: 'action.goPacket', key: 'Ctrl+G', enabled: hasDoc, run: () => goToPacket() },
  goFirst: { icon: 'goFirst', label: 'action.goFirst', key: 'Ctrl+Home', enabled: hasDoc, run: () => goRow(-Infinity) },
  goLast: { icon: 'goLast', label: 'action.goLast', key: 'Ctrl+End', enabled: hasDoc, run: () => goRow(Infinity) },
  goPrev: { icon: 'goPrev', label: 'action.goPrev', key: 'Ctrl+Up', enabled: hasDoc, run: () => goRow(-1) },
  goNext: { icon: 'goNext', label: 'action.goNext', key: 'Ctrl+Down', enabled: hasDoc, run: () => goRow(1) },
  goBack: { icon: 'goBack', label: 'action.goBack', key: 'Alt+Left', enabled: () => hasDoc() && activeDoc().history.back.length > 0, run: () => goHistory(-1) },
  goForward: { icon: 'goForward', label: 'action.goForward', key: 'Alt+Right', enabled: () => hasDoc() && activeDoc().history.forward.length > 0, run: () => goHistory(1) },
  goConversationPrev: { icon: 'goConversationPrev', label: 'action.goConversationPrev', key: 'Ctrl+,', enabled: hasSel, run: () => goConversation(-1) },
  goConversationNext: { icon: 'goConversationNext', label: 'action.goConversationNext', key: 'Ctrl+.', enabled: hasSel, run: () => goConversation(1) },
  goRelated: { icon: 'goPacket', label: 'action.goRelated', enabled: () => hasSel() && (activeDoc().relations?.size ?? 0) > 0, run: () => { const doc = activeDoc(); const next = [...doc.relations.keys()].find((i) => i !== doc.selected); if (next != null) selectFrame(doc, next, { reveal: true }); } },
  autoScroll: { icon: 'autoScroll', label: 'action.autoScroll', checked: () => state.settings.autoScroll, run: () => toggle('autoScroll') },
  // Capture
  captureOptions: { icon: 'captureOptions', label: 'action.captureOptions', key: 'Ctrl+K', run: () => openCaptureOptions() },
  captureStart: { icon: 'captureStart', label: 'action.captureStart', key: 'Ctrl+E', enabled: () => !activeDoc()?.capture, run: () => startLiveCapture() },
  captureStop: { icon: 'captureStop', label: 'action.captureStop', enabled: () => Boolean(activeDoc()?.capture), run: () => stopLiveCapture() },
  captureRestart: { icon: 'captureRestart', label: 'action.captureRestart', enabled: () => Boolean(activeDoc()?.capture), run: () => restartLiveCapture() },
  captureToggle: { icon: 'captureStart', label: 'action.captureToggle', run: () => toggleCapture() },
  captureFilters: { icon: 'captureFilterIcon', label: 'action.captureFilters', run: () => popups.open('filters', { which: 'capture' }) },
  interfaces: { icon: 'interfaces', label: 'action.interfaces', key: 'Ctrl+I', run: () => { showStartPage(true); refreshInterfaces({ quiet: false }); } },
  refreshInterfaces: { icon: 'refreshInterfaces', label: 'action.refreshInterfaces', run: async () => { await refreshInterfaces({ quiet: false }); notify('success', t('notice.interfaces', { count: state.interfaces.length - 1 })); } },
  // Analyze
  displayFilters: { icon: 'filterBookmark', label: 'action.displayFilters', run: () => popups.open('filters', { which: 'display' }) },
  filterExpression: { icon: 'filterExpression', label: 'action.filterExpression', run: () => openFilterExpression() },
  focusFilter: { icon: 'filterBar', label: 'action.focusFilter', key: 'Ctrl+/', enabled: hasDoc, run: () => { if (!state.settings.showFilterBar) updateSettings({ showFilterBar: true }); state.view?.focusFilter(); } },
  applyAsColumn: { icon: 'applyAsColumn', label: 'action.applyAsColumn', enabled: hasNode, run: () => applyAsColumn() },
  ...Object.fromEntries(['selected', 'not', 'and', 'or', 'andNot', 'orNot'].flatMap((how) => [
    [`applyFilter:${how}`, { icon: 'filterApply', label: `filterHow.${how}`, enabled: hasNode, run: () => filterFromNode(how, true) }],
    [`prepareFilter:${how}`, { icon: 'filterPrepare', label: `filterHow.${how}`, enabled: hasNode, run: () => filterFromNode(how, false) }],
  ])),
  ...Object.fromEntries(['eth', 'ip', 'ipv6', 'tcp', 'udp'].map((k) => [`conversation:${k}`, { icon: 'conversations', label: `conversationFilter.${k}`, enabled: () => hasSel() && fieldOf(k === 'ip' ? 'ip.src' : k === 'ipv6' ? 'ipv6.src' : k === 'eth' ? 'eth.src' : `${k}.srcport`) != null, run: () => applyConversationFilter(k) }])),
  enabledProtocols: { icon: 'enabledProtocols', label: 'action.enabledProtocols', run: () => popups.open('protocols', {}) },
  decodeAs: { icon: 'decodeAs', label: 'action.decodeAs', run: () => popups.open('decodeas', { current: currentDecodeCandidates() }) },
  followTcp: { icon: 'followStream', label: 'action.followTcp', key: 'Ctrl+Alt+Shift+T', enabled: () => fieldOf('tcp.stream') != null, run: () => followCurrent('tcp') },
  followUdp: { icon: 'followStream', label: 'action.followUdp', key: 'Ctrl+Alt+Shift+U', enabled: () => fieldOf('udp.stream') != null, run: () => followCurrent('udp') },
  followTls: { icon: 'followStream', label: 'action.followTls', key: 'Ctrl+Alt+Shift+S', enabled: () => fieldOf('tcp.stream') != null && fieldOf('tls.record.content_type') != null, run: () => followCurrent('tls') },
  followHttp: { icon: 'followStream', label: 'action.followHttp', key: 'Ctrl+Alt+Shift+H', enabled: () => fieldOf('tcp.stream') != null && (fieldOf('http.request') != null || fieldOf('http.response') != null), run: () => followCurrent('http') },
  followHttp2: { icon: 'followStream', label: 'action.followHttp2', enabled: () => fieldOf('http2.stream') != null, run: () => followCurrent('http2') },
  followQuic: { icon: 'followStream', label: 'action.followQuic', enabled: () => fieldOf('quic.connection.number') != null || (fieldOf('udp.stream') != null && fieldOf('quic.header_form') != null), run: () => followCurrent('quic') },
  expertInfo: { icon: 'expertInfo', label: 'action.expertInfo', key: 'Ctrl+Shift+E', enabled: hasDoc, run: () => openStats('expert') },
  // Statistics
  captureProperties: { icon: 'captureProperties', label: 'action.captureProperties', key: 'Ctrl+Alt+Shift+C', enabled: hasDoc, run: () => openStats('properties') },
  resolvedAddresses: { icon: 'resolvedAddresses', label: 'action.resolvedAddresses', enabled: hasDoc, run: () => openStats('resolved') },
  protocolHierarchy: { icon: 'protocolHierarchy', label: 'action.protocolHierarchy', enabled: hasDoc, run: () => openStats('hierarchy') },
  conversations: { icon: 'conversations', label: 'action.conversations', enabled: hasDoc, run: () => openStats('conversations') },
  endpoints: { icon: 'endpoints', label: 'action.endpoints', enabled: hasDoc, run: () => openStats('endpoints') },
  packetLengths: { icon: 'packetLengths', label: 'action.packetLengths', enabled: hasDoc, run: () => openStats('lengths') },
  ioGraph: { icon: 'ioGraph', label: 'action.ioGraph', enabled: hasDoc, run: () => openStats('iograph') },
  flowGraph: { icon: 'flowGraph', label: 'action.flowGraph', enabled: hasDoc, run: () => openStats('flow') },
  tcpGraph: { icon: 'tcpGraph', label: 'action.tcpGraph', enabled: () => fieldOf('tcp.stream') != null, run: () => openStats('tcpgraph', { stream: Number(fieldOf('tcp.stream')) }) },
  httpCounter: { icon: 'httpStats', label: 'action.httpCounter', enabled: hasDoc, run: () => openStats('httpCounter') },
  httpRequests: { icon: 'httpStats', label: 'action.httpRequests', enabled: hasDoc, run: () => openStats('httpRequests') },
  httpLoad: { icon: 'httpStats', label: 'action.httpLoad', enabled: hasDoc, run: () => openStats('httpLoad') },
  dnsStats: { icon: 'dnsStats', label: 'action.dnsStats', enabled: hasDoc, run: () => openStats('dns') },
  ipv4Stats: { icon: 'endpoints', label: 'action.ipv4Stats', enabled: hasDoc, run: () => openStats('ipStats', { version: 4 }) },
  ipv6Stats: { icon: 'endpoints', label: 'action.ipv6Stats', enabled: hasDoc, run: () => openStats('ipStats', { version: 6 }) },
  portTypes: { icon: 'endpoints', label: 'action.portTypes', enabled: hasDoc, run: () => openStats('ports') },
  netMapWindow: { icon: 'paneMap', label: 'action.netMapPanel', enabled: hasDoc, run: () => { if (!state.settings.showNetMap) commands.netMap.run(); else refreshMap(); } },
  // Telephony, wireless
  voipCalls: { icon: 'protoVoip', label: 'action.voipCalls', enabled: hasDoc, run: () => openStats('flow', { filter: 'sip || sdp || rtp || rtcp' }) },
  sipFlows: { icon: 'protoVoip', label: 'action.sipFlows', enabled: hasDoc, run: () => openStats('sip') },
  rtpStreams: { icon: 'protoVoip', label: 'action.rtpStreams', enabled: hasDoc, run: () => openStats('rtp') },
  wlanTraffic: { icon: 'ifWifi', label: 'action.wlanTraffic', enabled: hasDoc, run: () => openStats('wlan') },
  // Tools
  firewallRules: { icon: 'protoLock', label: 'action.firewallRules', enabled: hasSel, run: () => openStats('firewall', { index: activeDoc().selected }) },
  credentials: { icon: 'protoLock', label: 'action.credentials', enabled: hasDoc, run: () => openStats('credentials') },
  // Help
  welcome: { icon: 'bulb', label: 'action.welcome', run: () => openWelcome() },
  tutorial: { icon: 'tutorial', label: 'action.tutorial', key: 'F11', run: () => startTutorial() },
  tutorialDoc: { icon: 'tutorialDoc', label: 'action.tutorialDoc', run: () => openDocWindow('tutorial') },
  userGuide: { icon: 'userGuide', label: 'action.userGuide', run: () => openDocWindow('guide') },
  filterReference: { icon: 'wiki', label: 'action.filterReference', run: () => openFilterExpression() },
  shortcuts: { icon: 'keyboard', label: 'action.shortcuts', run: () => popups.open('settings', { tab: 'shortcuts' }) },
  about: { icon: 'info', label: 'action.about', key: 'F1', run: () => popups.open('about', {}) },
  sampleMenu: { icon: 'samples', label: 'action.samples', run: (context) => sampleMenu(context?.anchor) },
};

function commandEnabled(id) {
  const command = commands[id];
  return Boolean(command) && (command.enabled ? command.enabled() : true);
}

function commandTip(id) {
  const command = commands[id];
  if (!command) return '';
  const label = t(command.label);
  return command.key ? `${label} (${keyLabel(command.key)})` : label;
}

async function run(id, context) {
  const command = commands[id];
  if (!command) return undefined;
  if (!commandEnabled(id)) return undefined;
  try {
    return await command.run(context);
  } catch (error) {
    if (!error?.cancelled) showError('error.command', error, id);
    return undefined;
  } finally {
    renderToolbarState();
  }
}

function currentDecodeCandidates() {
  const doc = activeDoc();
  if (!doc || doc.selected < 0) return {};
  const d = doc.dissection(doc.selected);
  const v = (name) => d.fields?.get(name)?.[0]?.value;
  return { tcpPort: v('tcp.dstport') ?? v('tcp.srcport'), udpPort: v('udp.dstport') ?? v('udp.srcport'), ethertype: v('eth.type'), ipProto: v('ip.proto') ?? v('ipv6.nxt') };
}

async function openFilterExpression() {
  const result = await popups.open('filterexpr', { text: state.view?.filterText() ?? '' });
  if (result?.filter) {
    if (!activeDoc()) return;
    state.view.setFilterText(result.filter);
    if (result.apply) applyDisplayFilter(result.filter);
    else state.view.focusFilter();
  }
}

// ───────────────────────── menus

const SUBMENUS = {
  exportDissections: { icon: 'exportDissections', items: ['exportText', 'exportCsv', 'exportJson', 'exportPdml', 'exportPsml', 'exportC'] },
  exportObjects: { icon: 'exportObjects', items: ['exportObjectsHttp', 'exportObjectsTftp', 'exportObjectsImf', 'exportObjectsFtp'] },
  copy: { icon: 'copy', items: ['copySummary', 'copySummaryCsv', 'copyDetails', 'copyVisible', 'copyJson', '-', 'copyHexDump', 'copyHex', '-', 'copyField', 'copyValue', 'copyFilter', 'copyNodeBytes'] },
  marks: { icon: 'markPacket', items: ['markPacket', 'markAll', 'unmarkAll', 'nextMark', 'prevMark'] },
  ignores: { icon: 'ignorePacket', items: ['ignorePacket', 'ignoreAll', 'unignoreAll'] },
  timeRefs: { icon: 'timeReference', items: ['timeReference', 'unsetTimeRefs', 'nextTimeRef', 'prevTimeRef'] },
  panes: { icon: 'paneList', items: ['filterBar', 'statusBar', '-', 'leftPanel', 'rightPanel', 'bottomPanel', '-', 'paneList', 'paneDetails', 'paneBytes', '-', 'layoutStack', 'layoutDetailsRight', 'layoutBytesRight'] },
  timeFormat: { icon: 'clock', items: [...TIME_FORMATS.map((f) => `time:${f}`), '-', ...['auto', 0, 3, 6, 9].map((p) => `precision:${p}`)] },
  nameResolution: { icon: 'resolvedAddresses', items: ['resolveMac', 'resolveTransport', 'resolveNetwork'] },
  zoom: { icon: 'textZoomIn', items: ['textZoomIn', 'textZoomOut', 'textZoomReset'] },
  tree: { icon: 'expandAll', items: ['expandSub', 'collapseSub', 'expandAll', 'collapseAll'] },
  bytesAs: { icon: 'paneBytes', items: ['bytesHex', 'bytesBits', '-', 'bytesAscii', 'bytesEbcdic'] },
  appearance: { icon: 'palette', items: ['theme', 'themeMenu', 'language', '-', 'shuffleBackground'] },
  applyFilter: { icon: 'filterApply', items: ['applyFilter:selected', 'applyFilter:not', 'applyFilter:and', 'applyFilter:or', 'applyFilter:andNot', 'applyFilter:orNot'] },
  prepareFilter: { icon: 'filterPrepare', items: ['prepareFilter:selected', 'prepareFilter:not', 'prepareFilter:and', 'prepareFilter:or', 'prepareFilter:andNot', 'prepareFilter:orNot'] },
  conversationFilter: { icon: 'conversations', items: ['conversation:eth', 'conversation:ip', 'conversation:ipv6', 'conversation:tcp', 'conversation:udp'] },
  follow: { icon: 'followStream', items: ['followTcp', 'followUdp', 'followTls', 'followHttp', 'followHttp2', 'followQuic'] },
  http: { icon: 'httpStats', items: ['httpCounter', 'httpRequests', 'httpLoad'] },
  ipStats: { icon: 'endpoints', items: ['ipv4Stats', 'ipv6Stats', 'portTypes'] },
};
const sub = (key) => ({ sub: key });
const MENUS = {
  file: ['open', 'recent', sub('sampleList'), 'merge', '-', 'closeTab', 'closeAll', '-', 'save', 'saveAs', 'savePcap', '-', 'exportSpecified', sub('exportDissections'), 'exportBytes', sub('exportObjects'), '-', 'print', '-', 'startPage', 'exit'],
  edit: [sub('copy'), '-', 'findPacket', 'findNext', 'findPrev', '-', sub('marks'), sub('ignores'), sub('timeRefs'), 'timeShift', '-', 'packetComment', 'deleteComments', '-', 'settings'],
  view: [sub('panes'), sub('timeFormat'), sub('nameResolution'), sub('zoom'), '-', 'colorize', 'coloringRules', 'resizeColumns', 'columnPrefs', '-', sub('tree'), sub('bytesAs'), 'packetWindow', 'reload', '-', sub('appearance')],
  go: ['goPacket', 'goFirst', 'goLast', 'goPrev', 'goNext', '-', 'goConversationPrev', 'goConversationNext', 'goRelated', '-', 'goBack', 'goForward', '-', 'autoScroll'],
  capture: ['captureOptions', 'captureStart', 'captureStop', 'captureRestart', '-', 'captureFilters', 'interfaces', 'refreshInterfaces'],
  analyze: ['displayFilters', 'filterExpression', 'focusFilter', '-', 'applyAsColumn', sub('applyFilter'), sub('prepareFilter'), sub('conversationFilter'), '-', 'enabledProtocols', 'decodeAs', '-', sub('follow'), '-', 'expertInfo'],
  statistics: ['report', '-', 'captureProperties', 'resolvedAddresses', 'protocolHierarchy', 'conversations', 'endpoints', 'packetLengths', 'ioGraph', 'flowGraph', 'tcpGraph', '-', sub('http'), 'dnsStats', sub('ipStats'), '-', 'netMapWindow'],
  telephony: ['voipCalls', 'sipFlows', 'rtpStreams'],
  wireless: ['wlanTraffic'],
  tools: ['report', 'analyzeNow', '-', 'firewallRules', 'credentials', '-', 'settings'],
  help: ['welcome', 'tutorial', 'tutorialDoc', 'userGuide', 'filterReference', 'shortcuts', '-', 'settings', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', view: 'eye', go: 'goPacket', capture: 'captureStart', analyze: 'filterApply', statistics: 'ioGraph', telephony: 'protoVoip', wireless: 'ifWifi', tools: 'tools', help: 'question' };

const TOOLBAR = [
  ['open', 'save', 'closeTab', 'reload', 'print'],
  ['captureStart', 'captureStop', 'captureRestart', 'captureOptions'],
  ['findPacket', 'goBack', 'goForward', 'goPacket', 'goFirst', 'goLast', 'autoScroll'],
  ['colorize', 'textZoomOut', 'textZoomValue', 'textZoomIn', 'textZoomReset', 'resizeColumns'],
  ['expertInfo', 'protocolHierarchy', 'conversations', 'ioGraph', 'netMap'],
];
const TOOLBAR_RIGHT = ['tutorial', 'themeSplit', 'language', 'settings', 'about'];

function renderShell() {
  root.innerHTML = `
    <div class="app-bg" aria-hidden="true"><canvas class="anim-bg"></canvas><div class="image-bg"></div></div>
    <nav id="menubar" role="menubar"></nav>
    <div id="toolbar" role="toolbar"></div>
    <main id="workspace">
      <section id="center">
        <div id="tabs"></div>
        <div id="center-body">
          <div id="view-host" class="view-host" hidden></div>
          <div id="start-page" hidden></div>
          <div class="drop-overlay" aria-hidden="true"><div>${icon('drop')}<span></span></div></div>
        </div>
      </section>
    </main>
    <footer id="statusbar" role="status"></footer>
    ${desktop ? `<div class="resize-grip" data-resize-grip title="${escapeHtml(t('tip.resize'))}" aria-label="${escapeHtml(t('tip.resize'))}" role="separator">${icon('grip')}</div>` : `<div class="resize-grip static" title="${escapeHtml(t('tip.resize'))}" aria-hidden="true">${icon('grip')}</div>`}
    <div id="tutorial-layer"></div>`;
}

function renderMenubar() {
  const menubar = root.querySelector('#menubar');
  const onStart = state.showStart || !activeDoc();
  const home = `<button class="menubar-item menubar-home ${onStart ? 'current' : ''}" data-home title="${escapeHtml(t('tip.home'))}" aria-label="${escapeHtml(t('menu.home'))}" aria-pressed="${onStart}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button><span class="menubar-sep" aria-hidden="true"></span>`;
  const brand = `<div class="app-brand" data-window-drag title="${escapeHtml(`MyNetManager v${VERSION}`)}"><img class="app-brand-icon" src="${APP_ICON}" alt="" data-window-drag /><span class="app-brand-name" data-window-drag>MyNetManager</span><span class="app-brand-version" data-window-drag>v${escapeHtml(VERSION)}</span></div>`;
  const project = `<span class="app-brand-project" data-window-drag><span class="app-brand-project-name" data-window-drag></span><span class="app-brand-dirty" data-window-drag>●</span></span>`;
  const button = (id, glyph, key) => `<button class="window-button ${id === 'close' ? 'close' : ''}" data-window="${id}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(glyph)}</button>`;
  const onCapture = !state.showStart && Boolean(activeDoc());
  const panelButton = (command) => `<button class="window-button panel-toggle ${commands[command].checked() ? 'active' : ''}" data-command="${command}" title="${escapeHtml(commandTip(command))}" aria-label="${escapeHtml(t(commands[command].label))}" aria-pressed="${commands[command].checked()}" ${onCapture ? '' : 'disabled'}>${icon(commands[command].icon)}</button>`;
  const panels = `<div class="panel-toggles">${['leftPanel', 'bottomPanel', 'rightPanel'].map(panelButton).join('')}</div>`;
  const controls = desktop ? `${panels}<div class="window-controls">${button('minimize', 'winMinimize', 'window.minimize')}${state.maximized ? button('maximize', 'winRestore', 'window.restore') : button('maximize', 'winMaximize', 'window.maximize')}${button('close', 'winClose', 'window.close')}</div>` : panels;
  menubar.innerHTML = brand + home + Object.keys(MENUS).map((name) => `
    <button class="menubar-item ${state.openMenu === name ? 'open' : ''}" data-menu="${name}" role="menuitem" aria-haspopup="true" title="${escapeHtml(t(`menu.${name}`))}">${icon(MENU_ICONS[name])}<span>${escapeHtml(t(`menu.${name}`))}</span></button>`).join('')
    + `${project}<div class="menubar-drag" data-window-drag></div>${controls}`;
  renderTitleProject();
}

function renderTitleProject() {
  const box = root.querySelector('.app-brand-project');
  if (!box) return;
  const doc = state.showStart ? null : activeDoc();
  box.classList.toggle('empty', !doc);
  box.classList.toggle('dirty', Boolean(doc?.dirty));
  box.querySelector('.app-brand-project-name').textContent = doc ? doc.name : '';
  box.title = doc ? `${doc.path ?? doc.name}${doc.dirty ? ` (${t('status.modified')})` : ''}` : '';
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
    // Back to a normal window: the minimum size that waited while maximized / full screen applies now.
    if (!maximized) native.applyPendingMinimumSize().catch(() => {});
  };
  await update();
  appWindow.onResized(() => update()).catch(() => {});
  const mark = (key) => { try { globalThis.localStorage?.setItem(key, String(Date.now())); } catch { /* private mode */ } };
  for (const type of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(type, () => mark('mynetmanager.main.input'), { capture: true, passive: true });
  window.addEventListener('focus', () => mark('mynetmanager.main.focus'));
}

function renderToolbar() {
  const toolbar = root.querySelector('#toolbar');
  const plain = (id, extra = '') => {
    const command = commands[id];
    const glyph = id === 'language' ? switchFlag(getLanguage()) : icon(command.icon);
    return `<button class="tool-button ${extra}" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(command.label))}">${glyph}</button>`;
  };
  const button = (id) => {
    // The packet list's text size between A− and A+ (pixels); a click puts it back to 100 %.
    if (id === 'textZoomValue') return `<button class="tool-button tool-value" data-command="textZoomReset" data-zoom-value title="${escapeHtml(commandTip('textZoomReset'))}" aria-label="${escapeHtml(t('action.textZoomReset'))}">${escapeHtml(textSizeLabel())}</button>`;
    if (id === 'themeSplit') return `<span class="split-button">${plain('theme')}<button class="tool-button split-arrow" data-command="themeMenu" title="${escapeHtml(commandTip('themeMenu'))}" aria-label="${escapeHtml(t('action.themeChoose'))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
    // The two commands everybody looks for by name: start a capture, and the network map.
    if (id === 'captureStart' || id === 'netMap') return `<button class="tool-button tool-labeled ${id === 'captureStart' ? 'capture-start' : ''}" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(commands[id].label))}">${icon(commands[id].icon)}<span>${escapeHtml(t(id === 'captureStart' ? 'action.captureStartShort' : 'action.netMapShort'))}</span></button>`;
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
  root.querySelector('#toolbar')?.classList.toggle('is-capturing', Boolean(activeDoc()?.capture));
  const zoomValue = root.querySelector('#toolbar [data-zoom-value]');
  if (zoomValue) { zoomValue.textContent = textSizeLabel(); zoomValue.disabled = false; }
}

/** The packet list's text size as shown: the font size times the zoom, e.g. "13px". */
function textSizeLabel() {
  const px = (state.settings.fontSize * state.settings.textZoom) / 100;
  return `${Number.isInteger(px) ? px : px.toFixed(1)}px`;
}

/** The window can never be so narrow that toolbar buttons or menus are hidden. */
function updateMinimumWidth() {
  const left = root.querySelector('.toolbar-left');
  const right = root.querySelector('.toolbar-right');
  if (!left || !right) return;
  requestAnimationFrame(() => {
    // The width a row needs, measured by the browser itself: laid out at its content width for a moment (the
    // spacer and drag area shrink to nothing), so every gap, margin, padding and border counts. Adding the parts up
    // by hand missed some, and the window could get narrow enough to cut About and the close button.
    const natural = (row) => {
      if (!row) return 0;
      const before = row.style.width;
      const flexBefore = row.style.flex;
      row.style.width = 'max-content';
      row.style.flex = 'none';
      const w = row.getBoundingClientRect().width;
      row.style.width = before;
      row.style.flex = flexBefore;
      return w;
    };
    const toolbar = root.querySelector('#toolbar');
    const ts = getComputedStyle(toolbar);
    const tools = natural(root.querySelector('.toolbar-inner')) + parseFloat(ts.paddingLeft) + parseFloat(ts.paddingRight) + parseFloat(ts.borderLeftWidth) + parseFloat(ts.borderRightWidth);
    const menus = natural(root.querySelector('#menubar'));
    // The panes side by side: a pane that does not shrink at its width, one that shrinks at its CSS minimum (the
    // packet list column 360 px, the map 260 px), rails and splitters as they are — so every panel's fold button
    // stays on screen too.
    const main = root.querySelector('.cap-main');
    const panes = main && main.offsetParent ? [...main.children].reduce((sum, el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none') return sum;
      return sum + (cs.flexShrink === '0' ? el.getBoundingClientRect().width : parseFloat(cs.minWidth) || 0) + parseFloat(cs.marginLeft) + parseFloat(cs.marginRight);
    }, 0) : 0;
    // 4 px to spare, so rounding never cuts the last button (About, the close button).
    const width = Math.ceil(Math.max(menus, tools, panes) + 4);
    if (Math.abs(width - state.minWidth) < 1) return;
    state.minWidth = width;
    document.documentElement.style.setProperty('--min-width', `${width}px`);
    native.setMinimumSize(width, 600).catch(() => {});
  });
}

// ───────────────────────── tabs (one per capture)

function renderTabs() {
  renderTitleProject();
  const tabs = root.querySelector('#tabs');
  if (!tabs) return;
  tabs.hidden = !state.docs.length || state.showStart;
  tabs.innerHTML = `<div class="tab-strip"><div class="tab-list" role="tablist">${state.docs.map((doc) => `
    <div class="tab ${doc.id === state.active ? 'active' : ''} ${doc.dirty ? 'dirty' : ''} ${doc.capture ? 'live' : ''}" data-tab="${doc.id}" role="tab" aria-selected="${doc.id === state.active}" title="${escapeHtml(doc.path ?? doc.name)}">
      ${icon(doc.capture ? 'captureStart' : 'packets')}<span class="tab-name">${escapeHtml(doc.name)}</span><span class="tab-count">${doc.count}</span><span class="tab-dirty">●</span>
      <button class="tab-close" data-tab-close="${doc.id}" title="${escapeHtml(t('action.closeTab'))}" aria-label="${escapeHtml(t('action.closeTab'))}">${icon('close')}</button>
    </div>`).join('')}</div></div>
    <button class="tab-add" data-command="open" title="${escapeHtml(commandTip('open'))}" aria-label="${escapeHtml(t('action.open'))}">${icon('plus')}</button>`;
}

function cycleTab(direction) {
  if (state.docs.length < 2) return;
  const index = state.docs.findIndex((doc) => doc.id === state.active);
  activate(state.docs[(index + direction + state.docs.length) % state.docs.length].id);
}

// ───────────────────────── status bar

const fmtBytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} kB` : `${n} B`);

function renderStatus() {
  const bar = root.querySelector('#statusbar');
  if (!bar) return;
  const doc = state.showStart ? null : activeDoc();
  const s = state.settings;
  const notice = state.notice;
  const items = [];
  if (doc) {
    const sev = doc.analysis?.overview.severities;
    const worst = !sev ? null : sev.error ? 'error' : sev.warn ? 'warn' : sev.note ? 'note' : sev.chat ? 'chat' : null;
    items.push(`<button class="status-item expert-led ${worst ?? 'none'}" data-command="expertInfo" title="${escapeHtml(t('status.expertTip', { level: worst ? t(`expert.${worst}`) : t('expert.none') }))}">${icon('expertInfo')}</button>`);
  }
  items.push(`<span class="status-notice ${notice?.kind ?? ''}" title="${escapeHtml(notice?.text ?? t('status.ready'))}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(notice?.text ?? t('status.ready'))}</span></span>`);
  if (state.progress && (!doc || state.progress.doc === doc.id)) {
    const p = state.progress;
    const percent = p.total ? Math.round((p.done / p.total) * 100) : 0;
    items.push(`<span class="status-item progress" title="${escapeHtml(p.label)}"><span>${escapeHtml(p.label)}</span><span class="status-progress"><i style="width:${percent}%"></i></span><span>${percent}%</span><button class="icon-button" data-cancel-pass title="${escapeHtml(t('common.cancel'))}">${icon('close')}</button></span>`);
  }
  if (doc) {
    const c = doc.counts();
    if (doc.capture) items.push(`<span class="status-item live" title="${escapeHtml(t('status.liveTip'))}">${icon('captureStart')}<span>${escapeHtml(t('status.live', { name: doc.iface?.friendly ?? '', drop: doc.stats?.drop ?? 0 }))}</span></span>`);
    else items.push(`<span class="status-item" title="${escapeHtml(doc.path ?? doc.name)}">${icon('packets')}<span class="status-file">${escapeHtml(doc.name)}</span></span>`);
    items.push(`<span class="status-item" title="${escapeHtml(t('status.packetsTip'))}">${icon('packet')}<span>${escapeHtml(t('status.packets', { total: c.total, displayed: c.displayed, percent: c.total ? ((c.displayed / c.total) * 100).toFixed(1) : '0.0' }))}</span></span>`);
    if (c.marked) items.push(`<span class="status-item" title="${escapeHtml(t('action.markPacket'))}">${icon('markPacket')}<span>${escapeHtml(t('status.marked', { count: c.marked }))}</span></span>`);
    if (c.ignored) items.push(`<span class="status-item" title="${escapeHtml(t('action.ignorePacket'))}">${icon('ignorePacket')}<span>${escapeHtml(t('status.ignored', { count: c.ignored }))}</span></span>`);
    const node = state.view?.details.selected;
    if (node?.abbrev) items.push(`<span class="status-item field" title="${escapeHtml(t('status.fieldTip'))}">${icon('tag')}<span>${escapeHtml(`${FIELDS.get(node.abbrev)?.name ?? node.abbrev} (${node.abbrev})${node.length ? `, ${node.length} ${t('details.bytes')}` : ''}`)}</span></span>`);
  }
  items.push(`<button class="status-item" data-command="themeMenu" title="${escapeHtml(t('status.theme', { name: themeName(s.theme, getLanguage()) }))}">${icon('palette')}<span>${escapeHtml(themeName(s.theme, getLanguage()))}</span></button>`);
  items.push(`<button class="status-item" data-command="language" title="${escapeHtml(t('action.language'))}">${icon('globe')}<span>${escapeHtml(t('status.language'))}</span></button>`);
  if (doc) items.push(`<span class="status-item" title="${escapeHtml(t('status.zoomTip'))}">${icon('textZoomIn')}<span>${s.textZoom}%</span></span>`);
  if (s.statusClock) items.push(`<span class="status-item clock" title="${escapeHtml(t('status.clock'))}">${icon('clock')}<span id="status-clock">${escapeHtml(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span></span>`);
  bar.innerHTML = items.join('');
}

function renderAll() {
  root.classList.toggle('no-status', !state.settings.showStatusBar);
  root.classList.toggle('on-start', state.showStart || !activeDoc());
  root.querySelector('#start-page').hidden = !(state.showStart || !activeDoc());
  root.querySelector('#view-host').hidden = state.showStart || !activeDoc();
  if (state.showStart || !activeDoc()) renderStartPage();
  renderMenubar();
  renderToolbar();
  renderTabs();
  renderStatus();
  updateBackgroundState();
  if (state.view && !state.showStart) state.view.refresh();
  // The welcome window (start the tutorial?) belongs to the start page: it goes when a capture takes its place.
  if (!(state.showStart || !activeDoc()) && popups.isOpen('welcome')) popups.close('welcome');
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
  paintActivity();
  watchActivity();
}

function showStartPage(show = true) {
  state.showStart = show && true;
  if (!show && !activeDoc()) state.showStart = true;
  if (state.showStart) { state.view?.destroy(); state.view = null; }
  else mountView();
  renderAll();
}

async function onStartAction(target) {
  const value = target.dataset.value;
  switch (target.dataset.start) {
    case 'open': return openWithDialog();
    case 'open-recent': return openRecent(value);
    case 'remove-recent': state.recent = removeRecent(state.recent, value); storeRecent(globalThis.localStorage, state.recent); return renderStartPage();
    case 'clear-recent': state.recent = []; storeRecent(globalThis.localStorage, []); notify('success', t('notice.recentCleared')); return renderStartPage();
    case 'open-folder': return openWithDialog(value);
    case 'remove-folder': state.recentDirs = removeRecent(state.recentDirs, value); storeRecentDirs(globalThis.localStorage, state.recentDirs); return renderStartPage();
    case 'clear-folders': state.recentDirs = []; storeRecentDirs(globalThis.localStorage, []); return renderStartPage();
    case 'sample': return openSample(value);
    case 'capture': updateSettings({ captureInterface: value }, { quiet: true }); return startLiveCapture(value);
    case 'pick-interface': updateSettings({ captureInterface: value }, { quiet: true }); return renderStartPage();
    case 'capture-options': return openCaptureOptions();
    case 'capture-setup': return setupCapture();
    case 'refresh-interfaces': return run('refreshInterfaces');
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
    case 'filter-reference': return openFilterExpression();
    case 'animation': updateSettings({ animation: value, backgroundKind: 'animated' }); return notify('info', t('notice.animation', { name: t(`animation.${value}`) }));
    case 'shuffle': return shuffleBackground();
    case 'background-image': return chooseBackground();
    default: return undefined;
  }
}

function sampleMenu(anchor) {
  const items = SAMPLES.map((s) => ({ id: `custom:sample:${s.id}`, label: s[lang()]?.[0] ?? s.id, icon: sampleIcon(s) }));
  const handlers = Object.fromEntries(SAMPLES.map((s) => [`custom:sample:${s.id}`, () => openSample(s.id)]));
  return showMenu(items, anchor ?? anchorBelow(root.querySelector('[data-menu="file"]')), 'context', { handlers, header: { icon: 'samples', title: t('action.samples') } });
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
  const showStart = state.showStart || !activeDoc();
  const animated = s.backgroundKind === 'animated' && !showStart && !s.animationOnStartOnly && s.backgroundOpacity > 0;
  layer.classList.toggle('animated', animated);
  layer.classList.toggle('image', s.backgroundKind === 'image' && Boolean(state.backgroundUrl));
  layer.style.setProperty('--bg-opacity', String(s.backgroundOpacity / 100));
  const image = layer.querySelector('.image-bg');
  image.style.backgroundImage = state.backgroundUrl && s.backgroundKind === 'image' ? `url("${state.backgroundUrl}")` : 'none';
  image.style.backgroundSize = { cover: 'cover', contain: 'contain', tile: 'auto', center: 'auto', stretch: '100% 100%' }[s.backgroundFit];
  image.style.backgroundRepeat = s.backgroundFit === 'tile' ? 'repeat' : 'no-repeat';
  if (animated) appBackground.start(); else appBackground.stop();
  if (showStart && startBackground) {
    if (s.backgroundKind === 'animated') startBackground.start(); else { startBackground.stop(); startBackground.draw(); }
  } else startBackground?.stop();
}

let startBackgroundChangedAt = Date.now();
const randomAnimation = (current) => { const others = ANIMATIONS.filter((kind) => kind !== current); return others[Math.floor(Math.random() * others.length)]; };

function tickStartBackground() {
  const s = state.settings;
  const showing = (state.showStart || !activeDoc()) && s.backgroundKind === 'animated' && s.animationInterval > 0 && !document.hidden && !tutorial?.state?.().active;
  if (!showing) { startBackgroundChangedAt = Date.now(); return; }
  if (Date.now() - startBackgroundChangedAt < s.animationInterval * 1000) return;
  startBackgroundChangedAt = Date.now();
  const canvas = root.querySelector('#start-page .start-bg');
  canvas?.classList.add('fading');
  setTimeout(() => { updateSettings({ animation: randomAnimation(s.animation) }, { quiet: true }); updateBackgroundState(); root.querySelector('#start-page .start-bg')?.classList.remove('fading'); }, 450);
}

function shuffleBackground() {
  const next = (startBackground ?? appBackground)?.shuffle() ?? 'packetflow';
  updateSettings({ animation: next, backgroundKind: 'animated' });
  notify('info', t('notice.animation', { name: t(`animation.${next}`) }));
}

async function loadBackground() {
  try { state.backgroundUrl = await native.backgroundUrl(state.settings); } catch { state.backgroundUrl = null; }
  updateBackgroundState();
  if (state.showStart || !activeDoc()) renderStartPage();
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
  }
  if (s.backgroundImage !== previous.backgroundImage) loadBackground();
  if (s.theme !== previous.theme && previous.theme) notify('info', t('notice.theme', { name: themeName(s.theme, getLanguage()) }));
  if (s.theme !== previous.theme || s.customTheme !== previous.customTheme) for (const doc of state.docs) doc.setColoring(themedColoring());
  if (s.showNetMap && !previous.showNetMap) setTimeout(() => refreshMap(), 50);
  if (['netmapShowExternal', 'netmapShowMulticast'].some((key) => s[key] !== previous[key])) refreshMap();
  renderAll();
  updateMinimumWidth();
}

async function openThemePicker(anchor) {
  const element = root.querySelector('.split-button [data-command="themeMenu"]')?.closest('.split-button') ?? root.querySelector('[data-command="themeMenu"]');
  const result = await popups.open('theme', { current: state.settings.theme }, { anchor: anchor ?? anchorBelow(element) });
  if (result?.theme) updateSettings({ theme: result.theme });
}

// ───────────────────────── progress popup for file reads and writes

let opCount = 0;
async function withProgress(titleKey, name, task) {
  const op = `op-${Date.now()}-${++opCount}`;
  let shown = false;
  let last = null;
  const timer = setTimeout(() => { shown = true; popups.open('progress', { title: t(titleKey), name, op, last }); }, 400);
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
  for (const doc of captureDocs()) await stopLiveCapture(doc);
  const dirty = state.docs.filter((doc) => doc.dirty && doc.count);
  if (!dirty.length) return true;
  const choice = await ask({
    kind: 'exit', icon: 'save', title: t('confirm.exitTitle'), message: t('confirm.exitMessage'), items: dirty.map((doc) => doc.name),
    buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }],
  });
  if (choice === 'save') { for (const doc of dirty) if (!(await saveDoc(doc))) return false; return true; }
  return choice === 'discard';
}

async function closeAll() {
  for (const doc of [...state.docs]) if (!(await closeDoc(doc))) return false;
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

const dynamicMenus = new Map();

function menuItems(ids) {
  return ids.map((id) => (id === '-' ? { separator: true } : typeof id === 'object' ? {
    id: `submenu:${id.sub}`, label: t(`submenu.${id.sub}`), icon: SUBMENUS[id.sub]?.icon ?? dynamicMenus.get(id.sub)?.header?.icon ?? 'menu', submenu: true,
    disabled: SUBMENUS[id.sub] ? !SUBMENUS[id.sub].items.some((item) => item !== '-' && commandEnabled(item)) : false,
  } : {
    id, label: t(commands[id].label), icon: commands[id].icon, shortcut: commands[id].key ? keyLabel(commands[id].key) : '', disabled: !commandEnabled(id), checked: commands[id].checked?.(),
  }));
}

function sampleItems() {
  const items = SAMPLES.map((s) => ({ id: `custom:sample:${s.id}`, label: s[lang()]?.[0] ?? s.id, icon: sampleIcon(s) }));
  const handlers = Object.fromEntries(SAMPLES.map((s) => [`custom:sample:${s.id}`, () => openSample(s.id)]));
  return { items, handlers, header: { icon: 'samples', title: t('submenu.sampleList') } };
}

function withChildren(items, handlers, depth = 0) {
  return items.map((item) => {
    if (!item.submenu || item.children || depth > 3) return item;
    const key = item.id.slice('submenu:'.length);
    const dynamic = key === 'sampleList' ? sampleItems() : dynamicMenus.get(key);
    if (dynamic) Object.assign(handlers, dynamic.handlers);
    const children = dynamic ? dynamic.items : SUBMENUS[key] ? menuItems(SUBMENUS[key].items) : null;
    return children ? { ...item, children: withChildren(children, handlers, depth + 1) } : item;
  });
}

async function showMenu(items, anchor, name = 'context', context = {}) {
  state.openMenu = name;
  renderMenubar();
  const header = context.header ?? (MENUS[name] ? { icon: MENU_ICONS[name], title: t(`menu.${name}`) } : { icon: 'packets', title: 'MyNetManager' });
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
    const dynamic = key === 'sampleList' ? sampleItems() : dynamicMenus.get(key);
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

function contextMenu(event, kind, payload = {}) {
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  if (kind === 'packet') {
    const part = partMenu({ range: 'selected', summary: true, columnHeader: true, details: 'displayed', bytes: false }, t('context.packet', { no: payload.index + 1 }));
    return showMenu(menuItems(['markPacket', 'ignorePacket', 'timeReference', 'timeShift', 'packetComment', '-', sub('applyFilter'), sub('prepareFilter'), sub('conversationFilter'), '-', sub('copy'), '-', 'decodeAs', 'packetWindow', sub('follow'), '-', 'firewallRules']).concat(part.items), anchor, 'context', { handlers: part.handlers, header: { icon: 'packet', title: t('context.packet', { no: payload.index + 1 }) } });
  }
  if (kind === 'details') {
    const part = partMenu({ range: 'selected', summary: false, details: 'displayed', bytes: false }, t('context.details'));
    return showMenu(menuItems(['expandSub', 'collapseSub', 'expandAll', 'collapseAll', '-', 'applyAsColumn', sub('applyFilter'), sub('prepareFilter'), sub('conversationFilter'), '-', sub('copy'), 'exportBytes', '-', 'decodeAs', sub('follow'), 'goRelated']).concat(part.items), anchor, 'context', { handlers: part.handlers, header: { icon: 'paneDetails', title: payload.node?.abbrev ?? t('context.details') } });
  }
  if (kind === 'bytes') {
    const part = partMenu({ range: 'selected', summary: false, details: 'none', bytes: true }, t('context.bytes'));
    return showMenu(menuItems(['bytesHex', 'bytesBits', '-', 'bytesAscii', 'bytesEbcdic', '-', 'copyHexDump', 'copyHex', 'copyNodeBytes', 'exportBytes']).concat(part.items), anchor, 'context', { handlers: part.handlers, header: { icon: 'paneBytes', title: t('context.bytes') } });
  }
  if (kind === 'header') {
    const columns = state.settings.columns;
    // The packet list as shown (displayed packets, summary lines).
    const listPart = partMenu({ range: 'displayed', summary: true, columnHeader: true, details: 'none', bytes: false }, t('context.packetList'));
    const items = [
      ...columns.map((c) => ({ id: `custom:col:${c.id}`, label: columnTitle(c, t), icon: 'columns', checked: c.visible })),
      { separator: true },
      { id: 'custom:fit', label: t('action.resizeColumns'), icon: 'resizeColumns' },
      ...(payload.column ? [{ id: 'custom:fitone', label: t('columns.fitOne', { name: columnTitle(payload.column, t) }), icon: 'resizeColumns' }, { id: 'custom:remove', label: t('columns.remove', { name: columnTitle(payload.column, t) }), icon: 'trash', disabled: payload.column.kind !== 'field' }] : []),
      { id: 'custom:prefs', label: t('action.columnPrefs'), icon: 'columns' },
      { id: 'custom:reset', label: t('columns.reset'), icon: 'refresh' },
      ...listPart.items,
    ];
    const handlers = {
      ...Object.fromEntries(columns.map((c) => [`custom:col:${c.id}`, () => updateColumns(columns.map((x) => (x.id === c.id ? { ...x, visible: !x.visible } : x)))])),
      'custom:fit': () => state.view?.list.fitAll(),
      'custom:fitone': () => state.view?.list.fitColumn(payload.column.id),
      'custom:remove': () => updateColumns(columns.filter((x) => x.id !== payload.column.id)),
      'custom:prefs': () => popups.open('columns', {}),
      'custom:reset': () => updateColumns(DEFAULT_COLUMNS.map((c) => ({ ...c }))),
      ...listPart.handlers,
    };
    return showMenu(items, anchor, 'context', { handlers, header: { icon: 'columns', title: t('context.columns') } });
  }
  if (kind === 'tab') {
    const doc = state.docs.find((d) => d.id === payload.id);
    // Print / export work on the active capture: right-clicking another tab brings it to the front first.
    if (doc && doc !== activeDoc()) activate(doc.id);
    const part = partMenu({ range: 'displayed', summary: true, columnHeader: true, details: 'none', bytes: false }, doc?.name ?? '');
    const handlers = { 'custom:close': () => closeDoc(doc), 'custom:others': async () => { for (const d of state.docs.filter((x) => x !== doc)) if (!(await closeDoc(d))) return; }, ...part.handlers };
    return showMenu([{ id: 'custom:close', label: t('action.closeTab'), icon: 'closeTab' }, { id: 'custom:others', label: t('tabs.closeOthers'), icon: 'closeAll', disabled: state.docs.length < 2 }, ...part.items], anchor, 'context', { handlers, header: { icon: 'packets', title: doc?.name ?? '' } });
  }
  if (kind === 'start-sample') {
    const sample = SAMPLES.find((s) => s.id === payload.id);
    if (!sample) return undefined;
    const handlers = { 'custom:open': () => openSample(sample.id), 'custom:copyName': () => copyText(`${sample.id}.pcapng`, t('context.fileName')) };
    return showMenu([
      { id: 'custom:open', label: t('context.openSample'), icon: 'folderOpen' },
      { id: 'custom:copyName', label: t('context.copyFileName'), icon: 'copy' },
      { separator: true },
      ...menuItems(['open', sub('sampleList')]),
    ], anchor, 'context', { handlers, header: { icon: 'samples', title: sample[lang()]?.[0] ?? sample.id } });
  }
  if (kind === 'start-recent') {
    const { path, folder } = payload;
    const handlers = {
      'custom:open': () => (folder ? openWithDialog(path) : openRecent(path)),
      'custom:copy': () => copyText(path, t('context.path')),
      'custom:remove': () => onStartAction({ dataset: { start: folder ? 'remove-folder' : 'remove-recent', value: path } }),
    };
    return showMenu([
      { id: 'custom:open', label: t(folder ? 'context.openInFolder' : 'context.openFile'), icon: folder ? 'folder' : 'folderOpen' },
      { id: 'custom:copy', label: t('context.copyPath'), icon: 'copy' },
      { separator: true },
      { id: 'custom:remove', label: t(folder ? 'recent.removeFolder' : 'recent.remove'), icon: 'close' },
    ], anchor, 'context', { handlers, header: { icon: folder ? 'recentFolder' : 'recent', title: baseName(path) || path } });
  }
  if (kind === 'start') {
    const handlers = {
      'custom:arrange': () => startCards?.arrange(),
      'custom:startSettings': () => popups.open('settings', { tab: 'start' }),
      'custom:shuffle': () => shuffleBackground(),
      'custom:theme': () => popups.open('settings', { tab: 'appearance' }),
    };
    return showMenu([
      ...menuItems(['open', 'captureOptions', 'captureStart']),
      { separator: true },
      { id: 'custom:arrange', label: t('start.arrange'), icon: 'launcher' },
      { id: 'custom:shuffle', label: t('context.shuffleBackground'), icon: 'sparkles' },
      { id: 'custom:theme', label: t('start.themeSettings'), icon: 'palette' },
      { id: 'custom:startSettings', label: t('start.settings'), icon: 'gear' },
      { separator: true },
      ...menuItems(['tutorial', 'about']),
    ], anchor, 'context', { handlers, header: { icon: 'home', title: t('menu.home') } });
  }
  if (kind === 'interface') {
    // Start page → capture card: right-click on an interface row.
    const iface = state.interfaces.find((i) => i.id === payload.id);
    if (!iface) return undefined;
    const addresses = (iface.addresses ?? []).join('\n');
    const items = [
      { id: 'custom:start', label: t('start.captureOn', { name: iface.friendly }), icon: 'captureStart', disabled: Boolean(activeDoc()?.capture) },
      { id: 'custom:select', label: t('context.selectInterface'), icon: 'check', checked: state.settings.captureInterface === iface.id },
      { separator: true },
      { id: 'custom:copyName', label: t('context.copyInterfaceName'), icon: 'copy' },
      { id: 'custom:copyAddresses', label: t('context.copyInterfaceAddresses'), icon: 'copy', disabled: !addresses },
      { separator: true },
      ...menuItems(['captureOptions', 'captureFilters', 'refreshInterfaces']),
    ];
    const handlers = {
      'custom:start': () => startLiveCapture(iface.id),
      'custom:select': () => { updateSettings({ captureInterface: iface.id }, { quiet: true }); renderStartPage(); },
      'custom:copyName': () => copyText(iface.friendly, t('context.interfaceName')),
      'custom:copyAddresses': () => copyText(addresses, t('context.interfaceAddresses')),
    };
    return showMenu(items, anchor, 'context', { handlers, header: { icon: 'interfaces', title: iface.friendly } });
  }
  return undefined;
}

async function recentFilterMenu(element) {
  const list = state.settings.recentDisplayFilters;
  const items = list.length ? list.map((f, i) => ({ id: `custom:rf:${i}`, label: f, icon: 'filterApply' })) : [{ id: 'none', label: t('filter.noRecent'), icon: 'info', disabled: true }];
  const handlers = Object.fromEntries(list.map((f, i) => [`custom:rf:${i}`, () => { state.view.setFilterText(f); applyDisplayFilter(f); }]));
  return showMenu(items, anchorBelow(element), 'context', { handlers, header: { icon: 'recent', title: t('filter.recent') } });
}

async function bookmarkMenu(element) {
  const saved = loadSavedFilters();
  const current = state.view?.filterText().trim();
  const items = [
    { id: 'custom:save', label: t('filter.saveThis'), icon: 'save', disabled: !current },
    { id: 'custom:manage', label: t('action.displayFilters'), icon: 'filterBookmark' },
    { id: 'custom:button', label: t('filter.addButton'), icon: 'plus', disabled: !current },
    { separator: true },
    ...saved.display.map((f, i) => ({ id: `custom:bf:${i}`, label: `${f.name} — ${f.filter}`, icon: 'filterApply' })),
  ];
  const handlers = {
    'custom:save': async () => {
      const result = await popups.open('prompt', { icon: 'filterBookmark', title: t('filter.saveThis'), label: t('filter.name'), value: current });
      if (!result?.value) return;
      saved.display.push({ name: result.value, filter: current, button: false });
      storeSavedFilters(saved);
      notify('success', t('filter.saved', { name: result.value }));
    },
    'custom:button': async () => {
      const result = await popups.open('prompt', { icon: 'plus', title: t('filter.addButton'), label: t('filter.buttonLabel'), value: current.slice(0, 20) });
      if (!result?.value) return;
      saved.display.push({ name: result.value, filter: current, button: true });
      storeSavedFilters(saved);
      state.view?.renderFilterBar();
    },
    'custom:manage': () => popups.open('filters', { which: 'display' }),
    ...Object.fromEntries(saved.display.map((f, i) => [`custom:bf:${i}`, () => { state.view.setFilterText(f.filter); applyDisplayFilter(f.filter); }])),
  };
  return showMenu(items, anchorBelow(element), 'context', { handlers, header: { icon: 'filterBookmark', title: t('filter.bookmarks') } });
}

// ───────────────────────── document windows (user's guide, tutorial document)

async function openDocWindow(kind) {
  const info = DOC_KINDS[kind];
  if (!info) return undefined;
  popups.hideMenu();
  const url = `${location.pathname}?viewer=${kind}&lang=${getLanguage() === 'en' ? 'en' : 'ko'}`;
  if (popups.inline || !desktop) {
    const opened = globalThis.open(url, `mynetmanager-${docLabel(kind)}`);
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

// ───────────────────────── drag & drop of capture files

async function handleDroppedPaths(paths) {
  for (const path of paths) {
    if (/\.(pcapng|pcap|cap|ntar|gz|dmp)$/i.test(path)) await openPath(path);
    else notify('error', t('notice.unsupportedDrop', { name: baseName(path) }));
  }
}

async function handleDroppedFiles(files) {
  for (const file of files) {
    try {
      await openCaptureBytes(file.name, new Uint8Array(await file.arrayBuffer()));
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

/** What the capture view and its panes need from the app. */
const viewApi = {
  t,
  settings: () => state.settings,
  updateSettings: (patch, opts) => updateSettings(patch, opts),
  doc: () => activeDoc(),
  filterState: () => viewFilterState(),
  expanded: new Set(['frame']),
  onFilterInput,
  onFilterApply: (text) => applyDisplayFilter(text),
  onFilterAction: (kind, element, index) => {
    if (kind === 'recent') return recentFilterMenu(element);
    if (kind === 'bookmarks') return bookmarkMenu(element);
    if (kind === 'expression') return openFilterExpression();
    if (kind === 'saved') { const f = filterButtons()[index]; if (f) { state.view.setFilterText(f.filter); return applyDisplayFilter(f.filter); } }
    return undefined;
  },
  list: {
    t,
    settings: () => state.settings,
    doc: () => activeDoc(),
    onSelect: (index) => selectFrame(activeDoc(), index),
    onOpen: () => run('packetWindow'),
    onContext: (event, index) => contextMenu(event, 'packet', { index }),
    onHeaderContext: (event, column) => contextMenu(event, 'header', { column }),
    onColumnsChanged: (columns) => updateColumns(columns),
  },
  details: {
    t,
    doc: () => activeDoc(),
    get expanded() { return viewApi.expanded; },
    onSelectNode: (node) => { state.view?.bytes.highlight(node); renderStatus(); renderToolbarState(); },
    onContext: (event, node) => contextMenu(event, 'details', { node }),
    onActivate: (node) => {
      // Double-click on a frame reference ("[Response in: 12]") jumps there, like Wireshark.
      if (node?.type === 'framenum' && Number.isInteger(Number(node.value))) selectFrame(activeDoc(), Number(node.value) - 1, { reveal: true });
    },
  },
  bytes: {
    t,
    settings: () => state.settings,
    onPickNode: (node) => { state.view?.details.reveal(node); renderStatus(); },
    onContext: (event) => contextMenu(event, 'bytes'),
  },
  nav: {
    t,
    analysis: () => activeDoc()?.analysis ?? null,
    onFilter: (filter) => { if (!filter || !state.view) return; state.view.setFilterText(filter); applyDisplayFilter(filter); },
  },
  bottom: {
    t,
    settings: () => state.settings,
    updateSettings: (patch, opts) => updateSettings(patch, opts),
    analysis: () => activeDoc()?.analysis ?? null,
    log: () => state.log,
    onSelectPacket: (no) => { const doc = activeDoc(); if (!doc || no < 1) return; if (!doc.displayed.includes(no - 1)) { state.view.setFilterText(''); applyDisplayFilter('').then(() => selectFrame(doc, no - 1, { reveal: true })); } else selectFrame(doc, no - 1, { reveal: true }); },
    onFilter: (filter) => { state.view.setFilterText(filter); applyDisplayFilter(filter); },
    onReport: () => openReport(),
    onClearLog: () => { state.log = []; state.view?.bottom.render(); },
  },
  onFold: (which) => togglePanel(which),
  map: {
    t,
    settings: () => state.settings,
    updateSettings: (patch, opts) => updateSettings(patch, opts),
    onSelect: (selection) => onMapSelect(selection),
    onRefresh: () => refreshMap(),
    onExport: () => exportMap(),
  },
};

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
    // Start page, capture card: a capture filter preset joins the filter as one more OR part (presets.js).
    const capturePreset = target.closest('[data-capture-preset]');
    if (capturePreset) { updateSettings({ captureFilter: togglePreset(state.settings.captureFilter, capturePreset.dataset.capturePreset, CAPTURE_PRESETS) }, { quiet: true }); return renderStartPage(); }
    const start = target.closest('[data-start]');
    if (start && !start.disabled) return onStartAction(start);
    if (target.closest('[data-cancel-pass]')) { activeDoc()?.busy?.abort(); return undefined; }
    const tabClose = target.closest('[data-tab-close]');
    if (tabClose) return closeDoc(state.docs.find((doc) => doc.id === tabClose.dataset.tabClose));
    const tab = target.closest('[data-tab]');
    if (tab) return activate(tab.dataset.tab);
    const win = target.closest('[data-window]');
    if (win) return windowButton(win.dataset.window);
    const command = target.closest('[data-command]');
    if (command && !command.disabled) {
      const id = command.dataset.command;
      const anchor = ['themeMenu', 'sampleMenu'].includes(id) ? anchorBelow(command.closest('.split-button') ?? command) : undefined;
      return run(id, { anchor });
    }
    return undefined;
  });
  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches('[data-start-toggle]')) updateSettings({ showStartPage: target.checked }, { quiet: true });
    if (target.matches('[data-start-interval]')) updateSettings({ animationInterval: Number(target.value) }, { quiet: true });
    if (target.matches('[data-start-random]')) updateSettings({ animationRandom: target.checked }, { quiet: true });
    if (target.matches('[data-start-capture-filter]')) updateSettings({ captureFilter: target.value.trim() }, { quiet: true });
  });
  root.addEventListener('input', (event) => {
    const target = event.target;
    if (target.matches('[data-start-speed]')) { updateSettings({ animationSpeed: Number(target.value) }, { quiet: true }); target.nextElementSibling.textContent = `${target.value}%`; }
    if (target.matches('[data-start-opacity]')) { updateSettings({ startCardOpacity: Number(target.value) }, { quiet: true }); root.querySelector('.start-inner')?.style.setProperty('--start-card-alpha', `${target.value}%`); target.nextElementSibling.textContent = `${target.value}%`; }
  });
  root.addEventListener('dblclick', (event) => {
    if (event.target.closest('[data-window-drag]') && desktop) appWindow.toggleMaximize().catch(() => {});
    const iface = event.target.closest('[data-start="pick-interface"]');
    if (iface) startLiveCapture(iface.dataset.value);
  });
  root.addEventListener('contextmenu', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) { event.preventDefault(); contextMenu(event, 'tab', { id: tab.dataset.tab }); return; }
    const ifaceRow = event.target.closest('.iface-row')?.querySelector('[data-start="pick-interface"]');
    if (ifaceRow) {
      event.preventDefault();
      // Right-click also selects the row, like a list in a file manager.
      if (state.settings.captureInterface !== ifaceRow.dataset.value) { updateSettings({ captureInterface: ifaceRow.dataset.value }, { quiet: true }); renderStartPage(); }
      contextMenu(event, 'interface', { id: ifaceRow.dataset.value });
      return;
    }
    // The rest of the start page: a menu for what is under the pointer (a sample, a recent file or folder), else the page's own.
    if (event.target.closest('#start-page') && !event.target.closest('input, textarea, select')) {
      event.preventDefault();
      const sample = event.target.closest('[data-start="sample"]');
      if (sample) { contextMenu(event, 'start-sample', { id: sample.dataset.value }); return; }
      const recent = event.target.closest('.start-row')?.querySelector('[data-start="open-recent"], [data-start="open-folder"]');
      if (recent) { contextMenu(event, 'start-recent', { path: recent.dataset.value, folder: recent.dataset.start === 'open-folder' }); return; }
      contextMenu(event, 'start', {});
      return;
    }
    if (!event.target.closest('input, textarea')) event.preventDefault();
  });
  if (desktop) {
    root.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('[data-resize-grip]')) { event.preventDefault(); native.invoke('window_drag', { edge: 'bottomRight' }).catch(() => {}); return; }
      if (!event.target.closest('[data-window-drag]') || event.detail > 1) return;
      event.preventDefault();
      native.invoke('window_drag', {}).catch(() => {});
    });
  }
  bindSteppers(root, (key, value) => {
    if (key === 'animationSpeed') updateSettings({ animationSpeed: value }, { quiet: true });
    if (key === 'startCardOpacity') { updateSettings({ startCardOpacity: value }, { quiet: true }); root.querySelector('.start-inner')?.style.setProperty('--start-card-alpha', `${value}%`); }
  });
  document.addEventListener('keydown', onKeyDown);
  // Web: files dropped on the window.
  if (!desktop) {
    window.addEventListener('dragover', (event) => { event.preventDefault(); setDropActive(true); });
    window.addEventListener('dragleave', (event) => { if (!event.relatedTarget) setDropActive(false); });
    window.addEventListener('drop', (event) => { event.preventDefault(); setDropActive(false); handleDroppedFiles([...(event.dataTransfer?.files ?? [])]); });
  }
  window.addEventListener('resize', () => updateMinimumWidth());
  setInterval(() => { const clock = root.querySelector('#status-clock'); if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 15000);
}

const SHORTCUTS = [
  ['o', false, false, 'open'], ['s', false, false, 'save'], ['s', true, false, 'saveAs'], ['w', false, false, 'closeTab'], ['p', false, false, 'print'], ['q', false, false, 'exit'],
  ['e', false, false, 'captureToggle'], ['r', false, false, 'reload'], ['k', false, false, 'captureOptions'], ['i', false, false, 'interfaces'],
  ['/', false, false, 'focusFilter'], ['f', false, false, 'findPacket'], ['n', false, false, 'findNext'], ['b', false, false, 'findPrev'], ['g', false, false, 'goPacket'],
  ['arrowup', false, false, 'goPrev'], ['arrowdown', false, false, 'goNext'], ['home', false, false, 'goFirst'], ['end', false, false, 'goLast'], [',', false, false, 'goConversationPrev'], ['.', false, false, 'goConversationNext'],
  ['m', false, false, 'markPacket'], ['d', false, false, 'ignorePacket'], ['t', false, false, 'timeReference'], ['c', false, true, 'packetComment'],
  ['t', true, true, 'followTcp'], ['u', true, true, 'followUdp'], ['h', true, true, 'followHttp'], ['s', true, true, 'followTls'], ['c', true, true, 'captureProperties'],
  ['e', true, false, 'expertInfo'], ['n', true, false, 'netMap'], ['=', false, false, 'textZoomIn'], ['+', false, false, 'textZoomIn'], ['-', false, false, 'textZoomOut'], ['0', false, false, 'textZoomReset'],
  ['r', true, false, 'resizeColumns'], ['arrowright', false, false, 'expandSub'], ['arrowleft', false, false, 'collapseSub'], ['arrowright', true, false, 'expandAll'], ['arrowleft', true, false, 'collapseAll'],
  ['l', true, false, 'language'], ['h', true, false, 'startPage'], ['p', true, false, 'settings'], ['j', false, false, 'bottomPanel'], ['1', true, false, 'leftPanel'], ['!', true, false, 'leftPanel'], ['2', true, false, 'rightPanel'], ['@', true, false, 'rightPanel'],
];

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  if (tutorial?.active && key === 'escape') { event.preventDefault(); tutorial.stop(); return; }
  const editing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = event.ctrlKey || event.metaKey;
  if (event.altKey && !mod && (key === 'arrowleft' || key === 'arrowright')) { event.preventDefault(); run(key === 'arrowleft' ? 'goBack' : 'goForward'); return; }
  if (mod) {
    if (editing && ['x', 'c', 'v', 'z', 'y', 'a', 'arrowleft', 'arrowright', 'home', 'end'].includes(key) && !event.altKey) return;
    if (key === 'tab') { event.preventDefault(); cycleTab(event.shiftKey ? -1 : 1); return; }
    const shortcut = SHORTCUTS.find(([k, shift, alt]) => k === key && shift === event.shiftKey && alt === event.altKey);
    if (shortcut) { event.preventDefault(); event.stopPropagation(); run(shortcut[3]); }
    return;
  }
  if (key === 'f1') { event.preventDefault(); run('about'); return; }
  if (key === 'f11') { event.preventDefault(); run('tutorial'); return; }
  if (key === 'f5') { event.preventDefault(); run('reload'); return; }
  if (editing) return;
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
  popups.on('stats-request', (data, kind) => postStats(data, kind));
  popups.on('print-request', (data, kind) => {
    const doc = activeDoc();
    let model = { title: '', packets: [] };
    try {
      if (data.report && state.printReport) model = { title: state.printTitle ?? t('report.heading', { title: doc?.name ?? '' }), packets: [{ no: 0, lines: state.printReport }] };
      else if (doc) model = analysis.printModel(doc, { ...data, settings: state.settings, expanded: state.view?.details.expanded, t });
    } catch (error) { showError('error.print', error); }
    popups.post(kind, { type: 'print-data', model });
  });
  // A statistics window's table (docexport.js): printed through the print window, or saved as a document.
  popups.on('doc-print', (data) => {
    state.printReport = toLines(data.doc);
    state.printTitle = data.doc.title;
    return popups.open('print', { doc: data.doc.subtitle || data.doc.title, report: true, count: 1, displayed: 1, marked: 0, selected: 0 });
  });
  popups.on('doc-export', (data) => exportDoc(data.doc, data.format, data));
  popups.on('printed', (data) => notify('success', t('notice.printed', { sheets: data.sheets ?? 0 })));
  popups.on('apply-filter', (data) => { if (!activeDoc()) return; state.view.setFilterText(data.filter); if (data.prepare) state.view.focusFilter(); else applyDisplayFilter(data.filter); });
  popups.on('go-packet', (data) => { const doc = activeDoc(); if (doc && data.no >= 1 && data.no <= doc.count) { if (!doc.displayed.includes(data.no - 1)) { state.view.setFilterText(''); applyDisplayFilter('').then(() => selectFrame(doc, data.no - 1, { reveal: true })); } else selectFrame(doc, data.no - 1, { reveal: true }); } });
  popups.on('save-image', (data) => saveImage(String(data.svg ?? ''), fileSafe(stripExtension(data.name || 'graph')), { background: data.background ?? '#ffffff' }));
  popups.on('save-text', (data) => saveExport(fileSafe(data.name || 'export.txt'), data.type ?? 'txt', String(data.text ?? ''), data.mime ?? 'text/plain'));
  popups.on('save-bytes', (data) => saveExport(fileSafe(data.name || 'object.bin'), data.type ?? 'any', analysis.objectBytes(activeDoc(), data), data.mime ?? 'application/octet-stream'));
  popups.on('copy-text', (data) => copyText(String(data.text ?? ''), data.what));
  popups.on('filter-check', (data, kind) => { const r = validateFilter(data.text, { fields: FIELDS }); popups.post(kind, { type: 'filter-check', id: data.id, status: r.status, error: r.error ?? '' }); });
  popups.on('fields-request', (data, kind) => popups.post(kind, { type: 'fields', protocols: analysis.protocolList(), fields: analysis.fieldList(data.protocol) }));
  popups.on('coloring-request', (data, kind) => popups.post(kind, { type: 'coloring', rules: loadColoring(), defaults: COLORING_RULES }));
  popups.on('coloring-save', (data) => {
    try { globalThis.localStorage?.setItem(COLORING_KEY, JSON.stringify(data.rules ?? null)); } catch { /* full */ }
    for (const doc of state.docs) doc.setColoring(themedColoring());
    redrawList();
    notify('success', t('notice.coloringSaved'));
  });
  popups.on('coloring-reset', () => { try { globalThis.localStorage?.removeItem(COLORING_KEY); } catch { /* none */ } for (const doc of state.docs) doc.setColoring(themedColoring()); redrawList(); });
  popups.on('filters-changed', () => state.view?.renderFilterBar());
  popups.on('open-columns-window', () => popups.open('columns', {}));
  popups.on('columns-changed', () => { state.settings = loadSettings(globalThis.localStorage); state.view?.list.render(); });
  popups.on('redissect', () => { state.settings = loadSettings(globalThis.localStorage); return redissectAll(); });
  // Settings › Capture: install / reinstall live capture, then tell the window what is there now.
  popups.on('capture-setup', async (data, kind) => { await setupCapture({ reinstall: Boolean(data.reinstall) }); popups.post(kind, { type: 'capture-setup-info', info: await captureSetupInfo().catch(() => null) }); });
  popups.on('refresh-interfaces', async (data, kind) => { await refreshInterfaces({ quiet: false }); popups.post(kind, { type: 'interfaces', interfaces: state.interfaces, backend: state.backend }); });
  popups.on('capture-filter-check', async (data, kind) => {
    let result = { ok: true };
    if (desktop && state.backend?.available && data.filter.trim()) {
      result = await native.invoke('capture_check_filter', { linktype: Number(data.linktype ?? 1), filter: data.filter }).catch((error) => ({ ok: false, error: native.errorText(error) }));
    }
    popups.post(kind, { type: 'capture-filter-check', ...result, filter: data.filter });
  });
  popups.on('follow-filter-out', (data) => { const f = followFilterOut(data.kind === 'udp' ? 'udp' : 'tcp', data.index); state.view.setFilterText(f); applyDisplayFilter(f); });
  popups.on('follow-stream', (data) => { const f = followFilter(data.kind === 'udp' ? 'udp' : 'tcp', data.index); state.view.setFilterText(f); applyDisplayFilter(f); });
  popups.on('select-node', (data) => { const doc = activeDoc(); if (doc && Number.isInteger(data.no)) selectFrame(doc, data.no - 1, { reveal: true }); });
}

// ───────────────────────── tutorial

let tutorial = null;

async function startTutorial(options = {}) {
  tutorial ??= new Tutorial(appApi, root.querySelector('#tutorial-layer'));
  updateSettings({ tutorialOffered: true }, { quiet: true });
  await tutorial.start(options);
}

/**
 * The welcome window, which offers the tutorial. Only over the start page: on its own at start-up only when the start
 * page is showing (not over a capture opened from the command line or a restored session); from Help › Welcome the
 * start page comes to the front first.
 */
async function openWelcome({ auto = false } = {}) {
  const onStart = state.showStart || !activeDoc();
  if (!onStart && auto) return;
  if (!onStart) showStartPage(true);
  updateSettings({ tutorialOffered: true }, { quiet: true });
  const result = await popups.open('welcome', {});
  if (result?.choice === 'tutorial') startTutorial();
  else if (result?.choice === 'sample') openSample(SAMPLES[0]?.id);
}

// ───────────────────────── start-up

async function restoreSession() {
  if (!desktop || !state.settings.restoreSession) return;
  if (state.instance && !state.instance.first) return;
  let files = [];
  try { files = JSON.parse(globalThis.localStorage?.getItem(SESSION_KEY) ?? '{}').files ?? []; } catch { /* none */ }
  if (!files.length) return;
  const exists = await native.pathsExist(files);
  for (const [index, path] of files.entries()) if (exists[index]) await openPath(path, { quiet: true });
}

/** What the start page and the tutorial use. */
const appApi = {
  state,
  t,
  language: () => getLanguage(),
  version: () => (state.info?.version ?? VERSION),
  settings: () => state.settings,
  doc: () => activeDoc(),
  interfaces: () => state.interfaces,
  backend: () => state.backend,
  samples: () => SAMPLES,
  sampleGroups: () => SAMPLE_GROUPS,
  run,
  commands,
  popups,
  notify,
  showError,
  showStartPage,
  updateSettings,
  openSample,
  openMenubarMenu,
  startLiveCapture,
  stopLiveCapture,
  applyDisplayFilter,
  selectFrame,
  renderAll,
  renderToolbarState,
  anchorBelow,
  closeDoc,
  ask,
  openDocWindow,
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
  document.title = `MyNetManager v${state.info?.version ?? VERSION}`;
  native.setBackendLanguage(state.settings.language);
  applySettings({});
  await loadBackground();
  refreshInterfaces().then(() => setTimeout(offerCaptureSetup, 1500));
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
    onCaptureStopped((info) => {
      const doc = state.docs.find((d) => d.capture?.id === info.id);
      if (!doc) return;
      doc.capture = null;
      clearInterval(doc.statsTimer);
      doc.live = false;
      doc.passNew();
      refreshAfterChange(doc);
      if (info.error) showError('error.captureStopped', Object.assign(new Error(info.error), { code: info.code }));
    });
    native.listen('fatal-error', (fatal) => {
      const error = new Error(fatal.message);
      error.stack = [`${t('error.location')}: ${fatal.location}`, `${t('error.thread')}: ${fatal.thread}`, '', fatal.backtrace].join('\n');
      showError('error.fatal', error, fatal.location);
    });
  }
  await restoreSession();
  trackMaximized();
  for (const path of await native.startupFiles().catch(() => [])) await openPath(path);
  // ?sample=<id> opens a sample (tests, links in the docs).
  const sampleParam = new URLSearchParams(location.search).get('sample');
  if (sampleParam) await openSample(sampleParam);
  state.showStart = !state.docs.length;
  if (!state.active && state.docs.length) activate(state.docs[0].id);
  else renderAll();
  if (desktop) {
    await appWindow.show();
    await appWindow.setFocus();
    setTimeout(() => popups.prewarm('menu'), 400);
  }
  if (state.settings.showWelcome && !globalThis.__MYNETMANAGER_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome')) setTimeout(() => openWelcome({ auto: true }), 600);
}

// Test hook: the E2E suites drive the app through this (no effect on normal use).
window.__mynetmanager = {
  state,
  t,
  commands,
  popups,
  run,
  menus: { MENUS, SUBMENUS, enabled: (id) => commandEnabled(id) },
  api: appApi,
  view: () => state.view,
  doc: () => activeDoc(),
  actions: {
    openPath, openCaptureBytes, openSample, saveDoc, closeDoc, selectFrame, applyDisplayFilter, startLiveCapture, stopLiveCapture, restartLiveCapture, refreshInterfaces,
    updateSettings, showStartPage, showError, runAnalysis, setupCapture, openReport, togglePanel, addLog, mergeFile, openWithDialog, copyAs, findPacket, printPackets, openFilterExpression, goRow, goHistory, goConversation, applyConversationFilter, filterFromNode, openMenubarMenu, contextMenu, refreshMap, onMapSelect, exportDissections, followCurrent, openStats, startTutorial, toScreen,
  },
  domain: { FIELDS, PROTOCOLS, SAMPLES, writePcapng, buildTopology, createAnalyzer, buildReport, tutorialSteps: () => TUTORIAL_STEPS.length },
  tutorial: () => tutorial,
  isMac,
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => {
    if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {});
  });
