// MyChartMaster main window: the shell (title row with menus, toolbar, tabs, status bar, start page) in
// MyNetManager's style, and the chart tabs (views/chartview.js). Commands are one table used by the menus,
// the toolbar, the shortcuts, the context menus and the tutorial.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import APP_ICON from '../assets/icon-256.png';
import { ChartDoc, newChartOptions } from './domain/chart/doc.js';
import { blankTable, SAMPLE_GROUPS, SAMPLES, starterFor } from './domain/chart/samples.js';
import { CHART_GROUPS, CHART_IDS, chartName, chartType } from './domain/chart/types.js';
import { chartDataTable, renderChart } from './domain/chart/render.js';
import { CHART_THEMES, chartTheme, palette, PALETTES } from './domain/chart/palettes.js';
import { cellText, columnStats, deleteColumns, deleteRows, insertColumn, insertRow, matchingRows, parseNumber, renameColumn, setCell, sortRows, transpose, cloneTable, inferTypes, normalizeCell, columnLetter } from './domain/data/table.js';
import { detectFormat, importData, importPasted, IMPORT_EXTENSIONS, splitDelimited } from './domain/data/importers.js';
import { DATA_FORMATS, exportData, toXlsx } from './domain/data/exporters.js';
import { chartSvg, CHART_FORMATS, exportChart } from './domain/export/chartexport.js';
import { addRecent, loadRecent, loadRecentDirs, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import { ANIMATIONS, loadSettings, SESSION_KEY, storeSettings, zoomStep } from './domain/settings.js';
import { DOC_KINDS, docLabel, docWindowTitle } from './domain/helpdocs.js';
import { switchFlag } from './flags.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { PopupHost } from './platform/popups.js';
import { applyFont, applyTheme, randomThemeId, resolveTheme, themeName } from './themes.js';
import { escapeHtml, isMac, keyLabel } from './ui/dom.js';
import { bindSteppers } from './stepper.js';
import { AnimatedBackground } from './ui/background.js';
import { sampleIcon, startPageHtml } from './ui/startpage.js';
import { startBoard } from './ui/startboard.js';
import { STEPS as TUTORIAL_STEPS, Tutorial } from './ui/tutorial.js';
import { ChartView } from './views/chartview.js';

const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';

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
  minWidth: 0,
  maximized: false,
  showStart: false,
  view: null,
  inspectorTab: 'data',
  pendingImport: null,
  untitled: 0,
  log: [],
};

const activeDoc = () => state.docs.find((doc) => doc.id === state.active) ?? null;
const lang = () => getLanguage();
const baseName = (path) => String(path ?? '').split(/[\\/]/).pop() ?? '';
const directoryOf = (path) => { const p = String(path ?? ''); const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')); return i > 0 ? p.slice(0, i) : ''; };
const stripExtension = (name) => String(name).replace(/\.[a-z0-9]{1,8}$/i, '');
const fileSafe = (text) => String(text ?? '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'chart';

// ───────────────────────── log, notices & errors

function addLog(level, text) {
  state.log.push({ time: Date.now(), level, text: String(text) });
  if (state.log.length > 2000) state.log.splice(0, state.log.length - 2000);
}

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
  if (/^[a-z]+\.[a-zA-Z.]+$/.test(text) && t(`error.${text}`, null, '') ) return { message: t(`error.${text}`), detail: '' };
  return { message: text, detail: error?.stack && !String(error.stack).startsWith(text) ? error.stack : error?.stack?.split('\n').slice(1).join('\n') ?? '' };
}

function showError(titleKey, error, context = '') {
  const { message, detail } = formatError(error);
  console.error(titleKey, error);
  notify('error', `${t(titleKey)}: ${message.split('\n')[0]}`);
  const info = state.info;
  return popups.open('error', {
    title: t(titleKey), message, detail: detail ?? '', context, time: new Date().toLocaleString(),
    app: info ? `${info.name} ${info.version} (${info.web ? 'web' : `${info.os}/${info.arch}`}, ${info.commit})` : `MyChartMaster ${VERSION}`,
  });
}

// 'ResizeObserver loop …' is the browser noting that a layout settled one frame later (start page cards): not an error.
const benign = (event) => /ResizeObserver loop/.test(String(event.message ?? ''));
window.addEventListener('error', (event) => { if (benign(event)) return; showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''); });
window.addEventListener('unhandledrejection', (event) => { if (!event.reason?.cancelled) showError('error.unexpected', event.reason); });

// ───────────────────────── chart tabs

function themeColors() {
  return resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme).colors;
}

function addDoc(doc) {
  state.docs.push(doc);
  activate(doc.id);
  return doc;
}

function activate(id) {
  state.active = id;
  state.showStart = false;
  mountView();
  renderAll();
  persistSession();
}

function mountView() {
  const host = root.querySelector('#view-host');
  if (!activeDoc() || state.showStart) { state.view?.destroy(); state.view = null; host.hidden = true; return; }
  host.hidden = false;
  if (!state.view) state.view = new ChartView(host, viewApi);
  state.view.animateNext = true;
  state.view.refresh();
}

function refreshView(options) {
  if (!state.view || state.showStart) return;
  if (options) state.view.update(options); else state.view.refresh();
  renderTabs();
  renderStatus();
  renderToolbarState();
}

function persistSession() {
  try {
    globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify({ files: state.docs.filter((doc) => doc.path && /\.mychart$/i.test(doc.path)).map((doc) => doc.path) }));
  } catch { /* private mode */ }
}

const importOptions = (extra = {}) => ({
  header: state.settings.importHeader, delimiter: state.settings.importDelimiter, encoding: state.settings.importEncoding,
  decimal: state.settings.importDecimal, maxRows: state.settings.importMaxRows, ...extra,
});

/** A new chart for a table: the type guessed from the data unless given. */
function chartForTable(table, name, { type = null, title = '' } = {}) {
  const numbers = table.columns.filter((c) => c.type === 'number').length;
  const texts = table.columns.length - numbers;
  const guess = type ?? (texts === 0 && numbers >= 2 ? 'scatter' : table.rows.length > 24 && texts ? 'line' : numbers === 1 && table.rows.length <= 8 ? 'pie' : 'column');
  return { type: guess, title: title || stripExtension(name), options: newChartOptions(state.settings) };
}

/** Opens bytes as a chart: .mychart as it was saved, a data file as a new chart of its table. */
async function openBytes(name, bytes, { path = null, handle = null, quiet = false } = {}) {
  const already = path && state.docs.find((doc) => doc.path && doc.path.replace(/\\/g, '/').toLowerCase() === path.replace(/\\/g, '/').toLowerCase());
  if (already) { activate(already.id); return already; }
  let doc;
  try {
    const result = await importData(bytes, name, importOptions());
    if (result.document) doc = ChartDoc.fromJSON(result.document, { name, path, handle });
    else {
      if (!result.table.rows.length) throw new Error('import.empty');
      doc = new ChartDoc({ name: `${stripExtension(name)}.mychart`, table: result.table, chart: chartForTable(result.table, name) });
      doc.dirty = true;
      doc.source = { name, path, sheets: result.sheets ?? null };
    }
  } catch (error) {
    if (!quiet) showError('error.open', error, path ?? name);
    return null;
  }
  addDoc(doc);
  if (path) rememberRecent({ path });
  else if (handle) { rememberRecent({ path: name, web: true }); native.storeWebHandle(name, handle); }
  if (!quiet) notify('success', t(doc.source ? 'notice.imported' : 'notice.opened', { name, rows: doc.table.rows.length, cols: doc.table.columns.length }));
  if (doc.source?.sheets?.length > 1) notify('info', t('notice.sheets', { count: doc.source.sheets.length }));
  return doc;
}

async function openPath(path, { quiet = false } = {}) {
  try {
    const bytes = await withProgress('progress.read', baseName(path), (op) => native.readBinaryFile(path, op));
    return await openBytes(baseName(path), bytes, { path, quiet });
  } catch (error) {
    if (!quiet) showError('error.open', error, path);
    return null;
  }
}

async function openWithDialog(directory = null) {
  try {
    if (desktop) {
      const paths = await native.chooseFilesToOpen(directory ?? state.settings.lastDirectory);
      for (const path of paths) await openPath(path);
    } else {
      for (const file of await native.pickFilesWeb()) await openBytes(file.name, file.content, { handle: file.handle });
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
        return openBytes(file.name, new Uint8Array(await file.arrayBuffer()), { handle });
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

function openSample(id) {
  const sample = SAMPLES.find((s) => s.id === id) ?? SAMPLES[0];
  if (!sample) return null;
  const built = sample.build(lang());
  const doc = new ChartDoc({ name: built.name, table: built.table, chart: { ...built.chart, options: { ...newChartOptions(state.settings), ...built.chart.options } }, sample: sample.id });
  addDoc(doc);
  notify('success', t('notice.sampleOpened', { name: sample[lang()]?.[0] ?? id }));
  return doc;
}

/** A new chart: of a type, with that type's starter data (or an empty grid). */
function newChart(type = 'column', { blank = false } = {}) {
  state.untitled += 1;
  const L = lang();
  const starter = blank ? { table: blankTable(L), chart: { type, title: '', options: {} } } : starterFor(type, L);
  const name = `${t('chart.untitled')} ${state.untitled}.mychart`;
  const doc = new ChartDoc({ name, table: starter.table, chart: { ...starter.chart, type, options: { ...newChartOptions(state.settings), ...starter.chart.options } } });
  doc.dirty = !blank;
  addDoc(doc);
  if (blank) setTimeout(() => state.view?.grid.focus(), 50);
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

/** Saves the chart (.mychart: the data and the chart together). */
async function saveDoc(doc, { saveAs = false } = {}) {
  if (!doc) return false;
  try {
    const text = doc.serialize();
    if (desktop) {
      let path = !saveAs && doc.path && /\.mychart$/i.test(doc.path) ? doc.path : null;
      if (!path) {
        path = await native.chooseSavePath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${fileSafe(stripExtension(doc.name))}.mychart`, ['mychart']);
        if (!path) return false;
      }
      await withProgress('progress.save', baseName(path), (op) => native.writeTextFile(path, text, op));
      doc.path = path;
      doc.name = baseName(path);
      rememberRecent({ path });
    } else {
      const saved = await native.saveFileWeb(new Blob([text], { type: 'application/json' }), { name: `${fileSafe(stripExtension(doc.name))}.mychart`, handle: saveAs ? null : doc.handle, saveAs, mime: 'application/json' });
      if (!saved) return false;
      doc.handle = saved.handle;
      doc.name = saved.name;
    }
    doc.dirty = false;
    doc.source = null;
    renderAll();
    persistSession();
    notify('success', t('notice.saved', { name: doc.name }));
    return true;
  } catch (error) {
    showError('error.save', error, doc.name);
    return false;
  }
}

/** Saves an export (text or bytes) where the user chooses. */
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
      const saved = await native.saveFileWeb(new Blob([content], { type: mime }), { name, saveAs: true, mime });
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
  if (doc.dirty && !force && !doc.tourSample) {
    const choice = await ask({
      icon: 'save', title: t('confirm.unsavedTitle'), message: t('confirm.unsavedChart', { name: doc.name }),
      buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }],
    });
    if (choice === 'cancel') return false;
    if (choice === 'save' && !(await saveDoc(doc))) return false;
  }
  const index = state.docs.indexOf(doc);
  if (index < 0) return true;
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

async function closeAll() {
  for (const doc of [...state.docs]) if (!(await closeDoc(doc))) return false;
  return true;
}

// ───────────────────────── editing the data and the chart

/** Applies a new table to the active chart (one undo step). */
function changeTable(table, { merge = null, message = null } = {}) {
  const doc = activeDoc();
  if (!doc) return;
  doc.setTable(table, { merge });
  refreshView({});
  if (message) notify('info', message);
}

function setOption(key, value, merge = null, live = false) {
  const doc = activeDoc();
  if (!doc) return;
  doc.setChart({ options: { [key]: value } }, { merge: merge ?? `opt:${key}` });
  refreshView({ inspector: !live, grid: key === 'colors' || key === 'hidden' });
}

/** A chart theme for the active chart: its look and its palette (the program's theme is left alone). */
function setChartTheme(id) {
  const doc = activeDoc();
  if (!doc) return;
  const theme = chartTheme(id);
  doc.setChart({ options: { chartTheme: theme.id, palette: theme.palette, colors: {} } }, { merge: 'chart-theme' });
  refreshView({ inspector: true, grid: true });
  notify('info', t('notice.chartTheme', { name: t(`chartTheme.${theme.id}`) }));
}

function setChartType(type) {
  const doc = activeDoc();
  if (!doc || !CHART_IDS.includes(type)) return;
  if (doc.setType(type)) {
    if (state.view) state.view.animateNext = true;
    refreshView({});
    notify('info', t('notice.type', { name: chartName(type, lang()) }));
  }
}

function setMapping(patch) {
  const doc = activeDoc();
  if (!doc) return;
  doc.setChart({ mapping: patch, options: { hidden: [] } });
  refreshView({});
}

function setInspectorTab(tab) {
  state.inspectorTab = tab;
  state.view?.inspector.render();
}

function cycleType(direction) {
  const doc = activeDoc();
  if (!doc) return;
  const i = CHART_IDS.indexOf(doc.chart.type);
  setChartType(CHART_IDS[(i + direction + CHART_IDS.length) % CHART_IDS.length]);
}

function undo() {
  const doc = activeDoc();
  if (doc?.undo()) { refreshView({}); notify('info', t('notice.undone')); }
}

function redo() {
  const doc = activeDoc();
  if (doc?.redo()) { refreshView({}); notify('info', t('notice.redone')); }
}

const gridSel = () => state.view?.grid.selection() ?? { r0: 0, r1: 0, c0: 0, c1: 0 };

function addRow() {
  const doc = activeDoc();
  if (!doc) return;
  const at = Math.min(doc.table.rows.length, gridSel().r1 + 1);
  changeTable(insertRow(doc.table, at));
  state.view?.grid.setActive(at, gridSel().c0);
}

function addColumn() {
  const doc = activeDoc();
  if (!doc) return;
  const at = Math.min(doc.table.columns.length, gridSel().c1 + 1);
  changeTable(insertColumn(doc.table, at, `${t('grid.newColumn')} ${columnLetter(at)}`));
  state.view?.grid.setActive(gridSel().r0, at);
}

function deleteSelectedRows() {
  const doc = activeDoc();
  if (!doc || !doc.table.rows.length) return;
  const s = gridSel();
  const rows = [];
  for (let r = s.r0; r <= Math.min(s.r1, doc.table.rows.length - 1); r++) rows.push(r);
  if (!rows.length) return;
  changeTable(deleteRows(doc.table, rows), { message: t('notice.rowsDeleted', { count: rows.length }) });
}

function deleteSelectedColumns() {
  const doc = activeDoc();
  if (!doc) return;
  const s = gridSel();
  const cols = [];
  for (let c = s.c0; c <= s.c1; c++) cols.push(c);
  if (cols.length >= doc.table.columns.length) { notify('error', t('notice.lastColumn')); return; }
  changeTable(deleteColumns(doc.table, cols), { message: t('notice.columnsDeleted', { count: cols.length }) });
}

function sortBy(direction) {
  const doc = activeDoc();
  if (!doc) return;
  const c = gridSel().c0;
  changeTable(sortRows(doc.table, c, direction, lang()), { message: t('notice.sorted', { name: doc.table.columns[c]?.name ?? '' }) });
}

function clearCells(sel) {
  const doc = activeDoc();
  if (!doc) return;
  const table = cloneTable(doc.table);
  for (let r = sel.r0; r <= Math.min(sel.r1, table.rows.length - 1); r++) for (let c = sel.c0; c <= sel.c1; c++) table.rows[r][c] = null;
  changeTable(inferTypes(table));
}

/** A tab-separated block (copied from a spreadsheet) written into the grid from (r, c), growing it as needed. */
function pasteBlock(r, c, text) {
  const doc = activeDoc();
  if (!doc) return;
  const block = splitDelimited(String(text).replace(/\r?\n$/, ''), text.includes('\t') ? '\t' : ',');
  if (!block.length) return;
  const table = cloneTable(doc.table);
  const width = Math.max(...block.map((row) => row.length));
  while (table.columns.length < c + width) { table.columns.push({ name: columnLetter(table.columns.length), type: 'text' }); for (const row of table.rows) row.push(null); }
  block.forEach((cells, k) => {
    const rr = r + k;
    while (table.rows.length <= rr) table.rows.push(Array(table.columns.length).fill(null));
    cells.forEach((v, j) => { const n = parseNumber(v); table.rows[rr][c + j] = v === '' ? null : n != null && /^[\s+\-−(]*[$€£¥₩]?[\d.,\s]+%?[)]?$/.test(v) ? n : normalizeCell(v); });
  });
  changeTable(inferTypes(table), { message: t('notice.pasted', { rows: block.length, cols: width }) });
}

async function editText(which) {
  const doc = activeDoc();
  if (!doc) return;
  if (which === 'axis') { setInspectorTab('axes'); if (!state.settings.showRightPanel) updateSettings({ showRightPanel: true }); return; }
  const result = await popups.open('prompt', { icon: 'chartTitle', title: t(which === 'subtitle' ? 'inspector.subtitle' : 'inspector.title'), label: t(which === 'subtitle' ? 'inspector.subtitle' : 'inspector.title'), value: doc.chart[which] ?? '' });
  if (result?.value == null) return;
  doc.setChart({ [which]: result.value });
  refreshView({});
}

async function renameColumnPrompt(c) {
  const doc = activeDoc();
  if (!doc || c == null) return;
  const result = await popups.open('prompt', { icon: 'edit', title: t('action.renameColumn'), label: t('grid.columnName'), value: doc.table.columns[c].name });
  if (result?.value?.trim()) changeTable(renameColumn(doc.table, c, result.value.trim()));
}

function setColumnType(c, type) {
  const doc = activeDoc();
  if (!doc) return;
  const table = cloneTable(doc.table);
  table.columns[c].type = type;
  if (type === 'number') for (const row of table.rows) { const n = parseNumber(row[c]); if (n != null) row[c] = n; }
  if (type !== 'number') for (const row of table.rows) if (typeof row[c] === 'number') row[c] = cellText(row[c]);
  doc.setTable(table);
  doc.table.columns[c].type = type;
  refreshView({});
}

// ───────────────────────── import

/** Starts an import from bytes: the import window shows a preview with the choices. */
async function startImport(name, bytes, { path = null, replace = false } = {}) {
  let first;
  try {
    first = await importData(bytes, name, importOptions({ maxRows: 1 }));
  } catch (error) {
    return showError('error.import', error, name);
  }
  if (first.document) return openBytes(name, bytes, { path });
  state.pendingImport = { name, bytes, path };
  const result = await popups.open('import', { name, format: first.format, sheets: first.sheets ?? [], canReplace: Boolean(activeDoc()) && !state.showStart, mode: replace ? 'replace' : 'new' });
  if (!result) { state.pendingImport = null; return null; }
  try {
    const out = await importData(bytes, name, importOptions({ header: result.header, delimiter: result.delimiter, encoding: result.encoding, decimal: result.decimal, sheet: result.sheet }));
    if (!out.table.rows.length) throw new Error('import.empty');
    if (path) rememberDirectory(directoryOf(path));
    if (result.mode === 'replace' && activeDoc()) {
      changeTable(out.table, { message: t('notice.dataReplaced', { name, rows: out.table.rows.length }) });
      return activeDoc();
    }
    const label = out.sheets?.length > 1 ? `${stripExtension(name)} - ${out.sheets[out.sheet]}` : stripExtension(name);
    const doc = new ChartDoc({ name: `${label}.mychart`, table: out.table, chart: chartForTable(out.table, label) });
    doc.dirty = true;
    addDoc(doc);
    notify('success', t('notice.imported', { name, rows: out.table.rows.length, cols: out.table.columns.length }));
    return doc;
  } catch (error) {
    return showError('error.import', error, name);
  } finally {
    state.pendingImport = null;
  }
}

async function importWithDialog({ replace = false } = {}) {
  try {
    if (desktop) {
      const [path] = await native.chooseFiles(state.settings.lastDirectory, [{ name: 'Data (*.csv, *.tsv, *.txt, *.xlsx, *.ods, *.json, *.xml, *.html, *.md)', extensions: IMPORT_EXTENSIONS.filter((x) => x !== 'mychart') }, { name: 'All files (*.*)', extensions: ['*'] }], false);
      if (!path) return null;
      const bytes = await withProgress('progress.read', baseName(path), (op) => native.readBinaryFile(path, op));
      return startImport(baseName(path), bytes, { path, replace });
    }
    const [file] = await native.pickFilesWeb();
    if (!file) return null;
    return startImport(file.name, file.content, { replace });
  } catch (error) {
    return showError('error.import', error);
  }
}

/** Text as an import (the tutorial, pasted text): the same window as a file. */
function importText(text, name = 'data.csv') {
  return startImport(name, new TextEncoder().encode(text));
}

async function pasteData() {
  let text = '';
  try { text = await native.clipboardRead(); } catch (error) { return showError('error.paste', error); }
  if (!String(text ?? '').trim()) return notify('info', t('notice.clipboardEmpty'));
  try {
    const out = await importPasted(text, importOptions());
    const doc = new ChartDoc({ name: `${t('chart.pasted')}.mychart`, table: out.table, chart: chartForTable(out.table, t('chart.pasted')) });
    doc.dirty = true;
    addDoc(doc);
    return notify('success', t('notice.imported', { name: t('chart.pasted'), rows: out.table.rows.length, cols: out.table.columns.length }));
  } catch (error) {
    return showError('error.import', error);
  }
}

// ───────────────────────── export, copy, print

const exportBase = (doc) => fileSafe(doc.chart.title || stripExtension(doc.name));

async function exportChartAs(choice) {
  const doc = activeDoc();
  if (!doc || !choice) return undefined;
  try {
    const out = await exportChart(doc, choice.format, { ...choice, language: lang(), theme: themeColors(), avif: desktop ? native.encodeAvif : null });
    return saveExport(`${exportBase(doc)}.${out.ext}`, out.ext === 'md' ? 'md' : out.ext, out.content, out.mime);
  } catch (error) {
    return showError('error.export', error, choice.format);
  }
}

async function openExport(format = null) {
  const doc = activeDoc();
  if (!doc) return undefined;
  const choice = await popups.open('export', { name: doc.name, width: doc.chart.options.width, height: doc.chart.options.height, ...(format ? { format } : {}) });
  return exportChartAs(choice);
}

async function exportDataAs(format) {
  const doc = activeDoc();
  if (!doc) return undefined;
  const [ext, , mime] = DATA_FORMATS[format] ?? DATA_FORMATS.csv;
  try {
    const content = format === 'xlsx' ? await toXlsx(doc.table, { sheetName: doc.chart.title || 'Data' }) : exportData(doc.table, format, { title: doc.chart.title });
    return saveExport(`${exportBase(doc)}-data.${ext}`, ext, content, mime);
  } catch (error) {
    return showError('error.export', error);
  }
}

async function copyImage(choice = {}) {
  const doc = activeDoc();
  if (!doc) return;
  try {
    const out = await exportChart(doc, 'png', { scale: choice.scale ?? 2, width: choice.width, height: choice.height, background: choice.background, language: lang(), theme: themeColors() });
    if (globalThis.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([out.content], { type: 'image/png' }) })]);
      notify('success', t('notice.copied', { what: t('copy.image') }));
      return;
    }
    throw new Error('no image clipboard');
  } catch {
    try {
      await native.clipboardWrite(chartSvg(doc, { language: lang(), theme: themeColors() }));
      notify('success', t('notice.copied', { what: 'SVG' }));
    } catch (error) {
      showError('error.copy', error);
    }
  }
}

async function copyText(text, what = '') {
  try {
    await native.clipboardWrite(text);
    notify('success', t('notice.copied', { what: what || t('copy.text') }));
  } catch (error) {
    showError('error.copy', error);
  }
}

function printChart() {
  const doc = activeDoc();
  if (!doc) return undefined;
  return popups.open('print', { name: doc.name });
}

async function openPalette(anchor = null) {
  const doc = activeDoc();
  if (!doc) return;
  const result = await popups.open('palette', { current: doc.chart.options.palette }, anchor ? { anchor: anchorBelow(anchor) } : {});
  if (result?.palette) { setOption('palette', result.palette); setOption('colors', {}); notify('info', t('notice.palette', { name: palette(result.palette)[lang()] })); }
}

function cycleLegend() {
  const doc = activeDoc();
  if (!doc) return;
  const order = ['bottom', 'right', 'top', 'left', 'none'];
  setOption('legend', order[(order.indexOf(doc.chart.options.legend) + 1) % order.length]);
}

function zoom(direction) {
  if (direction === 0) return updateSettings({ textZoom: 0 });
  const current = state.settings.textZoom || Math.round((state.view?.scale ?? 1) * 100);
  return updateSettings({ textZoom: zoomStep(current, direction) });
}

// ───────────────────────── panels

const FOLD_SETTING = { left: 'showLeftPanel', right: 'showRightPanel', bottom: 'showBottomPanel' };
function togglePanel(which) {
  const key = FOLD_SETTING[which];
  if (key) updateSettings({ [key]: !state.settings[key] });
}

// ───────────────────────── commands

const hasDoc = () => Boolean(activeDoc()) && !state.showStart;
const toggle = (key) => updateSettings({ [key]: !state.settings[key] });
const opt = (key) => activeDoc()?.chart.options[key];

const commands = {
  // File
  newChart: { icon: 'newChart', label: 'action.newChart', key: 'Ctrl+N', run: () => newChart('column') },
  newBlank: { icon: 'fileNew', label: 'action.newBlank', run: () => newChart('column', { blank: true }) },
  open: { icon: 'folderOpen', label: 'action.open', key: 'Ctrl+O', run: () => openWithDialog() },
  recent: { icon: 'recent', label: 'action.recent', run: () => popups.open('recent', {}) },
  closeTab: { icon: 'closeTab', label: 'action.closeTab', key: 'Ctrl+W', enabled: () => Boolean(activeDoc()), run: () => closeDoc(activeDoc()) },
  closeAll: { icon: 'closeAll', label: 'action.closeAll', enabled: () => state.docs.length > 0, run: () => closeAll() },
  save: { icon: 'save', label: 'action.save', key: 'Ctrl+S', enabled: hasDoc, run: () => saveDoc(activeDoc()) },
  saveAs: { icon: 'saveAs', label: 'action.saveAs', key: 'Ctrl+Shift+S', enabled: hasDoc, run: () => saveDoc(activeDoc(), { saveAs: true }) },
  exportChart: { icon: 'exportChart', label: 'action.exportChart', key: 'Ctrl+E', enabled: hasDoc, run: () => openExport() },
  ...Object.fromEntries(Object.keys(CHART_FORMATS).map((f) => [`export:${f}`, { icon: { svg: 'svgFile', pdf: 'pdfFile', html: 'htmlFile', docx: 'reportWord', markdown: 'reportMarkdown' }[f] ?? 'imageFormat', label: `format.${f}`, enabled: hasDoc, run: () => openExport(f) }])),
  ...Object.fromEntries(Object.keys(DATA_FORMATS).map((f) => [`exportData:${f}`, { icon: f === 'xlsx' ? 'xlsxFile' : f === 'json' ? 'jsonFile' : 'csvFile', label: `dataFormat.${f}`, enabled: hasDoc, run: () => exportDataAs(f) }])),
  print: { icon: 'print', label: 'action.print', key: 'Ctrl+P', enabled: hasDoc, run: () => printChart() },
  startPage: { icon: 'home', label: 'action.startPage', key: 'Ctrl+Shift+H', run: () => showStartPage(true) },
  exit: { icon: 'exit', label: 'action.exit', key: 'Ctrl+Q', run: () => requestExit() },
  // Edit
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: () => hasDoc() && activeDoc().canUndo(), run: () => undo() },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: () => hasDoc() && activeDoc().canRedo(), run: () => redo() },
  copyImage: { icon: 'copyImage', label: 'action.copyImage', key: 'Ctrl+Shift+C', enabled: hasDoc, run: () => copyImage() },
  copySvg: { icon: 'svgFile', label: 'action.copySvg', enabled: hasDoc, run: () => copyText(chartSvg(activeDoc(), { language: lang(), theme: themeColors() }), 'SVG') },
  copyData: { icon: 'copy', label: 'action.copyData', enabled: hasDoc, run: () => copyText(exportData(activeDoc().table, 'tsv'), t('copy.data')) },
  copyCells: { icon: 'copy', label: 'action.copyCells', enabled: hasDoc, run: () => copyText(state.view?.grid.selectionText() ?? '', t('copy.cells')) },
  pasteCells: { icon: 'paste', label: 'action.pasteCells', enabled: hasDoc, run: async () => { const text = await native.clipboardRead().catch(() => ''); if (text) { const s = gridSel(); pasteBlock(s.r0, s.c0, text); } } },
  settings: { icon: 'gear', label: 'action.settings', key: 'Ctrl+Shift+P', run: () => popups.open('settings', { tab: 'general' }) },
  // Data
  importData: { icon: 'importData', label: 'action.importData', key: 'Ctrl+I', run: () => importWithDialog() },
  replaceData: { icon: 'refresh', label: 'action.replaceData', enabled: hasDoc, run: () => importWithDialog({ replace: true }) },
  pasteData: { icon: 'pasteData', label: 'action.pasteData', key: 'Ctrl+Shift+V', run: () => pasteData() },
  addRow: { icon: 'addRow', label: 'action.addRow', key: 'Ctrl+Enter', enabled: hasDoc, run: () => addRow() },
  addColumn: { icon: 'addColumn', label: 'action.addColumn', key: 'Ctrl+Shift+Enter', enabled: hasDoc, run: () => addColumn() },
  deleteRows: { icon: 'deleteRow', label: 'action.deleteRows', enabled: () => hasDoc() && activeDoc().table.rows.length > 0, run: () => deleteSelectedRows() },
  deleteColumns: { icon: 'deleteColumn', label: 'action.deleteColumns', enabled: () => hasDoc() && activeDoc().table.columns.length > 1, run: () => deleteSelectedColumns() },
  renameColumn: { icon: 'edit', label: 'action.renameColumn', enabled: hasDoc, run: () => renameColumnPrompt(gridSel().c0) },
  sortAsc: { icon: 'sortAsc', label: 'action.sortAsc', enabled: () => hasDoc() && activeDoc().table.rows.length > 1, run: () => sortBy(1) },
  sortDesc: { icon: 'sortDesc', label: 'action.sortDesc', enabled: () => hasDoc() && activeDoc().table.rows.length > 1, run: () => sortBy(-1) },
  transpose: { icon: 'transpose', label: 'action.transpose', key: 'Ctrl+Shift+T', enabled: () => hasDoc() && activeDoc().table.columns.length > 1, run: () => changeTable(transpose(activeDoc().table), { message: t('notice.transposed') }) },
  clearCells: { icon: 'clear', label: 'action.clearCells', enabled: hasDoc, run: () => clearCells(gridSel()) },
  dataStats: { icon: 'dataStats', label: 'action.dataStats', key: 'Ctrl+Shift+I', enabled: hasDoc, run: () => popups.open('datastats', { name: activeDoc().name }) },
  ...Object.fromEntries(['number', 'text', 'date'].map((type) => [`colType:${type}`, { icon: { number: 'typeNumber', text: 'typeText', date: 'typeDate' }[type], label: `type.${type}`, enabled: hasDoc, checked: () => activeDoc()?.table.columns[gridSel().c0]?.type === type, run: () => setColumnType(gridSel().c0, type) }])),
  // Chart
  ...Object.fromEntries(CHART_IDS.map((id) => [`type:${id}`, { icon: chartType(id).icon, label: `chartType.${id}`, enabled: hasDoc, checked: () => activeDoc()?.chart.type === id, run: () => setChartType(id) }])),
  prevType: { icon: 'chevronLeft', label: 'action.prevType', key: 'Ctrl+[', enabled: hasDoc, run: () => cycleType(-1) },
  nextType: { icon: 'chevronRight', label: 'action.nextType', key: 'Ctrl+]', enabled: hasDoc, run: () => cycleType(1) },
  editTitle: { icon: 'chartTitle', label: 'action.editTitle', enabled: hasDoc, run: () => editText('title') },
  toggleLabels: { icon: 'dataLabelsToggle', label: 'action.toggleLabels', key: 'Ctrl+L', enabled: hasDoc, checked: () => Boolean(opt('dataLabels')), run: () => setOption('dataLabels', !opt('dataLabels')) },
  cycleLegend: { icon: 'legendIcon', label: 'action.cycleLegend', key: 'Ctrl+Shift+G', enabled: hasDoc, run: () => cycleLegend() },
  ...Object.fromEntries(['top', 'bottom', 'left', 'right', 'none'].map((p) => [`legend:${p}`, { icon: 'legendIcon', label: `pos.${p}`, enabled: hasDoc, checked: () => opt('legend') === p, run: () => setOption('legend', p) }])),
  toggleGrid: { icon: 'grid', label: 'action.toggleGrid', enabled: hasDoc, checked: () => Boolean(opt('gridLines')), run: () => setOption('gridLines', !opt('gridLines')) },
  toggleTrend: { icon: 'trendline', label: 'action.toggleTrend', enabled: hasDoc, checked: () => Boolean(opt('trendline')), run: () => setOption('trendline', !opt('trendline')) },
  paletteMenu: { icon: 'palette', label: 'action.paletteMenu', key: 'Ctrl+K', enabled: hasDoc, run: (context) => openPalette(context?.element) },
  ...Object.fromEntries(CHART_THEMES.map((c) => [`chartTheme:${c.id}`, { icon: 'chartTheme', label: `chartTheme.${c.id}`, enabled: hasDoc, checked: () => (opt('chartTheme') ?? 'classic') === c.id, run: () => setChartTheme(c.id) }])),
  ...Object.fromEntries(PALETTES.slice(0, 12).map((p) => [`palette:${p.id}`, { icon: 'palette', label: `palette.${p.id}`, enabled: hasDoc, checked: () => opt('palette') === p.id, run: () => { setOption('palette', p.id); setOption('colors', {}); } }])),
  ...Object.fromEntries(['theme', 'chart', 'white', 'transparent'].map((b) => [`bg:${b}`, { icon: { white: 'whiteBg', theme: 'palette', chart: 'chartTheme', transparent: 'transparentBg' }[b], label: `bg.${b}`, enabled: hasDoc, checked: () => opt('background') === b, run: () => setOption('background', b) }])),
  resetStyle: { icon: 'clearFormat', label: 'action.resetStyle', enabled: hasDoc, run: () => { const doc = activeDoc(); const keep = { width: doc.chart.options.width, height: doc.chart.options.height }; doc.setChart({ options: { ...newChartOptions(state.settings), ...keep, colors: {}, hidden: [] } }); refreshView({}); } },
  duplicateChart: { icon: 'duplicate', label: 'action.duplicateChart', enabled: hasDoc, run: () => { const doc = activeDoc(); const copy = ChartDoc.fromJSON(doc.toJSON(), { name: `${stripExtension(doc.name)} (2).mychart` }); copy.dirty = true; addDoc(copy); } },
  showInspector: { icon: 'inspector', label: 'action.inspector', run: () => { if (!state.settings.showRightPanel) updateSettings({ showRightPanel: true }); } },
  // View
  leftPanel: { icon: 'panelLeft', label: 'action.leftPanel', key: 'Ctrl+Shift+1', checked: () => state.settings.showLeftPanel, run: () => togglePanel('left') },
  rightPanel: { icon: 'panelRight', label: 'action.rightPanel', key: 'Ctrl+Shift+2', checked: () => state.settings.showRightPanel, run: () => togglePanel('right') },
  bottomPanel: { icon: 'panelBottom', label: 'action.bottomPanel', key: 'Ctrl+J', checked: () => state.settings.showBottomPanel, run: () => togglePanel('bottom') },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => state.settings.showStatusBar, run: () => toggle('showStatusBar') },
  ...Object.fromEntries(['grid-bottom', 'grid-right', 'chart-only'].map((l) => [`layout:${l}`, { icon: { 'grid-bottom': 'panelBottom', 'grid-right': 'panelRight', 'chart-only': 'chartColumn' }[l], label: `layout.${l}`, checked: () => state.settings.paneLayout === l, run: () => updateSettings({ paneLayout: l }) }])),
  zoomIn: { icon: 'zoomIn', label: 'action.zoomIn', key: 'Ctrl+=', enabled: hasDoc, run: () => zoom(1) },
  zoomOut: { icon: 'zoomOut', label: 'action.zoomOut', key: 'Ctrl+-', enabled: hasDoc, run: () => zoom(-1) },
  zoomFit: { icon: 'fitView', label: 'action.zoomFit', key: 'Ctrl+0', enabled: hasDoc, checked: () => !state.settings.textZoom, run: () => zoom(0) },
  zoom100: { icon: 'zoomReset', label: 'action.zoom100', enabled: hasDoc, run: () => updateSettings({ textZoom: 100 }) },
  toggleTooltips: { icon: 'info', label: 'settings.showTooltips', checked: () => state.settings.showTooltips, run: () => toggle('showTooltips') },
  toggleAnimation: { icon: 'sparkles', label: 'settings.animateCharts', checked: () => state.settings.animateCharts, run: () => toggle('animateCharts') },
  theme: { icon: 'palette', label: 'action.theme', run: () => updateSettings({ theme: randomThemeId(state.settings.theme) }) },
  themeMenu: { icon: 'palette', label: 'action.themeChoose', run: (context) => openThemePicker(context?.anchor) },
  language: { icon: 'globe', label: 'action.language', key: 'Ctrl+Shift+L', run: () => updateSettings({ language: lang() === 'ko' ? 'en' : 'ko' }) },
  shuffleBackground: { icon: 'dice', label: 'action.shuffleBackground', run: () => shuffleBackground() },
  // Help
  welcome: { icon: 'bulb', label: 'action.welcome', run: () => openWelcome() },
  tutorial: { icon: 'tutorial', label: 'action.tutorial', key: 'F11', run: () => startTutorial() },
  tutorialDoc: { icon: 'tutorialDoc', label: 'action.tutorialDoc', run: () => openDocWindow('tutorial') },
  userGuide: { icon: 'userGuide', label: 'action.userGuide', run: () => openDocWindow('guide') },
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

// ───────────────────────── menus

const SUBMENUS = {
  exportAs: { icon: 'exportChart', items: Object.keys(CHART_FORMATS).map((f) => `export:${f}`) },
  exportData: { icon: 'csvFile', items: Object.keys(DATA_FORMATS).map((f) => `exportData:${f}`) },
  copyAs: { icon: 'copy', items: ['copyImage', 'copySvg', 'copyData', 'copyCells'] },
  columnType: { icon: 'typeNumber', items: ['colType:number', 'colType:text', 'colType:date'] },
  ...Object.fromEntries(CHART_GROUPS.map((g) => [`types:${g.id}`, { icon: g.icon, items: CHART_IDS.filter((id) => chartType(id).group === g.id).map((id) => `type:${id}`) }])),
  legend: { icon: 'legendIcon', items: ['legend:top', 'legend:bottom', 'legend:left', 'legend:right', 'legend:none'] },
  chartThemes: { icon: 'chartTheme', items: CHART_THEMES.map((c) => `chartTheme:${c.id}`) },
  palettes: { icon: 'palette', items: [...PALETTES.slice(0, 12).map((p) => `palette:${p.id}`), '-', 'paletteMenu'] },
  chartBackground: { icon: 'fillColor', items: ['bg:theme', 'bg:chart', 'bg:white', 'bg:transparent'] },
  panels: { icon: 'panelLeft', items: ['leftPanel', 'rightPanel', 'bottomPanel', 'statusBar', '-', 'layout:grid-bottom', 'layout:grid-right', 'layout:chart-only'] },
  zoom: { icon: 'zoomIn', items: ['zoomIn', 'zoomOut', 'zoomFit', 'zoom100'] },
  appearance: { icon: 'palette', items: ['theme', 'themeMenu', 'language', '-', 'shuffleBackground'] },
};
const sub = (key) => ({ sub: key });
const MENUS = {
  file: ['newChart', 'newBlank', 'open', 'recent', sub('sampleList'), '-', 'closeTab', 'closeAll', '-', 'save', 'saveAs', '-', 'exportChart', sub('exportAs'), sub('exportData'), '-', 'print', '-', 'startPage', 'exit'],
  edit: ['undo', 'redo', '-', sub('copyAs'), 'pasteCells', 'clearCells', '-', 'duplicateChart', '-', 'settings'],
  view: [sub('panels'), sub('zoom'), '-', 'toggleTooltips', 'toggleAnimation', '-', sub('appearance')],
  data: ['importData', 'replaceData', 'pasteData', '-', 'addRow', 'addColumn', 'deleteRows', 'deleteColumns', 'renameColumn', sub('columnType'), '-', 'sortAsc', 'sortDesc', 'transpose', '-', 'dataStats', sub('exportData')],
  chart: [...CHART_GROUPS.map((g) => sub(`types:${g.id}`)), 'prevType', 'nextType', '-', 'editTitle', 'toggleLabels', sub('legend'), 'toggleGrid', 'toggleTrend', '-', sub('chartThemes'), sub('palettes'), sub('chartBackground'), 'resetStyle', '-', 'showInspector'],
  help: ['welcome', 'tutorial', 'tutorialDoc', 'userGuide', 'shortcuts', '-', 'settings', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', view: 'eye', data: 'dataGrid', chart: 'chartColumn', help: 'question' };

const TOOLBAR = [
  ['newChart', 'open', 'save', 'closeTab', 'print'],
  ['undo', 'redo'],
  ['importData', 'pasteData', 'exportChart', 'copyImage'],
  ['addRow', 'addColumn', 'sortAsc', 'sortDesc', 'transpose', 'dataStats'],
  ['prevType', 'nextType', 'toggleLabels', 'cycleLegend', 'paletteMenu'],
  ['zoomOut', 'zoomValue', 'zoomIn', 'zoomFit'],
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
  const brand = `<div class="app-brand" data-window-drag title="${escapeHtml(`MyChartMaster v${VERSION}`)}"><img class="app-brand-icon" src="${APP_ICON}" alt="" data-window-drag /><span class="app-brand-name" data-window-drag>MyChartMaster</span><span class="app-brand-version" data-window-drag>v${escapeHtml(VERSION)}</span></div>`;
  const project = `<span class="app-brand-project" data-window-drag><span class="app-brand-project-name" data-window-drag></span><span class="app-brand-dirty" data-window-drag>●</span></span>`;
  const button = (id, glyph, key) => `<button class="window-button ${id === 'close' ? 'close' : ''}" data-window="${id}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(glyph)}</button>`;
  const onChart = !state.showStart && Boolean(activeDoc());
  const panelButton = (command) => `<button class="window-button panel-toggle ${commands[command].checked() ? 'active' : ''}" data-command="${command}" title="${escapeHtml(commandTip(command))}" aria-label="${escapeHtml(t(commands[command].label))}" aria-pressed="${commands[command].checked()}" ${onChart ? '' : 'disabled'}>${icon(commands[command].icon)}</button>`;
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
    if (!maximized) native.applyPendingMinimumSize().catch(() => {});
  };
  await update();
  appWindow.onResized(() => update()).catch(() => {});
  const mark = (key) => { try { globalThis.localStorage?.setItem(key, String(Date.now())); } catch { /* private mode */ } };
  for (const type of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(type, () => mark('mychartmaster.main.input'), { capture: true, passive: true });
  window.addEventListener('focus', () => mark('mychartmaster.main.focus'));
}

const zoomLabel = () => (state.settings.textZoom ? `${state.settings.textZoom}%` : t('zoom.fit'));

function renderToolbar() {
  const toolbar = root.querySelector('#toolbar');
  const plain = (id, extra = '') => {
    const command = commands[id];
    const glyph = id === 'language' ? switchFlag(getLanguage()) : icon(command.icon);
    return `<button class="tool-button ${extra}" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(command.label))}">${glyph}</button>`;
  };
  const button = (id) => {
    if (id === 'zoomValue') return `<button class="tool-button tool-value" data-command="zoomFit" data-zoom-value title="${escapeHtml(commandTip('zoomFit'))}" aria-label="${escapeHtml(t('action.zoomFit'))}">${escapeHtml(zoomLabel())}</button>`;
    if (id === 'themeSplit') return `<span class="split-button">${plain('theme')}<button class="tool-button split-arrow" data-command="themeMenu" title="${escapeHtml(commandTip('themeMenu'))}" aria-label="${escapeHtml(t('action.themeChoose'))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
    // The two commands everybody looks for by name: a new chart, and export.
    if (id === 'newChart' || id === 'exportChart') return `<button class="tool-button tool-labeled ${id === 'newChart' ? 'tool-new' : 'tool-export'}" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(commands[id].label))}">${icon(commands[id].icon)}<span>${escapeHtml(t(id === 'newChart' ? 'action.newChartShort' : 'action.exportShort'))}</span></button>`;
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
  for (const element of root.querySelectorAll('#toolbar [data-command], .ch-grid-tools [data-command], .ch-stage-bar [data-command]')) {
    const id = element.dataset.command;
    element.disabled = !commandEnabled(id);
    element.title = commandTip(id);
    const checked = commands[id]?.checked?.();
    element.classList.toggle('active', Boolean(checked));
    if (checked !== undefined) element.setAttribute('aria-pressed', String(Boolean(checked)));
  }
  const zoomValue = root.querySelector('#toolbar [data-zoom-value]');
  if (zoomValue) { zoomValue.textContent = zoomLabel(); zoomValue.disabled = !hasDoc(); }
}

/** The window can never be so narrow that toolbar buttons or menus are hidden. */
function updateMinimumWidth() {
  const left = root.querySelector('.toolbar-left');
  const right = root.querySelector('.toolbar-right');
  if (!left || !right) return;
  requestAnimationFrame(() => {
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
    const width = Math.ceil(Math.max(menus, tools, 900) + 4);
    if (Math.abs(width - state.minWidth) < 1) return;
    state.minWidth = width;
    document.documentElement.style.setProperty('--min-width', `${width}px`);
    native.setMinimumSize(width, 640).catch(() => {});
  });
}

// ───────────────────────── tabs (one per chart)

function renderTabs() {
  renderTitleProject();
  const tabs = root.querySelector('#tabs');
  if (!tabs) return;
  tabs.hidden = !state.docs.length || state.showStart;
  tabs.innerHTML = `<div class="tab-strip"><div class="tab-list" role="tablist">${state.docs.map((doc) => `
    <div class="tab ${doc.id === state.active ? 'active' : ''} ${doc.dirty ? 'dirty' : ''}" data-tab="${doc.id}" role="tab" aria-selected="${doc.id === state.active}" title="${escapeHtml(doc.path ?? doc.name)}">
      ${icon(chartType(doc.chart.type).icon)}<span class="tab-name">${escapeHtml(doc.name)}</span><span class="tab-dirty">●</span>
      <button class="tab-close" data-tab-close="${doc.id}" title="${escapeHtml(t('action.closeTab'))}" aria-label="${escapeHtml(t('action.closeTab'))}">${icon('close')}</button>
    </div>`).join('')}</div></div>
    <button class="tab-add" data-command="newChart" title="${escapeHtml(commandTip('newChart'))}" aria-label="${escapeHtml(t('action.newChart'))}">${icon('plus')}</button>`;
}

function cycleTab(direction) {
  if (state.docs.length < 2) return;
  const index = state.docs.findIndex((doc) => doc.id === state.active);
  activate(state.docs[(index + direction + state.docs.length) % state.docs.length].id);
}

// ───────────────────────── status bar

function renderStatus() {
  const bar = root.querySelector('#statusbar');
  if (!bar) return;
  const doc = state.showStart ? null : activeDoc();
  const s = state.settings;
  const notice = state.notice;
  const items = [];
  items.push(`<span class="status-notice ${notice?.kind ?? ''}" title="${escapeHtml(notice?.text ?? t('status.ready'))}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(notice?.text ?? t('status.ready'))}</span></span>`);
  if (doc) {
    const type = chartType(doc.chart.type);
    items.push(`<button class="status-item" data-command="showInspector" title="${escapeHtml(t('status.typeTip'))}">${icon(type.icon)}<span>${escapeHtml(type[lang()])}</span></button>`);
    items.push(`<span class="status-item" title="${escapeHtml(t('status.dataTip'))}">${icon('dataGrid')}<span>${escapeHtml(t('status.data', { rows: doc.table.rows.length, cols: doc.table.columns.length }))}</span></span>`);
    items.push(`<span class="status-item" title="${escapeHtml(t('inspector.size'))}">${icon('chartSize')}<span>${doc.chart.options.width} × ${doc.chart.options.height}</span></span>`);
    items.push(`<button class="status-item" data-command="zoomFit" title="${escapeHtml(t('status.zoomTip'))}">${icon('zoomIn')}<span>${escapeHtml(zoomLabel())}</span></button>`);
    if (doc.dirty) items.push(`<span class="status-item" title="${escapeHtml(t('status.modified'))}">${icon('edit')}<span>${escapeHtml(t('status.modified'))}</span></span>`);
  }
  items.push(`<button class="status-item" data-command="themeMenu" title="${escapeHtml(t('status.theme', { name: themeName(s.theme, getLanguage()) }))}">${icon('palette')}<span>${escapeHtml(themeName(s.theme, getLanguage()))}</span></button>`);
  items.push(`<button class="status-item" data-command="language" title="${escapeHtml(t('action.language'))}">${icon('globe')}<span>${escapeHtml(t('status.language'))}</span></button>`);
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
  renderToolbarState();
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
    case 'new-chart': return newChart(value);
    case 'new-blank': return newChart('column', { blank: true });
    case 'import': return importWithDialog();
    case 'paste': return pasteData();
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

function sampleItems() {
  const items = SAMPLES.map((s) => ({ id: `custom:sample:${s.id}`, label: s[lang()]?.[0] ?? s.id, icon: sampleIcon(s) }));
  const handlers = Object.fromEntries(SAMPLES.map((s) => [`custom:sample:${s.id}`, () => openSample(s.id)]));
  return { items, handlers, header: { icon: 'samples', title: t('submenu.sampleList') } };
}

function sampleMenu(anchor) {
  const { items, handlers } = sampleItems();
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
  const next = (startBackground ?? appBackground)?.shuffle() ?? 'bars';
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
  const dirty = state.docs.filter((doc) => doc.dirty && !doc.tourSample);
  if (!dirty.length) return true;
  const choice = await ask({
    kind: 'exit', icon: 'save', title: t('confirm.exitTitle'), message: t('confirm.exitMessage'), items: dirty.map((doc) => doc.name),
    buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }],
  });
  if (choice === 'save') { for (const doc of dirty) if (!(await saveDoc(doc))) return false; return true; }
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

function menuItems(ids) {
  return ids.map((id) => (id === '-' ? { separator: true } : typeof id === 'object' ? {
    id: `submenu:${id.sub}`, label: t(`submenu.${id.sub}`), icon: SUBMENUS[id.sub]?.icon ?? (id.sub === 'sampleList' ? 'samples' : 'menu'), submenu: true,
    disabled: SUBMENUS[id.sub] ? !SUBMENUS[id.sub].items.some((item) => item !== '-' && commandEnabled(item)) : false,
  } : {
    id, label: t(commands[id].label), icon: commands[id].icon, shortcut: commands[id].key ? keyLabel(commands[id].key) : '', disabled: !commandEnabled(id), checked: commands[id].checked?.(),
  }));
}

function withChildren(items, handlers, depth = 0) {
  return items.map((item) => {
    if (!item.submenu || item.children || depth > 3) return item;
    const key = item.id.slice('submenu:'.length);
    const dynamic = key === 'sampleList' ? sampleItems() : null;
    if (dynamic) Object.assign(handlers, dynamic.handlers);
    const children = dynamic ? dynamic.items : SUBMENUS[key] ? menuItems(SUBMENUS[key].items) : null;
    return children ? { ...item, children: withChildren(children, handlers, depth + 1) } : item;
  });
}

async function showMenu(items, anchor, name = 'context', context = {}) {
  state.openMenu = name;
  renderMenubar();
  const header = context.header ?? (MENUS[name] ? { icon: MENU_ICONS[name], title: t(`menu.${name}`) } : { icon: 'chartColumn', title: 'MyChartMaster' });
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
    if (key === 'sampleList') { const dynamic = sampleItems(); return showMenu(dynamic.items, where, name, { ...context, handlers: { ...context.handlers, ...dynamic.handlers }, header: dynamic.header }); }
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
  const doc = activeDoc();
  if (kind === 'chart') {
    const items = [...menuItems(['editTitle', 'toggleLabels', sub('legend'), 'toggleGrid', 'toggleTrend', '-', sub('chartThemes'), sub('palettes'), sub('chartBackground'), 'resetStyle', '-', 'copyImage', 'copySvg', 'exportChart', sub('exportAs'), 'print', '-', 'prevType', 'nextType'])];
    if (payload.series != null && doc) items.unshift({ id: 'custom:hide', label: t('context.hideSeries'), icon: 'deselect' }, { id: 'custom:series', label: t('context.seriesColor'), icon: 'fillColor' }, { separator: true });
    const handlers = {
      'custom:hide': () => { const hidden = new Set(doc.chart.options.hidden.map(Number)); hidden.add(payload.series); setOption('hidden', [...hidden]); },
      'custom:series': () => { setInspectorTab('series'); if (!state.settings.showRightPanel) updateSettings({ showRightPanel: true }); },
    };
    return showMenu(items, anchor, 'context', { handlers, header: { icon: chartType(doc?.chart.type).icon, title: doc?.chart.title || chartName(doc?.chart.type, lang()) } });
  }
  if (kind === 'grid') {
    const c = payload.col;
    const name = doc?.table.columns[c]?.name ?? '';
    const roleItems = doc ? [
      { id: 'custom:asCategory', label: t('context.useAsCategory', { name }), icon: 'typeText' },
      { id: 'custom:asSeries', label: t(doc.chart.mapping.values?.includes(c) ? 'context.removeSeries' : 'context.addSeries', { name }), icon: 'seriesIcon', disabled: doc.table.columns[c]?.type !== 'number' },
      { separator: true },
    ] : [];
    const handlers = {
      'custom:asCategory': () => setMapping({ category: c }),
      'custom:asSeries': () => { const values = new Set(doc.chart.mapping.values ?? []); if (values.has(c)) values.delete(c); else values.add(c); setMapping({ values: [...values].sort((a, b) => a - b) }); },
    };
    return showMenu([...roleItems, ...menuItems(['copyCells', 'pasteCells', 'clearCells', '-', 'addRow', 'addColumn', 'deleteRows', 'deleteColumns', '-', 'renameColumn', sub('columnType'), 'sortAsc', 'sortDesc', '-', 'transpose', 'dataStats'])], anchor, 'context', { handlers, header: { icon: 'dataGrid', title: payload.header ? name : `${columnLetter(c ?? 0)}${(payload.row ?? 0) + 1}` } });
  }
  if (kind === 'type') {
    const type = chartType(payload.id);
    const handlers = { 'custom:use': () => setChartType(type.id), 'custom:new': () => newChart(type.id) };
    return showMenu([{ id: 'custom:use', label: t('context.useType'), icon: type.icon, disabled: !doc }, { id: 'custom:new', label: t('context.newOfType'), icon: 'newChart' }], anchor, 'context', { handlers, header: { icon: type.icon, title: type[lang()] } });
  }
  if (kind === 'tab') {
    const target = state.docs.find((d) => d.id === payload.id);
    if (target && target !== activeDoc()) activate(target.id);
    const handlers = { 'custom:close': () => closeDoc(target), 'custom:others': async () => { for (const d of state.docs.filter((x) => x !== target)) if (!(await closeDoc(d))) return; } };
    return showMenu([{ id: 'custom:close', label: t('action.closeTab'), icon: 'closeTab' }, { id: 'custom:others', label: t('tabs.closeOthers'), icon: 'closeAll', disabled: state.docs.length < 2 }, { separator: true }, ...menuItems(['save', 'saveAs', 'duplicateChart', 'exportChart', 'print'])], anchor, 'context', { handlers, header: { icon: 'fileChart', title: target?.name ?? '' } });
  }
  if (kind === 'start-sample') {
    const sample = SAMPLES.find((s) => s.id === payload.id);
    if (!sample) return undefined;
    const handlers = { 'custom:open': () => openSample(sample.id), 'custom:copyName': () => copyText(`${sample.id}.mychart`, t('context.fileName')) };
    return showMenu([
      { id: 'custom:open', label: t('context.openSample'), icon: 'folderOpen' },
      { id: 'custom:copyName', label: t('context.copyFileName'), icon: 'copy' },
      { separator: true },
      ...menuItems(['open', sub('sampleList')]),
    ], anchor, 'context', { handlers, header: { icon: sample.icon, title: sample[lang()]?.[0] ?? sample.id } });
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
      ...menuItems(['newChart', 'open', 'importData', 'pasteData']),
      { separator: true },
      { id: 'custom:arrange', label: t('start.arrange'), icon: 'launcher' },
      { id: 'custom:shuffle', label: t('context.shuffleBackground'), icon: 'sparkles' },
      { id: 'custom:theme', label: t('start.themeSettings'), icon: 'palette' },
      { id: 'custom:startSettings', label: t('start.settings'), icon: 'gear' },
      { separator: true },
      ...menuItems(['tutorial', 'about']),
    ], anchor, 'context', { handlers, header: { icon: 'home', title: t('menu.home') } });
  }
  return undefined;
}

// ───────────────────────── document windows (user's guide, tutorial document)

async function openDocWindow(kind) {
  const info = DOC_KINDS[kind];
  if (!info) return undefined;
  popups.hideMenu();
  const url = `${location.pathname}?viewer=${kind}&lang=${getLanguage() === 'en' ? 'en' : 'ko'}`;
  if (popups.inline || !desktop) {
    const opened = globalThis.open(url, `mychartmaster-${docLabel(kind)}`);
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

// ───────────────────────── drag & drop of files

async function handleDroppedPaths(paths) {
  for (const path of paths) {
    const ext = (/\.([^.\\/]+)$/.exec(path)?.[1] ?? '').toLowerCase();
    if (IMPORT_EXTENSIONS.includes(ext)) await openPath(path);
    else notify('error', t('notice.unsupportedDrop', { name: baseName(path) }));
  }
}

async function handleDroppedFiles(files) {
  for (const file of files) {
    try {
      await openBytes(file.name, new Uint8Array(await file.arrayBuffer()));
    } catch (error) {
      showError('error.drop', error, file.name);
    }
  }
}

function setDropActive(active) {
  const overlay = root.querySelector('.drop-overlay');
  overlay.classList.toggle('visible', active);
  overlay.querySelector('span').textContent = t('drop.hint');
}

// ───────────────────────── the chart view's link to the app

/** The role a column plays in the active chart (the grid's header badge). */
function roleOf(c) {
  const doc = activeDoc();
  if (!doc) return null;
  const m = doc.chart.mapping;
  const k = (m.values ?? []).indexOf(c);
  if (k >= 0) return { label: t('role.series', { n: k + 1 }), short: `Y${(m.values?.length ?? 0) > 1 ? k + 1 : ''}`, color: renderColor(doc, k) };
  for (const role of ['category', 'x', 'y', 'size', 'label', 'group', 'open', 'high', 'low', 'close', 'source', 'target']) {
    if (m[role] === c) return { label: t(`role.${role}`), short: { category: 'X', x: 'X', y: 'Y', size: 'S', label: 'L', group: 'G', open: 'O', high: 'H', low: 'L', close: 'C', source: '→', target: '⇥' }[role], color: null };
  }
  return null;
}

const renderColor = (doc, k) => {
  const own = doc.chart.options.colors?.[k];
  if (own) return own;
  const colors = palette(doc.chart.options.palette).colors;
  return colors[k % colors.length];
};

const viewApi = {
  t,
  language: () => lang(),
  settings: () => state.settings,
  updateSettings: (patch, o) => updateSettings(patch, o),
  doc: () => activeDoc(),
  theme: () => themeColors(),
  tip: (id) => commandTip(id),
  enabled: (id) => commandEnabled(id),
  onFold: (which) => togglePanel(which),
  onType: (id) => setChartType(id),
  onLegend: (i) => { const doc = activeDoc(); const hidden = new Set((doc.chart.options.hidden ?? []).map(Number)); if (hidden.has(i)) hidden.delete(i); else hidden.add(i); setOption('hidden', [...hidden]); },
  onMark: (mark) => {
    const doc = activeDoc();
    if (!doc) return;
    doc.selection.series = mark?.series ?? null;
    if (mark?.row != null) state.view?.grid.setActive(mark.row, doc.chart.mapping.values?.[mark.series ?? 0] ?? 0);
    state.view?.drawChart();
  },
  onEditText: (which) => editText(which),
  onZoom: (direction) => zoom(direction),
  onContext: (event, kind, payload) => contextMenu(event, kind, payload),
  gridFilter: () => activeDoc()?.gridFilter ?? '',
  onGridFilter: (text) => { const doc = activeDoc(); if (!doc) return; doc.gridFilter = text; state.view?.grid.refresh(); },
  onLayoutChanged: () => { state.view?.fit(); state.view?.grid.drawRows(true); },
  grid: {
    t,
    doc: () => activeDoc(),
    settings: () => state.settings,
    rows: () => { const doc = activeDoc(); return doc ? matchingRows(doc.table, doc.gridFilter) : []; },
    roleOf,
    onEdit: (r, c, text) => { const doc = activeDoc(); if (doc) changeTable(setCell(doc.table, r, c, text)); },
    onRename: (c, name) => { const doc = activeDoc(); if (doc) changeTable(renameColumn(doc.table, c, name)); },
    onPaste: (r, c, text) => pasteBlock(r, c, text),
    onClear: (sel) => clearCells(sel),
    onSelect: (cell) => { const doc = activeDoc(); if (doc) { doc.selection.row = cell.row; doc.selection.col = cell.col; } renderToolbarState(); },
    onContext: (event, info) => contextMenu(event, 'grid', info),
    onAction: (id) => run(id),
  },
  inspector: {
    t,
    language: () => lang(),
    doc: () => activeDoc(),
    tab: () => state.inspectorTab,
    onTab: (id) => setInspectorTab(id),
    onType: (id) => setChartType(id),
    onOption: (key, value, merge, live) => setOption(key, value, merge, live),
    onChart: (patch, merge) => { const doc = activeDoc(); if (!doc) return; doc.setChart(patch, { merge }); refreshView({ inspector: !merge }); },
    onMapping: (patch) => setMapping(patch),
    onRename: (c, name) => { const doc = activeDoc(); if (doc && name.trim()) changeTable(renameColumn(doc.table, c, name.trim())); },
    onPalette: (element) => openPalette(element),
    onChartTheme: (id) => setChartTheme(id),
  },
};

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
    if (target.closest('[data-home]')) return showStartPage(!state.showStart || !activeDoc());
    const start = target.closest('[data-start]');
    if (start && !start.disabled) return onStartAction(start);
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
      return run(id, { anchor, element: command });
    }
    return undefined;
  });
  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches('[data-start-toggle]')) updateSettings({ showStartPage: target.checked }, { quiet: true });
    if (target.matches('[data-start-interval]')) updateSettings({ animationInterval: Number(target.value) }, { quiet: true });
    if (target.matches('[data-start-random]')) updateSettings({ animationRandom: target.checked }, { quiet: true });
  });
  root.addEventListener('dblclick', (event) => {
    if (event.target.closest('[data-window-drag]') && desktop) appWindow.toggleMaximize().catch(() => {});
  });
  root.addEventListener('contextmenu', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) { event.preventDefault(); contextMenu(event, 'tab', { id: tab.dataset.tab }); return; }
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
  if (!desktop) {
    window.addEventListener('dragover', (event) => { event.preventDefault(); setDropActive(true); });
    window.addEventListener('dragleave', (event) => { if (!event.relatedTarget) setDropActive(false); });
    window.addEventListener('drop', (event) => { event.preventDefault(); setDropActive(false); handleDroppedFiles([...(event.dataTransfer?.files ?? [])]); });
  }
  window.addEventListener('resize', () => updateMinimumWidth());
  setInterval(() => { const clock = root.querySelector('#status-clock'); if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 15000);
}

const SHORTCUTS = [
  ['n', false, false, 'newChart'], ['o', false, false, 'open'], ['s', false, false, 'save'], ['s', true, false, 'saveAs'], ['w', false, false, 'closeTab'], ['p', false, false, 'print'], ['q', false, false, 'exit'],
  ['i', false, false, 'importData'], ['e', false, false, 'exportChart'], ['c', true, false, 'copyImage'], ['z', false, false, 'undo'], ['y', false, false, 'redo'], ['z', true, false, 'redo'],
  ['v', true, false, 'pasteData'], ['enter', false, false, 'addRow'], ['enter', true, false, 'addColumn'], ['t', true, false, 'transpose'], ['i', true, false, 'dataStats'],
  ['l', false, false, 'toggleLabels'], ['g', true, false, 'cycleLegend'], ['k', false, false, 'paletteMenu'], ['[', false, false, 'prevType'], [']', false, false, 'nextType'],
  ['=', false, false, 'zoomIn'], ['+', false, false, 'zoomIn'], ['-', false, false, 'zoomOut'], ['0', false, false, 'zoomFit'],
  ['l', true, false, 'language'], ['h', true, false, 'startPage'], ['p', true, false, 'settings'], ['j', false, false, 'bottomPanel'], ['1', true, false, 'leftPanel'], ['!', true, false, 'leftPanel'], ['2', true, false, 'rightPanel'], ['@', true, false, 'rightPanel'],
];

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  if (tutorial?.active && key === 'escape') { event.preventDefault(); tutorial.stop(); return; }
  const editing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = event.ctrlKey || event.metaKey;
  if (mod) {
    if (editing && ['x', 'c', 'v', 'z', 'y', 'a', 'arrowleft', 'arrowright', 'home', 'end', 'enter'].includes(key) && !event.altKey) return;
    if (key === 'tab') { event.preventDefault(); cycleTab(event.shiftKey ? -1 : 1); return; }
    const shortcut = SHORTCUTS.find(([k, shift, alt]) => k === key && shift === event.shiftKey && alt === event.altKey);
    if (shortcut) { event.preventDefault(); event.stopPropagation(); run(shortcut[3]); }
    return;
  }
  if (key === 'f1') { event.preventDefault(); run('about'); return; }
  if (key === 'f11') { event.preventDefault(); run('tutorial'); }
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
  popups.on('copy-text', (data) => copyText(String(data.text ?? ''), data.what));
  popups.on('copy-image', (data) => copyImage(data));
  popups.on('printed', (data) => notify('success', t('notice.printed', { sheets: data.sheets ?? 0 })));
  popups.on('chart-preview', (data, kind) => {
    const doc = activeDoc();
    if (!doc) return;
    const background = data.background && data.background !== 'chart' ? data.background : null;
    popups.post(kind, { type: 'chart-preview', svg: chartSvg(doc, { width: data.width, height: data.height, background, language: lang(), theme: themeColors() }) });
  });
  popups.on('import-preview', async (data, kind) => {
    const pending = state.pendingImport;
    if (!pending) return;
    try {
      const out = await importData(pending.bytes, pending.name, importOptions({ header: data.header, delimiter: data.delimiter, encoding: data.encoding, decimal: data.decimal, sheet: data.sheet }));
      popups.post(kind, { type: 'import-preview', format: out.format, sheets: out.sheets ?? [], sheet: out.sheet ?? 0, total: out.table.rows.length, table: { columns: out.table.columns, rows: out.table.rows.slice(0, 200) } });
    } catch (error) {
      const { message } = formatError(error);
      popups.post(kind, { type: 'import-preview', error: message, format: detectFormat(pending.name, pending.bytes) });
    }
  });
  popups.on('print-request', (data, kind) => {
    const doc = activeDoc();
    if (!doc) return;
    const o = doc.chart.options;
    popups.post(kind, { type: 'print-data', title: doc.chart.title || chartName(doc.chart.type, lang()), width: o.width, height: o.height, svg: chartSvg(doc, { language: lang(), theme: themeColors(), background: o.background === 'transparent' || o.background === 'theme' ? 'white' : null }), table: chartDataTable(doc) });
  });
  popups.on('stats-request', (data, kind) => {
    const doc = activeDoc();
    if (!doc) return;
    const columns = doc.table.columns.map((c, i) => ({ name: c.name, type: c.type, ...columnStats(doc.table, i) }));
    popups.post(kind, { type: 'stats-data', rows: doc.table.rows.length, columns });
  });
}

// ───────────────────────── tutorial

let tutorial = null;

async function startTutorial(options = {}) {
  tutorial ??= new Tutorial(appApi, root.querySelector('#tutorial-layer'));
  updateSettings({ tutorialOffered: true }, { quiet: true });
  await tutorial.start(options);
}

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
  newChart,
  importText,
  setChartType,
  setInspectorTab,
  setOption,
  refreshView: () => refreshView(),
  openMenubarMenu,
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
  document.title = `MyChartMaster v${state.info?.version ?? VERSION}`;
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
      const error = new Error(fatal.message);
      error.stack = [`${t('error.location')}: ${fatal.location}`, `${t('error.thread')}: ${fatal.thread}`, '', fatal.backtrace].join('\n');
      showError('error.fatal', error, fatal.location);
    });
  }
  await restoreSession();
  trackMaximized();
  for (const path of await native.startupFiles().catch(() => [])) await openPath(path);
  // ?sample=<id> opens a sample, ?new=<type> a new chart (tests, links in the docs).
  const params = new URLSearchParams(location.search);
  if (params.get('sample')) openSample(params.get('sample'));
  if (params.get('new')) newChart(params.get('new'));
  state.showStart = !state.docs.length;
  if (!state.active && state.docs.length) activate(state.docs[0].id);
  else renderAll();
  if (desktop) {
    await appWindow.show();
    await appWindow.setFocus();
    setTimeout(() => popups.prewarm('menu'), 400);
  }
  if (state.settings.showWelcome && !globalThis.__MYCHARTMASTER_NO_WELCOME && !params.has('nowelcome')) setTimeout(() => openWelcome({ auto: true }), 600);
}

// Test hook: the E2E suites drive the app through this (no effect on normal use).
window.__mychartmaster = {
  state,
  t,
  commands,
  popups,
  run,
  menus: { MENUS, SUBMENUS, TOOLBAR, TOOLBAR_RIGHT, SHORTCUTS, enabled: (id) => commandEnabled(id) },
  api: appApi,
  view: () => state.view,
  doc: () => activeDoc(),
  actions: {
    openPath, openBytes, openSample, newChart, saveDoc, closeDoc, startImport, importText, pasteBlock, exportChartAs, exportDataAs, copyImage, setChartType, setOption, setMapping,
    updateSettings, showStartPage, showError, undo, redo, contextMenu, openMenubarMenu, startTutorial, toScreen, renderChart,
  },
  domain: { SAMPLES, CHART_IDS, tutorialSteps: () => TUTORIAL_STEPS.length },
  tutorial: () => tutorial,
  isMac,
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => {
    if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {});
  });
