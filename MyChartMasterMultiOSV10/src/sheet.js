// The data window: the active chart's table as a spreadsheet in a window of its own, much like Excel.
//
// Desktop: an OS window "doc-sheet" (lib.rs open_doc_window) with its own taskbar button. Web: a browser window
// at index.html?viewer=sheet&ch=<channel>. The main window owns the data: it sends the active chart's table
// and sheet extras ({ type: 'doc' }), and this window sends every change back ({ type: 'edit' }), so the chart
// redraws at once and undo / redo stay one history (Ctrl+Z here undoes in the chart). Messages go through Tauri
// events ("sheet-to-window" / "sheet-to-main") on the desktop and a BroadcastChannel on the web.
//
// The sheet: row 1 holds the column names, the data starts at row 2. Formulas (=SUM(B2:B9) …, domain/data/
// formula.js), number formats, bold / italic / colours / alignment, column widths, fill handle, sort, filter,
// find & replace, copy & paste with Excel (tab-separated text, formulas kept inside the program), open and save
// (Excel, CSV, TSV, JSON, Markdown, HTML, .mychart), and printing through the program's print window.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { loadSettings, STORAGE_KEY } from './domain/settings.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { applyFont, applyTheme, resolveTheme } from './themes.js';
import { cellText, columnLetter } from './domain/data/table.js';
import { detectFormat, decodeText, importData, IMPORT_EXTENSIONS, splitDelimited } from './domain/data/importers.js';
import { exportData, toXlsx } from './domain/data/exporters.js';
import { addressOf, formatValue, formulaRanges, FUNCTION_NAMES, isFormula, parseRange, rangeAddress } from './domain/data/formula.js';
import {
  blockText, boxStats, cellKey, clearBox, cloneSheet, copyBlock, deleteCells, emptySheet, fillBox, findCells, formatBox, inputText,
  insertCells, jumpEdge, normalizeSheet, pasteBlock, replaceIn, setInput, sheetCells, sortBox, tableFromCells, textBlock, usedSize,
} from './domain/data/sheet.js';
import { escapeHtml, keyLabel } from './ui/dom.js';
import { formatCode, FORMAT_PRESETS } from './domain/data/numfmt.js';
import './sheet.css';

const params = new URLSearchParams(location.search);
const desktop = native.isDesktop() && !params.has('viewer');
const appWindow = desktop ? getCurrentWindow() : null;
const channel = params.get('ch') ?? '';
const root = document.querySelector('#app');
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const MAC = /Mac/i.test(globalThis.navigator?.platform ?? '');

document.documentElement.classList.add('is-viewer', 'is-sheet');

// ───────────────────────── link to the main window

const bc = !desktop && typeof BroadcastChannel === 'function' ? new BroadcastChannel(`mychartmaster-sheet-${channel}`) : null;
function send(message) {
  if (desktop) return native.emitTo('main', 'sheet-to-main', message).catch(() => {});
  bc?.postMessage(message);
  return Promise.resolve();
}

// ───────────────────────── state

let settings = loadSettings(globalThis.localStorage);
const S = {
  connected: false,
  waiting: true,
  docId: null,
  name: '',
  title: '',
  docs: [],
  canUndo: false,
  canRedo: false,
  cells: [[]],
  sheet: emptySheet(),
  autoWidths: {},
  active: { r: 1, c: 0 },
  anchor: { r: 1, c: 0 },
  editing: null,
  clip: null,
  zoom: 1,
  frozen: true,
  gridlines: true,
  formulaBar: true,
  showFormulas: false,
  view: { rows: 200, cols: 26 },
  colX: [0],
  vis: null,
  filter: { on: false, hidden: {} },
  files: {},
  find: { open: false, replace: false, query: '', with: '', matchCase: false, whole: false },
  menu: null,
  mode: 'ready',
};
const sel = () => ({ r0: Math.min(S.anchor.r, S.active.r), r1: Math.max(S.anchor.r, S.active.r), c0: Math.min(S.anchor.c, S.active.c), c1: Math.max(S.anchor.c, S.active.c) });
const lang = () => getLanguage();

function applyLook() {
  setLanguage(settings.language);
  const theme = resolveTheme(settings.theme, prefersDark(), settings.customTheme);
  applyTheme(theme);
  applyFont(settings);
  appWindow?.setTheme(theme.dark ? 'dark' : 'light').catch(() => {});
  setTitle();
}

function setTitle() {
  const title = `${t('sheet.title')}${S.name ? ` — ${S.name}` : ''} — MyChartMaster v${VERSION}`;
  document.title = title;
  appWindow?.setTitle(title).catch(() => {});
}

// ───────────────────────── geometry

const RH = () => Math.round(22 * S.zoom);
const HEAD_W = () => Math.round(50 * S.zoom);
const units = (text) => [...String(text)].reduce((a, ch) => a + (/[ᄀ-ᇿ⺀-鿿가-힯＀-￯]/.test(ch) ? 1.85 : 1), 0);
const baseWidth = (c) => S.sheet?.widths?.[c] ?? S.autoWidths[c] ?? 88;
const widthOf = (c) => Math.round(baseWidth(c) * S.zoom);

function computeAutoWidths() {
  const out = {};
  const cols = Math.max(0, ...S.cells.slice(0, 1).map((r) => r.length), ...S.cells.slice(0, 150).map((r) => r.length));
  for (let c = 0; c < cols; c++) {
    let u = 0;
    for (let r = 0; r < Math.min(S.cells.length, 150); r++) u = Math.max(u, units(display(r, c)));
    out[c] = Math.max(72, Math.min(260, Math.round(26 + 7.4 * u)));
  }
  S.autoWidths = out;
}

function layout() {
  const used = usedSize(S.cells, S.sheet);
  S.view.rows = Math.max(S.view.rows, used.rows + 60, 200);
  S.view.cols = Math.max(S.view.cols, used.cols + 8, 26);
  S.colX = [0];
  for (let c = 0; c < S.view.cols; c++) S.colX.push(S.colX[c] + widthOf(c));
  updateVisible();
}

/** Rows shown (null: all) — the filter hides rows; the header row always shows. */
function updateVisible() {
  const hidden = S.filter.on ? S.filter.hidden : {};
  const cols = Object.keys(hidden).filter((c) => hidden[c]?.length);
  if (!cols.length) { S.vis = null; return; }
  const sets = cols.map((c) => [Number(c), new Set(hidden[c])]);
  S.vis = [];
  for (let r = 0; r < S.view.rows; r++) {
    if (r === 0 || !sets.some(([c, set]) => set.has(display(r, c)))) S.vis.push(r);
  }
}
const rowCount = () => (S.vis ? S.vis.length : S.view.rows);
const rowAt = (p) => (S.vis ? S.vis[Math.max(0, Math.min(S.vis.length - 1, p))] : p);
function posOf(r) {
  if (!S.vis) return r;
  let lo = 0;
  let hi = S.vis.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (S.vis[mid] < r) lo = mid + 1; else hi = mid; }
  return lo;
}
function colAt(x) {
  let lo = 0;
  let hi = S.view.cols - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (S.colX[mid] <= x) lo = mid; else hi = mid - 1; }
  return lo;
}

// ───────────────────────── values

const fmtOf = (r, c) => S.sheet?.formats?.[cellKey(r, c)] ?? null;
const formulaOf = (r, c) => S.sheet?.formulas?.[cellKey(r, c)] ?? null;
function display(r, c) {
  if (S.showFormulas && formulaOf(r, c)) return formulaOf(r, c);
  const v = S.cells[r]?.[c] ?? null;
  const f = fmtOf(r, c);
  if (f?.fmt === 'custom') return formatCode(v, f.code ?? 'General').text;
  return f?.fmt ? formatValue(v, { type: f.fmt, decimals: f.dec, symbol: f.sym }, lang()) : cellText(v);
}

// ───────────────────────── shell

const cmdButton = (id, glyph, extra = '') => `<button type="button" class="sx-tool ${extra}" data-cmd="${id}" title="${escapeHtml(tipOf(id))}" aria-label="${escapeHtml(labelOf(id))}">${icon(glyph)}</button>`;

function renderShell() {
  root.innerHTML = `<div class="sx" role="application" aria-label="${escapeHtml(t('sheet.title'))}">
    <header class="sx-menubar">
      <span class="sx-brand">${icon('sheetWindow')}<b>${escapeHtml(t('sheet.title'))}</b></span>
      <nav class="sx-menus" role="menubar">${Object.keys(MENUS).map((m) => `<button type="button" class="sx-menu-button" data-menu="${m}" role="menuitem" aria-haspopup="true">${icon(MENU_ICONS[m])}<span>${escapeHtml(t(`sheet.menu.${m}`))}</span></button>`).join('')}</nav>
      <span class="grow"></span>
      <span class="sx-link" data-link></span>
      <button type="button" class="sx-dock button" data-cmd="dock" title="${escapeHtml(tipOf('dock'))}">${icon('attachWindow')}<span>${escapeHtml(t('sheet.dock'))}</span></button>
    </header>
    <div class="sx-toolbar" role="toolbar"></div>
    <div class="sx-tabs" role="tablist"></div>
    <div class="sx-fbar">
      <input class="sx-namebox" type="text" spellcheck="false" autocomplete="off" title="${escapeHtml(t('sheet.nameBoxTip'))}" aria-label="${escapeHtml(t('sheet.nameBox'))}" />
      <span class="sx-fbar-buttons">
        <button type="button" class="sx-tool small" data-cmd="cancelEdit" title="${escapeHtml(t('sheet.cancelEdit'))}" aria-label="${escapeHtml(t('sheet.cancelEdit'))}">${icon('close')}</button>
        <button type="button" class="sx-tool small" data-cmd="commitEdit" title="${escapeHtml(t('sheet.commitEdit'))}" aria-label="${escapeHtml(t('sheet.commitEdit'))}">${icon('check')}</button>
        <button type="button" class="sx-tool small" data-cmd="insertFunction" title="${escapeHtml(tipOf('insertFunction'))}" aria-label="${escapeHtml(labelOf('insertFunction'))}">${icon('functionIcon')}</button>
      </span>
      <input class="sx-formula" type="text" spellcheck="false" autocomplete="off" aria-label="${escapeHtml(t('sheet.formulaBar'))}" title="${escapeHtml(t('sheet.formulaBarTip'))}" />
    </div>
    <div class="sx-gridwrap">
      <div class="sx-corner" title="${escapeHtml(t('sheet.selectAll'))}"></div>
      <div class="sx-colhead"><div class="sx-colhead-in"></div></div>
      <div class="sx-rowhead"><div class="sx-rowhead-in"></div></div>
      <div class="sx-body">
        <div class="sx-space"></div>
        <div class="sx-layer"></div>
        <div class="sx-overlay"></div>
        <textarea class="sx-editor" spellcheck="false" autocomplete="off" aria-label="${escapeHtml(t('sheet.cellEditor'))}" rows="1"></textarea>
        <div class="sx-ac" hidden role="listbox"></div>
      </div>
      <div class="sx-cover" hidden></div>
    </div>
    <footer class="sx-foot">
      <div class="sx-status"></div>
    </footer>
    <div class="sx-find" hidden></div>
    <div class="sx-pop" hidden></div>
    <div class="sx-modal" hidden></div>
    <div class="sx-toast" aria-live="polite"></div>
  </div>`;
  el = {
    sx: root.querySelector('.sx'),
    toolbar: root.querySelector('.sx-toolbar'),
    link: root.querySelector('[data-link]'),
    namebox: root.querySelector('.sx-namebox'),
    formula: root.querySelector('.sx-formula'),
    fbar: root.querySelector('.sx-fbar'),
    corner: root.querySelector('.sx-corner'),
    colhead: root.querySelector('.sx-colhead-in'),
    rowhead: root.querySelector('.sx-rowhead-in'),
    body: root.querySelector('.sx-body'),
    space: root.querySelector('.sx-space'),
    layer: root.querySelector('.sx-layer'),
    overlay: root.querySelector('.sx-overlay'),
    editor: root.querySelector('.sx-editor'),
    ac: root.querySelector('.sx-ac'),
    cover: root.querySelector('.sx-cover'),
    tabs: root.querySelector('.sx-tabs'),
    status: root.querySelector('.sx-status'),
    find: root.querySelector('.sx-find'),
    pop: root.querySelector('.sx-pop'),
    modal: root.querySelector('.sx-modal'),
    toast: root.querySelector('.sx-toast'),
  };
  renderToolbar();
  bind();
}
let el = null;

const NUMBER_FORMATS = ['general', 'number', 'thousands', 'currency', 'percent', 'scientific', 'date', 'text', 'custom'];
function renderToolbar() {
  const f = fmtOf(S.active.r, S.active.c) ?? {};
  const group = (html) => `<div class="sx-group">${html}</div>`;
  el.toolbar.innerHTML = [
    group(['newSheet', 'openFile', 'saveFile', 'print'].map((id) => cmdButton(id, COMMANDS[id].icon)).join('')),
    group(['undo', 'redo'].map((id) => cmdButton(id, COMMANDS[id].icon)).join('')),
    group(['cut', 'copy', 'paste'].map((id) => cmdButton(id, COMMANDS[id].icon)).join('')),
    group(['bold', 'italic', 'underline'].map((id) => cmdButton(id, COMMANDS[id].icon, f[{ bold: 'b', italic: 'i', underline: 'u', strike: 's' }[id]] ? 'on' : '')).join('')
      + `<label class="sx-tool sx-color" title="${escapeHtml(t('sheet.cmd.textColor'))}">${icon('textColor')}<i style="background:${escapeHtml(f.color ?? 'var(--text)')}"></i><input type="color" data-color="color" value="${escapeHtml(f.color ?? '#c00000')}" aria-label="${escapeHtml(t('sheet.cmd.textColor'))}" /></label>`
      + `<label class="sx-tool sx-color" title="${escapeHtml(t('sheet.cmd.fillColor'))}">${icon('fillColor')}<i style="background:${escapeHtml(f.fill ?? 'transparent')}"></i><input type="color" data-color="fill" value="${escapeHtml(f.fill ?? '#fff2a8')}" aria-label="${escapeHtml(t('sheet.cmd.fillColor'))}" /></label>`),
    group(['alignLeft', 'alignCenter', 'alignRight'].map((id) => cmdButton(id, COMMANDS[id].icon, f.align === { alignLeft: 'left', alignCenter: 'center', alignRight: 'right' }[id] ? 'on' : '')).join('')),
    group(`<select class="sx-select" data-number-format title="${escapeHtml(t('sheet.numberFormat'))}" aria-label="${escapeHtml(t('sheet.numberFormat'))}" data-icon="numberFormat">${NUMBER_FORMATS.map((k) => `<option value="${k}" ${(f.fmt ?? 'general') === k ? 'selected' : ''}>${escapeHtml(t(`sheet.fmt.${k}`))}</option>`).join('')}</select>`
      + ['formatCurrency', 'formatPercent', 'formatThousands', 'decimalMore', 'decimalLess'].map((id) => cmdButton(id, COMMANDS[id].icon)).join('')),
    group(['insertRows', 'deleteRows', 'insertColumns', 'deleteColumns'].map((id) => cmdButton(id, COMMANDS[id].icon)).join('')),
    group(['sortAsc', 'sortDesc', 'filter', 'find'].map((id) => cmdButton(id, COMMANDS[id].icon, id === 'filter' && S.filter.on ? 'on' : '')).join('')),
    group(['autoSum', 'insertFunction'].map((id) => cmdButton(id, COMMANDS[id].icon)).join('')),
    group(`<button type="button" class="sx-tool sx-make-chart" data-cmd="makeChart" title="${escapeHtml(tipOf('makeChart'))}" aria-label="${escapeHtml(labelOf('makeChart'))}">${icon('newChart')}<span>${escapeHtml(t('sheet.makeChartShort'))}</span></button>`),
  ].join('<span class="sx-sep" aria-hidden="true"></span>');
  updateToolbarState();
  keepToolbarWhole();
}

function updateToolbarState() {
  if (!el) return;
  for (const b of el.toolbar.querySelectorAll('[data-cmd]')) b.disabled = !enabled(b.dataset.cmd);
  el.toolbar.classList.toggle('disabled', !S.docId);
}

/** The window is never narrower than its toolbar (no button is ever hidden). */
let minWidthDone = 0;
function keepToolbarWhole() {
  if (!el) return;
  const style = getComputedStyle(el.toolbar);
  // The toolbar does not wrap: its last group's right edge is where its buttons end (also when it is cut off).
  const last = el.toolbar.lastElementChild;
  const toolbar = last ? last.getBoundingClientRect().right - el.toolbar.getBoundingClientRect().left + parseFloat(style.paddingRight) : 0;
  const menubar = [...el.sx.querySelector('.sx-menubar').children].reduce((w, c) => w + (c.classList.contains('sx-link') ? 0 : c.getBoundingClientRect().width), 0) + 60;
  const need = Math.ceil(Math.max(toolbar, menubar) + 2);
  void style;
  if (Math.abs(need - minWidthDone) < 2) return;
  minWidthDone = need;
  // A browser window can be narrower: the page scrolls sideways then (the toolbar is never cut).
  el.sx.style.minWidth = `${Math.max(760, need)}px`;
  if (!desktop) return;
  native.setMinimumSize(Math.max(760, need), 480).catch(() => {});
}

// ───────────────────────── drawing

const ERROR_RE = /^#(NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|CIRC!)$/;
let drawQueued = false;
const queueDraw = () => { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; draw(); }); };

function draw() {
  if (!el) return;
  const body = el.body;
  const rh = RH();
  const st = body.scrollTop;
  const sl = body.scrollLeft;
  const vh = body.clientHeight;
  const vw = body.clientWidth;
  // The sheet grows as it is scrolled towards its end.
  if (!S.vis && (st + vh) / rh > S.view.rows - 30) { S.view.rows += 200; layout(); }
  if (sl + vw > S.colX[S.view.cols] - 300) { S.view.cols += 10; layout(); }
  const n = rowCount();
  el.sx.style.setProperty('--rh', `${rh}px`);
  el.sx.style.setProperty('--head-w', `${HEAD_W()}px`);
  el.sx.style.setProperty('--zoom', S.zoom);
  el.space.style.width = `${S.colX[S.view.cols]}px`;
  el.space.style.height = `${n * rh}px`;
  const p0 = Math.max(0, Math.floor(st / rh));
  const p1 = Math.min(n - 1, Math.ceil((st + vh) / rh));
  const c0 = colAt(sl);
  const c1 = colAt(sl + vw);
  const frozenTop = S.frozen && st > 0;
  const html = [];
  const cell = (r, c, top) => {
    const v = S.cells[r]?.[c] ?? null;
    const f = fmtOf(r, c);
    const formula = formulaOf(r, c);
    const text = display(r, c);
    const num = typeof v === 'number' && !(S.showFormulas && formula);
    const cls = ['sx-cell'];
    if (r === 0) cls.push('head');
    if (num) cls.push('num');
    if (typeof v === 'string' && ERROR_RE.test(v)) cls.push('err');
    if (f?.b) cls.push('b');
    if (f?.i) cls.push('i');
    if (f?.u) cls.push('u');
    if (f?.s) cls.push('s');
    if (f?.align) cls.push(`al-${f.align}`);
    if (formula) cls.push('fx');
    const codeColor = f?.fmt === 'custom' && !f.color ? formatCode(v, f.code ?? 'General').color : null;
    const style = `left:${S.colX[c]}px;top:${top}px;width:${widthOf(c)}px;${f?.color || codeColor ? `color:${f?.color || codeColor};` : ''}${f?.fill ? `background:${f.fill};` : ''}`;
    const filter = r === 0 && S.filter.on && c < usedSize(S.cells, S.sheet).cols ? `<button type="button" class="sx-fbtn ${S.filter.hidden[c]?.length ? 'active' : ''}" data-filter-col="${c}" title="${escapeHtml(t('sheet.filterTip'))}" aria-label="${escapeHtml(t('sheet.filterTip'))}">${icon(S.filter.hidden[c]?.length ? 'filter' : 'caretDown')}</button>` : '';
    return `<div class="${cls.join(' ')}" style="${style}" data-r="${r}" data-c="${c}"${formula ? ` title="${escapeHtml(formula)}"` : ''}><span>${escapeHtml(text)}</span>${filter}</div>`;
  };
  for (let p = p0; p <= p1; p++) {
    const r = rowAt(p);
    if (frozenTop && r === 0) continue;
    for (let c = c0; c <= c1; c++) html.push(cell(r, c, p * rh));
  }
  if (frozenTop) {
    html.push(`<div class="sx-frozen-bg" style="top:${st}px;width:${S.colX[S.view.cols]}px"></div>`);
    for (let c = c0; c <= c1; c++) html.push(cell(0, c, st).replace('class="sx-cell', 'class="sx-cell frozen'));
  }
  el.layer.innerHTML = html.join('');
  el.sx.classList.toggle('no-grid', !S.gridlines);
  el.sx.classList.toggle('no-fbar', !S.formulaBar);
  // Column letters and row numbers follow the scroll.
  const s = sel();
  const fullRows = s.c0 === 0 && s.c1 >= S.view.cols - 1;
  const fullCols = s.r0 === 0 && s.r1 >= S.view.rows - 1;
  const heads = [];
  for (let c = c0; c <= c1; c++) heads.push(`<div class="sx-ch ${c >= s.c0 && c <= s.c1 ? (fullCols ? 'all' : 'on') : ''}" style="left:${S.colX[c]}px;width:${widthOf(c)}px" data-col="${c}">${columnLetter(c)}<i class="sx-resize" data-resize="${c}"></i></div>`);
  el.colhead.innerHTML = heads.join('');
  el.colhead.style.transform = `translateX(${-sl}px)`;
  el.colhead.style.width = `${S.colX[S.view.cols]}px`;
  const rows = [];
  for (let p = p0; p <= p1; p++) {
    const r = rowAt(p);
    if (frozenTop && r === 0) continue;
    rows.push(`<div class="sx-rh ${r >= s.r0 && r <= s.r1 ? (fullRows ? 'all' : 'on') : ''} ${S.vis && r > 0 ? 'filtered' : ''}" style="top:${p * rh}px" data-row="${r}">${r + 1}</div>`);
  }
  if (frozenTop) rows.push(`<div class="sx-rh frozen ${s.r0 === 0 ? 'on' : ''}" style="top:${st}px" data-row="0">1</div>`);
  el.rowhead.innerHTML = rows.join('');
  el.rowhead.style.transform = `translateY(${-st}px)`;
  drawOverlay();
}

function rectOf(box) {
  const rh = RH();
  const st = el.body.scrollTop;
  const top = (r) => (r === 0 && S.frozen && st > 0 ? st : posOf(r) * rh);
  const y0 = top(box.r0);
  const y1 = box.r1 === 0 ? top(0) + rh : posOf(box.r1) * rh + rh;
  const x0 = S.colX[Math.min(box.c0, S.view.cols)] ?? 0;
  const x1 = S.colX[Math.min(box.c1 + 1, S.view.cols)] ?? x0;
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(rh, y1 - y0) };
}

const REF_COLORS = ['#2f6fdf', '#d9480f', '#2b8a3e', '#ae3ec9', '#c2255c', '#0c8599'];
function drawOverlay() {
  const parts = [];
  const box = (b, cls, extra = '') => { const r = rectOf(b); return `<div class="${cls}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;${extra}"></div>`; };
  // References of the formula being typed, each in its colour.
  const text = S.editing ? S.editing.text : null;
  if (text && isFormula(text)) formulaRanges(text, { rows: S.view.rows, cols: S.view.cols }).forEach((b, i) => parts.push(box(b, 'sx-ref', `--ref:${REF_COLORS[i % REF_COLORS.length]}`)));
  if (S.clip?.marquee) parts.push(box(S.clip.marquee, 'sx-marquee'));
  const s = sel();
  if (s.r0 !== s.r1 || s.c0 !== s.c1) parts.push(box(s, 'sx-sel'));
  if (S.fillDrag) parts.push(box(S.fillDrag, 'sx-filltarget'));
  parts.push(box({ r0: S.active.r, r1: S.active.r, c0: S.active.c, c1: S.active.c }, 'sx-active'));
  if (!S.editing) { const r = rectOf(s); parts.push(`<div class="sx-handle" data-fill-handle style="left:${r.x + r.w - 4}px;top:${r.y + r.h - 4}px" title="${escapeHtml(t('sheet.fillHandle'))}"></div>`); }
  el.overlay.innerHTML = parts.join('');
  placeEditor();
}

function placeEditor() {
  const e = S.editing;
  const r = rectOf({ r0: e?.r ?? S.active.r, r1: e?.r ?? S.active.r, c0: e?.c ?? S.active.c, c1: e?.c ?? S.active.c });
  const ed = el.editor;
  ed.style.left = `${r.x}px`;
  ed.style.top = `${r.y}px`;
  ed.style.minWidth = `${r.w}px`;
  ed.style.height = `${e ? Math.max(r.h, Math.min(220, ed.scrollHeight)) : r.h}px`;
  if (e) {
    ed.style.width = `${Math.max(r.w, Math.min(560, 18 + textWidthOf(ed.value)))}px`;
  } else ed.style.width = `${r.w}px`;
  el.sx.classList.toggle('editing', Boolean(e));
}
function textWidthOf(text) {
  const canvas = textWidthOf.canvas ?? (textWidthOf.canvas = document.createElement('canvas'));
  const context = canvas.getContext('2d');
  context.font = getComputedStyle(el.editor).font;
  return Math.max(...String(text).split('\n').map((line) => context.measureText(line).width));
}

function renderFormulaBar() {
  if (!el) return;
  el.namebox.value = S.dragInfo ?? (sel().r0 !== sel().r1 || sel().c0 !== sel().c1 ? `${addressOf(S.active.r, S.active.c)}` : addressOf(S.active.r, S.active.c));
  if (document.activeElement !== el.formula) el.formula.value = S.editing ? S.editing.text : inputText(S.cells, S.sheet, S.active.r, S.active.c);
}

function renderStatus() {
  if (!el) return;
  const s = sel();
  const stats = s.r0 !== s.r1 || s.c0 !== s.c1 ? boxStats(S.cells, s) : null;
  const nf = (x) => (x == null ? '' : Number.isInteger(x) ? x.toLocaleString(lang() === 'en' ? 'en-US' : 'ko-KR') : x.toLocaleString(lang() === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: 6 }));
  const items = stats ? [
    stats.numbers ? `<span title="${escapeHtml(t('sheet.stat.average'))}">${escapeHtml(t('sheet.stat.average'))}: <b>${escapeHtml(nf(stats.average))}</b></span>` : '',
    `<span>${escapeHtml(t('sheet.stat.count'))}: <b>${stats.count}</b></span>`,
    stats.numbers ? `<span>${escapeHtml(t('sheet.stat.sum'))}: <b>${escapeHtml(nf(stats.sum))}</b></span>` : '',
    stats.numbers > 1 ? `<span>${escapeHtml(t('sheet.stat.min'))}: <b>${escapeHtml(nf(stats.min))}</b></span><span>${escapeHtml(t('sheet.stat.max'))}: <b>${escapeHtml(nf(stats.max))}</b></span>` : '',
  ].filter(Boolean).join('') : '';
  const used = usedSize(S.cells, S.sheet);
  el.status.innerHTML = `<span class="sx-mode">${escapeHtml(t(`sheet.mode.${S.mode}`))}</span>
    ${S.vis ? `<span class="sx-filtered">${icon('filter')}${escapeHtml(t('sheet.filtered', { shown: S.vis.filter((r) => r > 0 && r < used.rows).length, total: Math.max(0, used.rows - 1) }))}</span>` : ''}
    <span class="grow"></span><span class="sx-stats">${items}</span>
    <span class="sx-size">${escapeHtml(t('sheet.size', { rows: Math.max(0, used.rows - 1), cols: used.cols }))}</span>
    <span class="sx-zoom">${cmdButton('zoomOut', 'zoomOut', 'small')}<input type="range" min="50" max="200" step="10" value="${Math.round(S.zoom * 100)}" data-zoom aria-label="${escapeHtml(t('sheet.zoom'))}" title="${escapeHtml(t('sheet.zoom'))}" /><button type="button" class="sx-zoom-value" data-cmd="zoom100" title="${escapeHtml(tipOf('zoom100'))}">${Math.round(S.zoom * 100)}%</button>${cmdButton('zoomIn', 'zoomIn', 'small')}</span>`;
}

function renderTabs() {
  if (!el) return;
  const keep = el.tabs.querySelector('.sx-tabs-strip')?.scrollLeft ?? 0;
  el.tabs.innerHTML = `<div class="sx-tabs-strip">${S.docs.map((d) => `<div class="sx-tab ${d.id === S.docId ? 'active' : ''}" data-tab="${escapeHtml(d.id)}" role="tab" aria-selected="${d.id === S.docId}" title="${escapeHtml(t('sheet.tabTip', { name: d.name }))}">${icon('sheetWindow')}<span>${escapeHtml(d.name.replace(/\.mychart$/i, ''))}${d.dirty ? ' •' : ''}</span><button type="button" class="sx-tab-close" data-tab-close="${escapeHtml(d.id)}" title="${escapeHtml(t('sheet.closeTab', { name: d.name }))}" aria-label="${escapeHtml(t('sheet.closeTab', { name: d.name }))}">${icon('close')}</button></div>`).join('')}
    <button type="button" class="sx-tab-add" data-cmd="newSheet" title="${escapeHtml(tipOf('newSheet'))}" aria-label="${escapeHtml(labelOf('newSheet'))}">${icon('plus')}</button></div>
    <span class="sx-tabs-nav">
      <button type="button" class="sx-tabs-scroll" data-tabs-scroll="-1" title="${escapeHtml(t('tabs.left'))}" aria-label="${escapeHtml(t('tabs.left'))}">${icon('chevronLeft')}</button>
      <button type="button" class="sx-tabs-scroll" data-tabs-scroll="1" title="${escapeHtml(t('tabs.right'))}" aria-label="${escapeHtml(t('tabs.right'))}">${icon('chevronRight')}</button>
    </span>`;
  const strip = el.tabs.querySelector('.sx-tabs-strip');
  strip.scrollLeft = keep;
  strip.addEventListener('scroll', updateTabsNav, { passive: true });
  // The active tab is always in view.
  const active = strip.querySelector('.sx-tab.active');
  if (active) {
    if (active.offsetLeft < strip.scrollLeft) strip.scrollLeft = active.offsetLeft;
    else if (active.offsetLeft + active.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = active.offsetLeft + active.offsetWidth - strip.clientWidth;
  }
  updateTabsNav();
}

/** "<" ">" at the right end of the tab row: on only when there are tabs out of view on that side. */
function updateTabsNav() {
  const strip = el?.tabs.querySelector('.sx-tabs-strip');
  if (!strip) return;
  const [left, right] = el.tabs.querySelectorAll('[data-tabs-scroll]');
  left.disabled = strip.scrollLeft <= 0;
  right.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
}

function scrollTabs(direction) {
  const strip = el.tabs.querySelector('.sx-tabs-strip');
  strip.scrollLeft += direction * Math.max(140, strip.clientWidth * 0.6);
  updateTabsNav();
}

function renderLink() {
  if (!el) return;
  el.link.innerHTML = S.connected
    ? `${icon('link')}<span>${escapeHtml(S.docId ? t('sheet.linked', { name: S.name }) : t('sheet.noChart'))}</span>`
    : `${icon('unlink')}<span>${escapeHtml(t('sheet.notLinked'))}</span>`;
  el.link.classList.toggle('off', !S.connected);
  el.cover.hidden = Boolean(S.docId) && S.connected;
  if (!el.cover.hidden) {
    el.cover.innerHTML = `<div class="sx-cover-card">${icon(S.connected ? 'sheetWindow' : 'unlink')}<p>${escapeHtml(S.connected ? t('sheet.noChartText') : S.waiting ? t('sheet.connecting') : t('sheet.notLinkedText'))}</p>
      <div class="sx-cover-buttons">${S.connected ? `<button type="button" class="button primary" data-cmd="newSheet">${icon('plus')}<span>${escapeHtml(labelOf('newSheet'))}</span></button><button type="button" class="button" data-cmd="openFile">${icon('folderOpen')}<span>${escapeHtml(labelOf('openFile'))}</span></button>` : `<button type="button" class="button" data-cmd="reconnect">${icon('refresh')}<span>${escapeHtml(t('sheet.reconnect'))}</span></button>`}</div></div>`;
  }
}

function renderAll() {
  if (!el) return;
  layout();
  draw();
  renderFormulaBar();
  renderStatus();
  renderTabs();
  renderLink();
  renderToolbar();
  setTitle();
}

function refreshSelection() {
  drawOverlay();
  // Headers mark the selected rows and columns.
  draw();
  renderFormulaBar();
  renderStatus();
  renderToolbar();
}

// ───────────────────────── selection and scrolling

function select(r, c, { extend = false, reveal = true } = {}) {
  r = Math.max(0, r);
  c = Math.max(0, c);
  if (r >= S.view.rows - 1 || c >= S.view.cols - 1) { S.view.rows = Math.max(S.view.rows, r + 60); S.view.cols = Math.max(S.view.cols, c + 8); layout(); }
  S.active = { r, c };
  if (!extend) S.anchor = { r, c };
  S.dragInfo = null;
  if (reveal) revealCell(r, c);
  refreshSelection();
}

function selectBox(box, active = { r: box.r0, c: box.c0 }) {
  S.anchor = { r: box.r0 === active.r ? box.r1 : box.r0, c: box.c0 === active.c ? box.c1 : box.c0 };
  S.active = { ...active };
  if (box.r0 === box.r1 && box.c0 === box.c1) S.anchor = { ...active };
  revealCell(active.r, active.c);
  refreshSelection();
}

function revealCell(r, c) {
  const body = el.body;
  const rh = RH();
  const frozenH = S.frozen && r > 0 ? rh : 0;
  const y = posOf(r) * rh;
  if (r > 0 || !S.frozen) {
    if (y < body.scrollTop + frozenH) body.scrollTop = Math.max(0, y - frozenH);
    else if (y + rh > body.scrollTop + body.clientHeight) body.scrollTop = y + rh - body.clientHeight;
  }
  const x = S.colX[c] ?? 0;
  const w = widthOf(c);
  if (x < body.scrollLeft) body.scrollLeft = x;
  else if (x + w > body.scrollLeft + body.clientWidth) body.scrollLeft = x + w - body.clientWidth;
}

/** The cell under a point of the window (content coordinates of the grid body). */
function cellAt(clientX, clientY) {
  const box = el.body.getBoundingClientRect();
  const rh = RH();
  const st = el.body.scrollTop;
  const x = Math.max(0, clientX - box.left) + el.body.scrollLeft;
  const yView = clientY - box.top;
  const c = colAt(x);
  if (S.frozen && st > 0 && yView < rh && yView >= 0) return { r: 0, c };
  const p = Math.max(0, Math.floor((Math.max(0, yView) + st) / rh));
  return { r: rowAt(p), c };
}

// ───────────────────────── editing

function beginEdit(mode = 'enter', text = null, { bar = false } = {}) {
  if (!S.docId) return;
  const { r, c } = S.active;
  const original = inputText(S.cells, S.sheet, r, c);
  S.editing = { r, c, mode, original, text: text ?? original, bar };
  S.mode = mode === 'enter' ? 'enter' : 'edit';
  el.editor.value = S.editing.text;
  if (!bar) {
    el.editor.focus({ preventScroll: true });
    const end = el.editor.value.length;
    el.editor.setSelectionRange(end, end);
  }
  renderFormulaBar();
  drawOverlay();
  renderStatus();
}

function editText(text, from) {
  if (!S.editing) return;
  S.editing.text = text;
  if (from !== el.editor) el.editor.value = text;
  if (from !== el.formula) el.formula.value = text;
  S.pointing = null;
  drawOverlay();
  updateAutocomplete(from);
}

function commitEdit({ move = null } = {}) {
  const e = S.editing;
  if (!e) return;
  S.editing = null;
  S.mode = 'ready';
  hideAutocomplete();
  el.editor.value = '';
  const text = e.text;
  if (text !== e.original) {
    // An unfinished formula gets its closing brackets, as in Excel.
    let input = text;
    if (isFormula(input)) { const open = (input.match(/\(/g) ?? []).length - (input.match(/\)/g) ?? []).length; if (open > 0) input += ')'.repeat(open); }
    apply(setInput(S.cells, S.sheet, e.r, e.c, input), e.r === 0 ? 'rename' : 'edit');
  }
  if (move) select(e.r + move[0], e.c + move[1]);
  else refreshSelection();
  focusGrid();
}

function cancelEdit() {
  if (!S.editing) return;
  S.editing = null;
  S.mode = 'ready';
  hideAutocomplete();
  el.editor.value = '';
  refreshSelection();
  focusGrid();
}

const focusGrid = () => el?.editor.focus({ preventScroll: true });

/** While a formula is typed, a click (or drag) on cells puts their address into it. */
function canPoint() {
  const e = S.editing;
  if (!e || !isFormula(e.text)) return false;
  const input = e.bar ? el.formula : el.editor;
  const before = e.text.slice(0, input.selectionStart ?? e.text.length).trimEnd();
  return S.pointing != null || /[=(,;+\-*/^&<>:]$/.test(before);
}
function pointAt(box) {
  const e = S.editing;
  const input = e.bar ? el.formula : el.editor;
  const ref = rangeAddress(box);
  if (!S.pointing) {
    const at = input.selectionStart ?? e.text.length;
    S.pointing = { start: at, end: at };
  }
  const { start, end } = S.pointing;
  const text = e.text.slice(0, start) + ref + e.text.slice(end);
  S.pointing = { start, end: start + ref.length };
  e.text = text;
  el.editor.value = text;
  el.formula.value = text;
  input.setSelectionRange(start + ref.length, start + ref.length);
  S.mode = 'point';
  drawOverlay();
  renderStatus();
}

// ── function names while typing a formula
function updateAutocomplete(input) {
  const e = S.editing;
  if (!e || !isFormula(e.text)) return hideAutocomplete();
  const target = input ?? el.editor;
  const before = e.text.slice(0, target.selectionStart ?? e.text.length);
  const m = /([A-Za-z][A-Za-z0-9.]*)$/.exec(before);
  if (!m || /[A-Za-z]{1,3}\d+$/.test(before)) return hideAutocomplete();
  const word = m[1].toUpperCase();
  const list = FUNCTION_NAMES.filter((n) => n.startsWith(word)).slice(0, 10);
  if (!list.length) return hideAutocomplete();
  S.ac = { word, list, index: 0, target };
  const r = rectOf({ r0: e.r, r1: e.r, c0: e.c, c1: e.c });
  el.ac.hidden = false;
  el.ac.style.left = `${r.x}px`;
  el.ac.style.top = `${r.y + r.h + 2}px`;
  drawAutocomplete();
  return undefined;
}
function drawAutocomplete() {
  el.ac.innerHTML = S.ac.list.map((n, i) => `<div class="sx-ac-item ${i === S.ac.index ? 'on' : ''}" data-ac="${n}" role="option" aria-selected="${i === S.ac.index}">${icon('functionIcon')}<b>${n}</b><span>${escapeHtml(t(`sheet.fn.${n}`, null, ''))}</span></div>`).join('');
}
function hideAutocomplete() { S.ac = null; if (el) el.ac.hidden = true; }
function acceptAutocomplete(name = S.ac?.list[S.ac.index]) {
  const e = S.editing;
  if (!e || !name) return;
  const input = S.ac?.target ?? el.editor;
  const at = input.selectionStart ?? e.text.length;
  const before = e.text.slice(0, at).replace(/[A-Za-z][A-Za-z0-9.]*$/, '');
  const text = `${before}${name}(${e.text.slice(at)}`;
  const caret = before.length + name.length + 1;
  hideAutocomplete();
  editText(text, null);
  input.focus({ preventScroll: true });
  input.setSelectionRange(caret, caret);
  hideAutocomplete();
}

// ───────────────────────── changes (all go to the main window)

/** Takes a new state of the sheet: normalizes it through the table, redraws, and sends it to the chart. */
function apply({ cells, sheet }, label = 'edit', { quiet = false } = {}) {
  if (!S.docId) return;
  const extras = normalizeSheet(sheet);
  const table = tableFromCells(cells, extras);
  S.cells = sheetCells(table);
  // Formula cells outside the table still show their results.
  for (const key of Object.keys(extras?.formulas ?? {})) { const [r, c] = key.split(',').map(Number); if (cells[r]?.[c] != null) { while (S.cells.length <= r) S.cells.push([]); S.cells[r][c] = cells[r][c]; } }
  S.sheet = extras ?? emptySheet();
  S.canUndo = true;
  send({ type: 'edit', id: S.docId, table, sheet: extras, label });
  layout();
  if (S.filter.on) updateVisible();
  draw();
  renderFormulaBar();
  renderStatus();
  if (!quiet) updateToolbarState();
}

/** A message from the main window. */
function receive(m) {
  if (!m || typeof m !== 'object') return;
  switch (m.type) {
    case 'doc': {
      const changedDoc = m.id !== S.docId;
      S.connected = true;
      S.waiting = false;
      S.docId = m.id;
      S.name = m.name ?? '';
      S.title = m.title ?? '';
      S.docs = Array.isArray(m.docs) ? m.docs : [];
      S.canUndo = Boolean(m.canUndo);
      S.canRedo = Boolean(m.canRedo);
      const table = m.table && Array.isArray(m.table.columns) && Array.isArray(m.table.rows) ? m.table : { columns: [{ name: 'A' }], rows: [] };
      S.cells = sheetCells({ columns: table.columns.map((c) => ({ name: String(c?.name ?? '') })), rows: table.rows.map((r) => (Array.isArray(r) ? r : [])) });
      S.sheet = normalizeSheet(m.sheet) ?? emptySheet();
      if (S.editing && (changedDoc || inputText(S.cells, S.sheet, S.editing.r, S.editing.c) !== S.editing.original)) cancelEdit();
      if (changedDoc) {
        S.active = { r: 1, c: 0 };
        S.anchor = { r: 1, c: 0 };
        S.clip = S.clip && { ...S.clip, marquee: null };
        S.filter = { on: false, hidden: {} };
        S.view = { rows: 200, cols: 26 };
        computeAutoWidths();
        if (el) { el.body.scrollTop = 0; el.body.scrollLeft = 0; }
      } else if (!Object.keys(S.autoWidths).length) computeAutoWidths();
      renderAll();
      return;
    }
    case 'select': {
      // Carry on from the cells selected in the main window's grid.
      if (m.id !== S.docId || !m.active) return;
      const b = m.box ?? { r0: m.active.r, r1: m.active.r, c0: m.active.c, c1: m.active.c };
      selectBox({ r0: Math.max(0, b.r0), r1: Math.max(0, b.r1), c0: Math.max(0, b.c0), c1: Math.max(0, b.c1) }, { r: Math.max(0, m.active.r), c: Math.max(0, m.active.c) });
      focusGrid();
      return;
    }
    case 'state':
      S.connected = true;
      S.waiting = false;
      S.canUndo = Boolean(m.canUndo);
      S.canRedo = Boolean(m.canRedo);
      if (Array.isArray(m.docs)) S.docs = m.docs;
      if (m.name) S.name = m.name;
      renderTabs();
      renderLink();
      updateToolbarState();
      setTitle();
      return;
    case 'none':
      S.connected = true;
      S.waiting = false;
      S.docId = null;
      S.name = '';
      S.docs = [];
      S.cells = [[]];
      S.sheet = emptySheet();
      cancelEdit();
      renderAll();
      return;
    case 'ping':
      send({ type: 'hello' });
      return;
    case 'close':
      closeWindow(false);
      return;
    case 'bye':
      S.connected = false;
      S.waiting = false;
      renderLink();
      return;
    case 'notice':
      toast(m.text ?? '', m.kind ?? 'info');
      return;
    default:
  }
}

async function closeWindow(tell = true) {
  if (tell) { if (S.editing) commitEdit(); await send({ type: 'closed', id: S.docId, active: S.active, box: sel() }); }
  if (desktop) await appWindow.destroy().catch(() => appWindow.close().catch(() => {}));
  else globalThis.close();
}

function toast(text, kind = 'info') {
  if (!el || !text) return;
  const item = document.createElement('div');
  item.className = `sx-toast-item ${kind}`;
  item.innerHTML = `${icon(kind === 'error' ? 'error' : kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(text)}</span>`;
  el.toast.append(item);
  setTimeout(() => item.classList.add('out'), 2600);
  setTimeout(() => item.remove(), 3100);
}

function reportError(error, context = '') {
  const message = native.errorText(error);
  const known = /^[a-z]+\.[a-zA-Z]+$/.test(message) ? t(`error.${message}`, null, message) : message;
  toast(known, 'error');
  send({ type: 'error', message: known, detail: String(error?.stack ?? ''), context });
}

// ───────────────────────── clipboard

function clipFor(box, cut) {
  const block = copyBlock(S.cells, S.sheet, box);
  // Hidden (filtered) rows are left out of a copy, as in Excel.
  if (S.vis) {
    const keep = [];
    for (let r = box.r0; r <= box.r1; r++) if (posOf(r) < S.vis.length && S.vis[posOf(r)] === r) keep.push(r - box.r0);
    block.values = keep.map((k) => block.values[k]);
    block.rows = keep.length;
  }
  const text = blockText(block);
  S.clip = { block, text, cut: cut ? { ...box } : null, marquee: { ...box } };
  return text;
}

function htmlOf(block) {
  return `<table>${block.values.map((row) => `<tr>${row.map((v) => `<td>${escapeHtml(cellText(v))}</td>`).join('')}</tr>`).join('')}</table>`;
}

async function copyCells(cut = false) {
  const text = clipFor(sel(), cut);
  try { await native.clipboardWrite(text); } catch { /* the in-program copy still works */ }
  drawOverlay();
  toast(t(cut ? 'sheet.cutDone' : 'sheet.copied', { range: rangeAddress(sel()) }));
}

const sameText = (a, b) => String(a ?? '').replace(/\r\n/g, '\n').replace(/\n$/, '') === String(b ?? '').replace(/\r\n/g, '\n').replace(/\n$/, '');

function pasteText(text, mode = 'all') {
  if (!S.docId) return;
  let block;
  const internal = S.clip && sameText(text, S.clip.text);
  if (internal) block = S.clip.block;
  else if (text != null && String(text).length) block = textBlock(text, splitDelimited);
  else if (S.clip) block = S.clip.block;
  if (!block) { toast(t('sheet.clipboardEmpty')); return; }
  let state = { cells: S.cells, sheet: S.sheet };
  if (internal && S.clip.cut) {
    state = clearBox(state.cells, state.sheet, S.clip.cut, { values: true, formats: true });
  }
  const s = sel();
  const target = s.r0 === s.r1 && s.c0 === s.c1 ? { r0: s.r0, c0: s.c0 } : s;
  if (target.r0 === 0 && mode !== 'formats' && block.rows > 1 && !internal) {
    // Pasting a range with its header row onto the header row: the names go into row 1, as in Excel.
  }
  const out = pasteBlock(state.cells, state.sheet, block, target, mode);
  apply(out, 'paste');
  if (internal && S.clip.cut) S.clip = null;
  else if (S.clip) S.clip.marquee = null;
  selectBox(out.box, { r: out.box.r0, c: out.box.c0 });
  toast(t('sheet.pasted', { rows: out.box.r1 - out.box.r0 + 1, cols: out.box.c1 - out.box.c0 + 1 }));
}

async function pasteFromClipboard(mode = 'all') {
  let text = '';
  try { text = await native.clipboardRead(); } catch { text = S.clip?.text ?? ''; }
  pasteText(text, mode);
}

// ───────────────────────── commands

const wholeColumns = (s) => s.r0 <= 1 && s.r1 >= Math.max(1, usedSize(S.cells, S.sheet).rows - 1);

function insertRowsCmd(below = false) {
  const s = sel();
  const count = s.r1 - s.r0 + 1;
  const at = Math.max(1, below ? s.r1 + 1 : s.r0);
  apply(insertCells(S.cells, S.sheet, 'row', at, count), 'insert');
  select(at, s.c0);
  S.anchor = { r: at + count - 1, c: s.c1 };
  refreshSelection();
}
function deleteRowsCmd() {
  const s = sel();
  const from = Math.max(1, s.r0);
  if (s.r1 < 1) { toast(t('sheet.headerStays'), 'error'); return; }
  apply(deleteCells(S.cells, S.sheet, 'row', from, s.r1 - from + 1), 'delete');
  select(from, s.c0);
}
function insertColumnsCmd(right = false) {
  const s = sel();
  const count = s.c1 - s.c0 + 1;
  const at = right ? s.c1 + 1 : s.c0;
  const out = insertCells(S.cells, S.sheet, 'col', at, count);
  for (let k = 0; k < count; k++) out.cells[0][at + k] = `${t('grid.newColumn')} ${columnLetter(at + k)}`;
  apply(out, 'insert');
  S.autoWidths = Object.fromEntries(Object.entries(S.autoWidths).map(([c, w]) => [Number(c) >= at ? Number(c) + count : c, w]));
  select(s.r0, at);
}
function deleteColumnsCmd() {
  const s = sel();
  const used = usedSize(S.cells, S.sheet).cols;
  if (s.c1 - s.c0 + 1 >= used && s.c0 === 0) { toast(t('notice.lastColumn'), 'error'); return; }
  apply(deleteCells(S.cells, S.sheet, 'col', s.c0, s.c1 - s.c0 + 1), 'delete');
  computeAutoWidths();
  select(s.r0, s.c0);
}

function clearCmd(what) {
  const s = sel();
  apply(clearBox(S.cells, S.sheet, s, { values: what !== 'formats', formats: what !== 'values' }), 'clear');
  if (what !== 'values') renderToolbar();
}

/**
 * Excel number format codes (Format › Custom format, Ctrl+1): the common codes to pick from, a code of your own, and
 * a preview with the active cell's value and with a few sample numbers.
 */
function customFormatDialog(initial = null) {
  if (!S.docId) return;
  const f = fmtOf(S.active.r, S.active.c) ?? {};
  const v = S.cells[S.active.r]?.[S.active.c];
  const sample = typeof v === 'number' || (typeof v === 'string' && v !== '') ? v : 1234.5;
  const current = initial ?? (f.fmt === 'custom' ? f.code : 'General');
  const preview = (code) => [sample, -1234.5, 0, 0.256, 45352].map((x) => { const out = formatCode(x, code); return `<span class="sx-fmt-sample" ${out.color ? `style="color:${out.color}"` : ''}><small>${escapeHtml(typeof x === 'number' ? String(x) : x)}</small><b>${escapeHtml(out.text)}</b></span>`; }).join('');
  dialog({
    title: t('sheet.cmd.formatCustom'), glyph: 'numberFormat',
    body: `<label class="sx-field"><span>${escapeHtml(t('sheet.formatCode'))}</span><input type="text" data-dialog-input data-format-code value="${escapeHtml(current)}" spellcheck="false" /></label>
      <div class="sx-fmt-preview" data-format-preview>${preview(current)}</div>
      <div class="sx-fmt-presets" role="listbox" aria-label="${escapeHtml(t('sheet.formatPresets'))}">${FORMAT_PRESETS.map((code) => `<button type="button" class="sx-fmt-preset ${code === current ? 'on' : ''}" data-format-preset="${escapeHtml(code)}" role="option" aria-selected="${code === current}"><code>${escapeHtml(code)}</code><span>${escapeHtml(formatCode(typeof sample === 'number' ? sample : 1234.5, code).text)}</span></button>`).join('')}</div>
      <p class="sx-hint">${icon('info')}<span>${escapeHtml(t('sheet.formatHelp'))}</span></p>`,
    ok: (box) => {
      const code = box.querySelector('[data-format-code]').value.trim() || 'General';
      setFormat(/^general$/i.test(code) ? { fmt: null, code: null, dec: null, sym: null } : { fmt: 'custom', code, dec: null, sym: null });
      return true;
    },
  });
  S.formatPreview = preview;
}

function setFormat(patch) {
  if (!S.docId) return;
  apply({ cells: S.cells, sheet: formatBox(S.sheet, sel(), patch) }, 'format');
  renderToolbar();
}
function toggleFormat(key) {
  const current = fmtOf(S.active.r, S.active.c)?.[key];
  setFormat({ [key]: current ? null : true });
}
function setNumberFormat(type) {
  if (type === 'custom') return customFormatDialog();
  if (type === 'general') return setFormat({ fmt: null, dec: null, sym: null });
  const patch = { fmt: type };
  if (type === 'currency') patch.sym = lang() === 'en' ? '$' : '₩';
  if (type === 'currency' && lang() !== 'en') patch.dec = 0;
  return setFormat(patch);
}
function changeDecimals(delta) {
  const s = sel();
  const f = fmtOf(S.active.r, S.active.c) ?? {};
  const v = S.cells[S.active.r]?.[S.active.c];
  const guess = typeof v === 'number' && !Number.isInteger(v) ? Math.min(2, String(v).split('.')[1]?.length ?? 0) : 0;
  const current = f.dec ?? (f.fmt === 'percent' ? 0 : f.fmt ? 2 : guess);
  const dec = Math.max(0, Math.min(10, current + delta));
  apply({ cells: S.cells, sheet: formatBox(S.sheet, s, { fmt: f.fmt && f.fmt !== 'general' && f.fmt !== 'text' && f.fmt !== 'date' ? f.fmt : 'number', dec }) }, 'format');
  renderToolbar();
}

function sortCmd(direction) {
  const s = sel();
  const used = usedSize(S.cells, S.sheet);
  const single = s.r0 === s.r1 && s.c0 === s.c1;
  const box = single || wholeColumns(s) ? { r0: 1, r1: used.rows - 1, c0: 0, c1: used.cols - 1 } : s;
  if (box.r1 < 1) return;
  apply(sortBox(S.cells, S.sheet, box, S.active.c, direction, lang()), 'sort');
  toast(t('notice.sorted', { name: S.cells[0]?.[S.active.c] ?? columnLetter(S.active.c) }));
}

function fillCmd(direction) {
  const s = sel();
  if (direction === 'down') {
    if (s.r0 === s.r1) { if (s.r0 <= 1) return; apply(fillBox(S.cells, S.sheet, { ...s, r0: s.r0 - 1, r1: s.r0 - 1 }, { ...s, r0: s.r0 - 1 }), 'fill'); return; }
    apply(fillBox(S.cells, S.sheet, { ...s, r1: s.r0 }, s), 'fill');
  } else {
    if (s.c0 === s.c1) { if (s.c0 === 0) return; apply(fillBox(S.cells, S.sheet, { ...s, c0: s.c0 - 1, c1: s.c0 - 1 }, { ...s, c0: s.c0 - 1 }), 'fill'); return; }
    apply(fillBox(S.cells, S.sheet, { ...s, c1: s.c0 }, s), 'fill');
  }
}

/** Σ: a SUM of the numbers above (or to the left of) the cell; over a range, a SUM under each column. */
function autoSum(name = 'SUM') {
  if (!S.docId) return;
  const s = sel();
  const numberAt = (r, c) => typeof S.cells[r]?.[c] === 'number' || Boolean(formulaOf(r, c));
  if (s.r0 !== s.r1 || s.c0 !== s.c1) {
    const target = s.r1 + 1;
    let state = { cells: S.cells, sheet: S.sheet };
    for (let c = s.c0; c <= s.c1; c++) state = setInput(state.cells, state.sheet, target, c, `=${name}(${addressOf(Math.max(1, s.r0), c)}:${addressOf(s.r1, c)})`);
    apply(state, 'sum');
    return;
  }
  const { r, c } = S.active;
  let top = r - 1;
  while (top >= 1 && numberAt(top, c)) top--;
  let formula;
  if (top < r - 1) formula = `=${name}(${addressOf(top + 1, c)}:${addressOf(r - 1, c)})`;
  else {
    let left = c - 1;
    while (left >= 0 && numberAt(r, left)) left--;
    formula = left < c - 1 ? `=${name}(${addressOf(r, left + 1)}:${addressOf(r, c - 1)})` : `=${name}()`;
  }
  beginEdit('edit', formula);
  if (formula.endsWith('()')) el.editor.setSelectionRange(formula.length - 1, formula.length - 1);
}

function insertFunction(name) {
  if (!name) return;
  if (!S.editing) beginEdit('edit', `=${name}(`);
  else {
    const input = S.editing.bar ? el.formula : el.editor;
    const at = input.selectionStart ?? S.editing.text.length;
    const text = S.editing.text || '=';
    const head = text.slice(0, at) || '=';
    editText(`${head}${name}(${text.slice(at)}`, null);
    input.focus({ preventScroll: true });
    input.setSelectionRange(head.length + name.length + 1, head.length + name.length + 1);
  }
}

function autofit(cols) {
  const widths = { ...(S.sheet.widths ?? {}) };
  const probe = el.layer.querySelector('.sx-cell') ?? el.editor;
  const context = (textWidthOf.canvas ?? (textWidthOf.canvas = document.createElement('canvas'))).getContext('2d');
  context.font = getComputedStyle(probe).font;
  const used = usedSize(S.cells, S.sheet);
  for (const c of cols) {
    let w = 40;
    for (let r = 0; r < used.rows; r++) w = Math.max(w, context.measureText(display(r, c)).width / S.zoom + (r === 0 ? 34 : 18));
    widths[c] = Math.round(Math.min(600, w));
  }
  apply({ cells: S.cells, sheet: { ...cloneSheet(S.sheet) ?? emptySheet(), widths } }, 'width');
}

function goToCmd() {
  dialog({
    title: t('sheet.cmd.goTo'), glyph: 'goToCell',
    body: `<label class="sx-field"><span>${escapeHtml(t('sheet.goToLabel'))}</span><input type="text" data-dialog-input value="${escapeHtml(rangeAddress(sel()))}" spellcheck="false" /></label>`,
    ok: (box) => { const b = parseRange(box.querySelector('[data-dialog-input]').value); if (!b) { toast(t('sheet.badAddress'), 'error'); return false; } selectBox(b); return true; },
  });
}

/** A new chart (a new tab in the main window) from the selected cells, or from the whole sheet when one cell is selected. */
function makeChart() {
  if (S.editing) commitEdit();
  const s = sel();
  const used = usedSize(S.cells, S.sheet);
  const single = s.r0 === s.r1 && s.c0 === s.c1;
  const box = single ? { r0: 0, r1: Math.max(0, used.rows - 1), c0: 0, c1: Math.max(0, used.cols - 1) } : { ...s, r1: Math.min(s.r1, Math.max(0, used.rows - 1)), c1: Math.min(s.c1, Math.max(0, used.cols - 1)) };
  // The first row of the block names the series (the header row, or the selection's own first row).
  const rows = [];
  for (let r = box.r0; r <= box.r1; r++) {
    if (S.vis && S.vis[posOf(r)] !== r) continue;
    const row = [];
    for (let c = box.c0; c <= box.c1; c++) row.push(S.cells[r]?.[c] ?? null);
    rows.push(row);
  }
  if (rows.length < 2) { toast(t('sheet.chartNeedsRows'), 'error'); return; }
  send({ type: 'make-chart', id: S.docId, names: rows[0].map((v, i) => (v == null || v === '' ? columnLetter(box.c0 + i) : String(v))), rows: rows.slice(1), range: rangeAddress(box) });
}

function chartRange() {
  const s = sel();
  if (s.r0 === s.r1 && s.c0 === s.c1) { toast(t('notice.selectCells'), 'error'); return; }
  send({ type: 'chart-range', id: S.docId, box: { r0: Math.max(0, s.r0 - 1), r1: Math.max(0, s.r1 - 1), c0: s.c0, c1: s.c1 } });
}

// ── filter
function toggleFilter() {
  S.filter = S.filter.on ? { on: false, hidden: {} } : { on: true, hidden: {} };
  updateVisible();
  renderAll();
}
function openFilterMenu(c, anchor) {
  if (!S.filter.on) { S.filter.on = true; }
  const used = usedSize(S.cells, S.sheet);
  const values = new Map();
  for (let r = 1; r < used.rows; r++) { const d = display(r, c); values.set(d, (values.get(d) ?? 0) + 1); }
  const list = [...values.keys()].sort((a, b) => a.localeCompare(b, lang(), { numeric: true }));
  const hidden = new Set(S.filter.hidden[c] ?? []);
  const rect = anchor.getBoundingClientRect();
  el.pop.hidden = false;
  el.pop.className = 'sx-pop sx-filter-pop';
  el.pop.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 300))}px`;
  el.pop.style.top = `${rect.bottom + 2}px`;
  el.pop.innerHTML = `<div class="sx-fp-head">${icon('filter')}<b>${escapeHtml(String(S.cells[0]?.[c] ?? columnLetter(c)))}</b></div>
    <div class="sx-fp-sort"><button type="button" class="button" data-fp="asc">${icon('sortAsc')}<span>${escapeHtml(labelOf('sortAsc'))}</span></button><button type="button" class="button" data-fp="desc">${icon('sortDesc')}<span>${escapeHtml(labelOf('sortDesc'))}</span></button></div>
    <input type="search" class="sx-fp-search" placeholder="${escapeHtml(t('sheet.filterSearch'))}" aria-label="${escapeHtml(t('sheet.filterSearch'))}" />
    <div class="sx-fp-list"><label class="sx-fp-all"><input type="checkbox" data-fp-all ${hidden.size ? '' : 'checked'} /><span>${escapeHtml(t('sheet.filterAll'))}</span></label>${list.map((v) => `<label><input type="checkbox" data-fp-value="${escapeHtml(v)}" ${hidden.has(v) ? '' : 'checked'} /><span>${escapeHtml(v === '' ? t('sheet.blank') : v)}</span><small>${values.get(v)}</small></label>`).join('')}</div>
    <div class="sx-fp-foot"><button type="button" class="button" data-fp="clear">${icon('filterClear')}<span>${escapeHtml(t('sheet.filterClear'))}</span></button><span class="grow"></span><button type="button" class="button primary" data-fp="ok">${escapeHtml(t('common.ok'))}</button><button type="button" class="button" data-fp="cancel">${escapeHtml(t('common.cancel'))}</button></div>`;
  // The whole list shows, also in a short window: moved up when it would run off the bottom.
  const h = el.pop.offsetHeight;
  if (rect.bottom + 2 + h > window.innerHeight - 4) el.pop.style.top = `${Math.max(4, Math.min(rect.top - 2 - h, window.innerHeight - h - 4))}px`;
  S.menu = { kind: 'filter', col: c };
  el.pop.querySelector('.sx-fp-search').focus();
}
function filterPopClick(target) {
  const c = S.menu?.col;
  const action = target.closest('[data-fp]')?.dataset.fp;
  if (!action) return;
  if (action === 'asc' || action === 'desc') { closePop(); S.active = { r: S.active.r, c }; sortCmd(action === 'asc' ? 1 : -1); return; }
  if (action === 'cancel') { closePop(); return; }
  if (action === 'clear') { delete S.filter.hidden[c]; closePop(); updateVisible(); renderAll(); return; }
  const off = [...el.pop.querySelectorAll('[data-fp-value]')].filter((x) => !x.checked).map((x) => x.dataset.fpValue);
  if (off.length) S.filter.hidden[c] = off; else delete S.filter.hidden[c];
  closePop();
  updateVisible();
  el.body.scrollTop = 0;
  renderAll();
}

// ── find and replace
function openFind(replace = false) {
  S.find.open = true;
  S.find.replace = replace;
  const f = S.find;
  el.find.hidden = false;
  el.find.innerHTML = `<div class="sx-find-row">${icon('search')}<input type="search" data-find="query" value="${escapeHtml(f.query)}" placeholder="${escapeHtml(t('sheet.findWhat'))}" aria-label="${escapeHtml(t('sheet.findWhat'))}" spellcheck="false" />
      <button type="button" class="sx-tool small" data-find-act="prev" title="${escapeHtml(t('sheet.findPrev'))}" aria-label="${escapeHtml(t('sheet.findPrev'))}">${icon('chevronUp')}</button>
      <button type="button" class="sx-tool small" data-find-act="next" title="${escapeHtml(t('sheet.findNext'))}" aria-label="${escapeHtml(t('sheet.findNext'))}">${icon('chevronDown')}</button>
      <output data-find-count></output>
      <button type="button" class="sx-tool small" data-find-act="toggle" title="${escapeHtml(t('sheet.cmd.replace'))}" aria-label="${escapeHtml(t('sheet.cmd.replace'))}">${icon('replace')}</button>
      <button type="button" class="sx-tool small" data-find-act="close" title="${escapeHtml(t('common.close'))}" aria-label="${escapeHtml(t('common.close'))}">${icon('close')}</button></div>
    ${replace ? `<div class="sx-find-row">${icon('replace')}<input type="text" data-find="with" value="${escapeHtml(f.with)}" placeholder="${escapeHtml(t('sheet.replaceWith'))}" aria-label="${escapeHtml(t('sheet.replaceWith'))}" spellcheck="false" />
      <button type="button" class="button" data-find-act="replace">${escapeHtml(t('sheet.replaceOne'))}</button><button type="button" class="button" data-find-act="replaceAll">${escapeHtml(t('sheet.replaceAll'))}</button></div>` : ''}
    <div class="sx-find-row sx-find-options"><label><input type="checkbox" data-find-opt="matchCase" ${f.matchCase ? 'checked' : ''} /><span>${escapeHtml(t('sheet.matchCase'))}</span></label><label><input type="checkbox" data-find-opt="whole" ${f.whole ? 'checked' : ''} /><span>${escapeHtml(t('sheet.wholeCell'))}</span></label></div>`;
  const input = el.find.querySelector('[data-find="query"]');
  input.focus();
  input.select();
  updateFindCount();
}
function findHits() { return findCells(S.cells, S.sheet, S.find.query, { matchCase: S.find.matchCase, whole: S.find.whole }); }
function updateFindCount() {
  const out = el.find.querySelector('[data-find-count]');
  if (out) out.textContent = S.find.query ? t('sheet.found', { n: findHits().length }) : '';
}
function findStep(direction = 1) {
  const hits = findHits();
  if (!hits.length) { toast(t('sheet.notFound', { text: S.find.query })); return; }
  const { r, c } = S.active;
  const after = (h) => h.r > r || (h.r === r && h.c > c);
  const before = (h) => h.r < r || (h.r === r && h.c < c);
  const next = direction > 0 ? hits.find(after) ?? hits[0] : [...hits].reverse().find(before) ?? hits[hits.length - 1];
  select(next.r, next.c);
}
function replaceCmd(all) {
  const opts = { matchCase: S.find.matchCase, whole: S.find.whole };
  const targets = all ? findHits() : [S.active];
  let state = { cells: S.cells, sheet: S.sheet };
  let n = 0;
  for (const h of targets) {
    const now = replaceIn(inputText(state.cells, state.sheet, h.r, h.c), S.find.query, S.find.with, opts);
    if (now == null) continue;
    state = setInput(state.cells, state.sheet, h.r, h.c, now);
    n++;
  }
  if (n) apply(state, 'replace');
  toast(t('sheet.replaced', { n }));
  if (!all) findStep(1);
  updateFindCount();
}
function closeFind() { S.find.open = false; el.find.hidden = true; focusGrid(); }

// ───────────────────────── files

const SAVE_FORMATS = { xlsx: 'xlsx', csv: 'csv', tsv: 'tsv', json: 'json', md: 'markdown', html: 'html' };
const baseName = (path) => String(path ?? '').split(/[\\/]/).pop() ?? '';
const stripExt = (name) => String(name).replace(/\.[a-z0-9]{1,8}$/i, '');

async function readChosenFile() {
  if (desktop) {
    const [path] = await native.chooseFiles(settings.lastDirectory, [
      { name: t('sheet.openFilter'), extensions: [...IMPORT_EXTENSIONS] },
      { name: 'Excel (*.xlsx)', extensions: ['xlsx', 'xlsm'] }, { name: 'CSV / TSV (*.csv, *.tsv, *.txt)', extensions: ['csv', 'tsv', 'tab', 'txt'] },
      { name: 'All files (*.*)', extensions: ['*'] },
    ], false);
    if (!path) return null;
    return { name: baseName(path), path, bytes: await native.readBinaryFile(path) };
  }
  const [file] = await native.pickFilesWeb();
  return file ? { name: file.name, path: null, handle: file.handle, bytes: file.content } : null;
}

/** Excel / ODS / HTML files with more than one sheet: which one. */
function chooseSheet(names) {
  return new Promise((resolve) => {
    dialog({
      title: t('sheet.chooseSheet'), glyph: 'sheetWindow',
      body: `<div class="sx-sheet-list" role="radiogroup">${names.map((n, i) => `<label><input type="radio" name="sheet" value="${i}" ${i === 0 ? 'checked' : ''} /><span>${icon('sheetWindow')}${escapeHtml(n)}</span></label>`).join('')}</div>`,
      ok: (box) => { resolve(Number(box.querySelector('input[name="sheet"]:checked')?.value ?? 0)); return true; },
      cancel: () => resolve(null),
    });
  });
}

/** Open: a data file (or a .mychart) as a new sheet — a new chart tab in the main window. `replace`: into this sheet. */
async function openFileCmd({ replace = false } = {}) {
  try {
    const file = await readChosenFile();
    if (!file) return;
    const format = detectFormat(file.name, file.bytes);
    if (format === 'mychart') {
      if (replace) { toast(t('sheet.notData'), 'error'); return; }
      send({ type: 'open-chart', name: file.name, path: file.path, text: decodeText(file.bytes) });
      return;
    }
    let out = await importData(file.bytes, file.name, {});
    if (out.sheets?.length > 1) {
      const index = await chooseSheet(out.sheets);
      if (index == null) return;
      if (index !== out.sheet) out = await importData(file.bytes, file.name, { sheet: index });
    }
    if (!out.table.rows.length && out.table.columns.length <= 1) throw new Error('import.empty');
    const label = out.sheets?.length > 1 ? `${stripExt(file.name)} - ${out.sheets[out.sheet]}` : stripExt(file.name);
    const ext = (/\.([a-z0-9]+)$/i.exec(file.name)?.[1] ?? '').toLowerCase();
    const remember = SAVE_FORMATS[ext] ? { path: file.path, handle: file.handle ?? null, name: file.name, ext } : null;
    if (replace) {
      apply({ cells: sheetCells(out.table), sheet: out.extras ?? emptySheet() }, 'open');
      computeAutoWidths();
      if (remember) S.files[S.docId] = remember;
      renderAll();
      toast(t('notice.dataReplaced', { name: file.name, rows: out.table.rows.length }), 'success');
    } else {
      S.pendingFile = remember;
      send({ type: 'open-data', name: label, path: file.path, table: out.table, sheet: out.extras ?? null });
    }
  } catch (error) {
    reportError(error, 'open');
  }
}

async function contentFor(ext) {
  const table = tableFromCells(S.cells, S.sheet);
  if (ext === 'xlsx') return toXlsx(table, { sheetName: S.title || stripExt(S.name) || 'Data', sheet: normalizeSheet(S.sheet) });
  return exportData(table, SAVE_FORMATS[ext] ?? 'csv', { title: S.title });
}

async function saveFileCmd({ saveAs = false } = {}) {
  if (!S.docId) return;
  if (S.editing) commitEdit();
  const known = S.files[S.docId];
  try {
    if (desktop) {
      let path = !saveAs && known?.path ? known.path : null;
      if (!path) {
        const base = `${settings.lastDirectory ? `${settings.lastDirectory}/` : ''}${stripExt(known?.name ?? S.name) || 'data'}.${known?.ext ?? 'xlsx'}`;
        path = await native.chooseSavePath(base, [known?.ext ?? 'xlsx', ...['xlsx', 'csv', 'tsv', 'json', 'md', 'html'].filter((x) => x !== (known?.ext ?? 'xlsx'))]);
        if (!path) return;
      }
      let ext = (/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? '').toLowerCase();
      if (!SAVE_FORMATS[ext]) { ext = 'xlsx'; path = `${path}.xlsx`; }
      const content = await contentFor(ext);
      if (content instanceof Uint8Array) await native.writeBinaryFile(path, content);
      else await native.writeTextFile(path, content, '');
      S.files[S.docId] = { path, name: baseName(path), ext };
      toast(t('notice.saved', { name: baseName(path) }), 'success');
      send({ type: 'saved-data', id: S.docId, path });
      return;
    }
    let ext = known?.ext;
    if (saveAs || !known?.handle) {
      ext = await chooseFormat(ext ?? 'xlsx');
      if (!ext) return;
    }
    const content = await contentFor(ext);
    const mime = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json', md: 'text/markdown', html: 'text/html' }[ext];
    const saved = await native.saveFileWeb(new Blob([content], { type: mime }), { name: `${stripExt(known?.name ?? S.name) || 'data'}.${ext}`, handle: saveAs || known?.ext !== ext ? null : known?.handle, saveAs: saveAs || !known?.handle, mime });
    if (!saved) return;
    S.files[S.docId] = { path: null, handle: saved.handle, name: saved.name, ext };
    toast(t('notice.saved', { name: saved.name }), 'success');
  } catch (error) {
    reportError(error, 'save');
  }
}

function chooseFormat(current) {
  return new Promise((resolve) => {
    dialog({
      title: t('sheet.cmd.saveFileAs'), glyph: 'saveAs',
      body: `<div class="sx-sheet-list" role="radiogroup">${Object.keys(SAVE_FORMATS).map((x) => `<label><input type="radio" name="fmt" value="${x}" ${x === current ? 'checked' : ''} /><span>${icon(x === 'xlsx' ? 'xlsxFile' : x === 'json' ? 'jsonFile' : x === 'html' ? 'htmlFile' : x === 'md' ? 'reportMarkdown' : 'csvFile')}${escapeHtml(t(`sheet.format.${x}`))}</span></label>`).join('')}</div>`,
      ok: (box) => { resolve(box.querySelector('input[name="fmt"]:checked')?.value ?? null); return true; },
      cancel: () => resolve(null),
    });
  });
}

// ── print: the sheet's cells as the print window lays them out (header and page choices are there)
function printCmd(selection = false) {
  if (!S.docId) return;
  if (S.editing) commitEdit();
  const used = usedSize(S.cells, S.sheet);
  const s = sel();
  const box = selection && (s.r0 !== s.r1 || s.c0 !== s.c1) ? s : { r0: 0, r1: Math.max(0, used.rows - 1), c0: 0, c1: Math.max(0, used.cols - 1) };
  const rows = [];
  const styles = [];
  const numbers = [];
  for (let r = box.r0; r <= box.r1; r++) {
    if (S.vis && S.vis[posOf(r)] !== r) continue;
    const row = [];
    const st = [];
    const nm = [];
    for (let c = box.c0; c <= box.c1; c++) {
      row.push(display(r, c));
      const f = fmtOf(r, c);
      st.push(f ? { b: f.b, i: f.i, u: f.u, s: f.s, align: f.align, color: f.color, fill: f.fill } : null);
      nm.push(typeof S.cells[r]?.[c] === 'number');
    }
    rows.push({ n: r + 1, cells: row, styles: st, numbers: nm, head: r === 0 });
  }
  const widths = [];
  const letters = [];
  for (let c = box.c0; c <= box.c1; c++) { widths.push(baseWidth(c)); letters.push(columnLetter(c)); }
  send({ type: 'print', id: S.docId, data: { title: S.title || stripExt(S.name), range: rangeAddress(box), rows, widths, letters, gridlines: S.gridlines } });
}

// ───────────────────────── small windows inside the page (dialogs, menus)

function dialog({ title, glyph, body, ok, cancel = () => {} }) {
  el.modal.hidden = false;
  el.modal.innerHTML = `<div class="sx-dialog" role="dialog" aria-label="${escapeHtml(title)}"><header>${icon(glyph)}<b>${escapeHtml(title)}</b><span class="grow"></span><button type="button" class="window-button" data-dialog="cancel" title="${escapeHtml(t('common.close'))}" aria-label="${escapeHtml(t('common.close'))}">${icon('close')}</button></header>
    <div class="sx-dialog-body">${body}</div>
    <footer><span class="grow"></span><button type="button" class="button primary" data-dialog="ok">${escapeHtml(t('common.ok'))}</button><button type="button" class="button" data-dialog="cancel">${escapeHtml(t('common.cancel'))}</button></footer></div>`;
  S.dialog = { ok, cancel };
  (el.modal.querySelector('[data-dialog-input]') ?? el.modal.querySelector('input') ?? el.modal.querySelector('[data-dialog="ok"]'))?.focus();
  el.modal.querySelector('[data-dialog-input]')?.select?.();
}
function closeDialog(accept) {
  const d = S.dialog;
  if (!d) return;
  if (accept) { if (d.ok(el.modal) === false) return; } else d.cancel();
  S.dialog = null;
  el.modal.hidden = true;
  el.modal.innerHTML = '';
  focusGrid();
}

function openMenu(items, x, y, kind = 'menu') {
  el.pop.hidden = false;
  el.pop.className = `sx-pop sx-menu-pop sx-${kind}`;
  el.pop.innerHTML = items.map((id) => {
    if (id === '-') return '<hr />';
    const c = COMMANDS[id];
    const on = c.checked?.() ? 'checked' : '';
    return `<button type="button" class="sx-mi ${on}" data-cmd="${id}" ${enabled(id) ? '' : 'disabled'} role="menuitem">${icon(c.icon)}<span>${escapeHtml(labelOf(id))}</span><span class="sx-key">${escapeHtml(c.key ? keyLabel(c.key) : '')}</span>${on ? icon('check', 'icon mark') : ''}</button>`;
  }).join('');
  const w = el.pop.offsetWidth;
  const h = el.pop.offsetHeight;
  el.pop.style.left = `${Math.max(4, Math.min(x, window.innerWidth - w - 4))}px`;
  el.pop.style.top = `${Math.max(4, y + h > window.innerHeight - 4 ? Math.max(4, window.innerHeight - h - 4) : y)}px`;
  S.menu = { kind };
}
function closePop() {
  if (!el || el.pop.hidden) return;
  el.pop.hidden = true;
  el.pop.innerHTML = '';
  S.menu = null;
  for (const b of root.querySelectorAll('.sx-menu-button.open')) b.classList.remove('open');
}

// ───────────────────────── command table

const has = () => Boolean(S.docId);
const COMMANDS = {
  // File
  newSheet: { icon: 'fileNew', key: 'Ctrl+N', run: () => send({ type: 'new-chart' }) },
  openFile: { icon: 'folderOpen', key: 'Ctrl+O', run: () => openFileCmd() },
  importReplace: { icon: 'importData', enabled: has, run: () => openFileCmd({ replace: true }) },
  saveFile: { icon: 'save', key: 'Ctrl+S', enabled: has, run: () => saveFileCmd() },
  saveFileAs: { icon: 'saveAs', key: 'Ctrl+Shift+S', enabled: has, run: () => saveFileCmd({ saveAs: true }) },
  saveChart: { icon: 'saveChart', enabled: has, run: () => send({ type: 'save-chart', id: S.docId }) },
  print: { icon: 'print', key: 'Ctrl+P', enabled: has, run: () => printCmd(false) },
  printSelection: { icon: 'sheetPrint', enabled: has, run: () => printCmd(true) },
  dock: { icon: 'attachWindow', run: async () => { if (S.editing) commitEdit(); await send({ type: 'dock', id: S.docId, active: S.active, box: sel() }); closeWindow(false); } },
  closeWindow: { icon: 'exit', key: 'Ctrl+W', run: () => closeWindow(true) },
  // Edit
  undo: { icon: 'undo', key: 'Ctrl+Z', enabled: () => has() && S.canUndo, run: () => { if (S.editing) cancelEdit(); send({ type: 'undo', id: S.docId }); } },
  redo: { icon: 'redo', key: 'Ctrl+Y', enabled: () => has() && S.canRedo, run: () => send({ type: 'redo', id: S.docId }) },
  cut: { icon: 'cut', key: 'Ctrl+X', enabled: has, run: () => copyCells(true) },
  copy: { icon: 'copy', key: 'Ctrl+C', enabled: has, run: () => copyCells(false) },
  paste: { icon: 'paste', key: 'Ctrl+V', enabled: has, run: () => pasteFromClipboard('all') },
  pasteValues: { icon: 'pasteValues', key: 'Ctrl+Shift+V', enabled: has, run: () => pasteFromClipboard('values') },
  pasteFormats: { icon: 'formatPainter', enabled: () => has() && Boolean(S.clip), run: () => pasteText(S.clip?.text, 'formats') },
  clearContents: { icon: 'clear', key: 'Delete', enabled: has, run: () => clearCmd('values') },
  clearFormats: { icon: 'clearFormat', enabled: has, run: () => clearCmd('formats') },
  clearAll: { icon: 'clearAll', enabled: has, run: () => clearCmd('all') },
  selectAll: { icon: 'selectAll', key: 'Ctrl+A', enabled: has, run: () => { const u = usedSize(S.cells, S.sheet); selectBox({ r0: 0, c0: 0, r1: Math.max(0, u.rows - 1), c1: Math.max(0, u.cols - 1) }, { r: 0, c: 0 }); } },
  find: { icon: 'search', key: 'Ctrl+F', enabled: has, run: () => openFind(false) },
  replace: { icon: 'replace', key: 'Ctrl+H', enabled: has, run: () => openFind(true) },
  goTo: { icon: 'goToCell', key: 'Ctrl+G', enabled: has, run: () => goToCmd() },
  fillDown: { icon: 'fillDown', key: 'Ctrl+D', enabled: has, run: () => fillCmd('down') },
  fillRight: { icon: 'fillRight', key: 'Ctrl+R', enabled: has, run: () => fillCmd('right') },
  // View
  zoomIn: { icon: 'zoomIn', run: () => setZoom(S.zoom + 0.1) },
  zoomOut: { icon: 'zoomOut', run: () => setZoom(S.zoom - 0.1) },
  zoom100: { icon: 'zoomReset', run: () => setZoom(1) },
  freezeTop: { icon: 'freezeRow', checked: () => S.frozen, run: () => { S.frozen = !S.frozen; renderAll(); } },
  gridlines: { icon: 'grid', checked: () => S.gridlines, run: () => { S.gridlines = !S.gridlines; draw(); } },
  formulaBar: { icon: 'functionIcon', checked: () => S.formulaBar, run: () => { S.formulaBar = !S.formulaBar; draw(); } },
  showFormulas: { icon: 'textTool', key: 'Ctrl+`', checked: () => S.showFormulas, run: () => { S.showFormulas = !S.showFormulas; draw(); } },
  // Insert
  insertRows: { icon: 'addRow', key: 'Ctrl+Shift+=', enabled: has, run: () => insertRowsCmd(false) },
  insertRowsBelow: { icon: 'insertCells', enabled: has, run: () => insertRowsCmd(true) },
  insertColumns: { icon: 'addColumn', enabled: has, run: () => insertColumnsCmd(false) },
  insertColumnsRight: { icon: 'insertCells', enabled: has, run: () => insertColumnsCmd(true) },
  deleteRows: { icon: 'deleteRow', key: 'Ctrl+-', enabled: has, run: () => deleteRowsCmd() },
  deleteColumns: { icon: 'deleteColumn', enabled: has, run: () => deleteColumnsCmd() },
  autoSum: { icon: 'autoSum', key: 'Alt+=', enabled: has, run: () => autoSum('SUM') },
  insertFunction: { icon: 'functionIcon', key: 'Shift+F3', enabled: has, run: () => functionPicker() },
  // Format
  bold: { icon: 'bold', key: 'Ctrl+B', enabled: has, checked: () => Boolean(fmtOf(S.active.r, S.active.c)?.b), run: () => toggleFormat('b') },
  italic: { icon: 'italic', key: 'Ctrl+I', enabled: has, checked: () => Boolean(fmtOf(S.active.r, S.active.c)?.i), run: () => toggleFormat('i') },
  underline: { icon: 'underline', key: 'Ctrl+U', enabled: has, checked: () => Boolean(fmtOf(S.active.r, S.active.c)?.u), run: () => toggleFormat('u') },
  strike: { icon: 'strike', key: 'Ctrl+5', enabled: has, checked: () => Boolean(fmtOf(S.active.r, S.active.c)?.s), run: () => toggleFormat('s') },
  alignLeft: { icon: 'textAlignLeft', enabled: has, checked: () => fmtOf(S.active.r, S.active.c)?.align === 'left', run: () => setFormat({ align: fmtOf(S.active.r, S.active.c)?.align === 'left' ? null : 'left' }) },
  alignCenter: { icon: 'textAlignCenter', enabled: has, checked: () => fmtOf(S.active.r, S.active.c)?.align === 'center', run: () => setFormat({ align: fmtOf(S.active.r, S.active.c)?.align === 'center' ? null : 'center' }) },
  alignRight: { icon: 'textAlignRight', enabled: has, checked: () => fmtOf(S.active.r, S.active.c)?.align === 'right', run: () => setFormat({ align: fmtOf(S.active.r, S.active.c)?.align === 'right' ? null : 'right' }) },
  formatCurrency: { icon: 'formatCurrency', enabled: has, run: () => setNumberFormat('currency') },
  formatPercent: { icon: 'formatPercent', key: 'Ctrl+Shift+5', enabled: has, run: () => setNumberFormat('percent') },
  formatThousands: { icon: 'formatThousands', enabled: has, run: () => setNumberFormat('thousands') },
  formatGeneral: { icon: 'numberFormat', enabled: has, run: () => setNumberFormat('general') },
  formatCustom: { icon: 'numberFormat', key: 'Ctrl+1', enabled: has, run: () => customFormatDialog() },
  decimalMore: { icon: 'decimalMore', enabled: has, run: () => changeDecimals(1) },
  decimalLess: { icon: 'decimalLess', enabled: has, run: () => changeDecimals(-1) },
  autofit: { icon: 'fitWidth', enabled: has, run: () => { const s = sel(); autofit(Array.from({ length: s.c1 - s.c0 + 1 }, (_, i) => s.c0 + i)); } },
  // Data
  sortAsc: { icon: 'sortAsc', enabled: has, run: () => sortCmd(1) },
  sortDesc: { icon: 'sortDesc', enabled: has, run: () => sortCmd(-1) },
  filter: { icon: 'filter', key: 'Ctrl+Shift+L', enabled: has, checked: () => S.filter.on, run: () => toggleFilter() },
  clearFilter: { icon: 'filterClear', enabled: () => S.filter.on && Boolean(S.vis), run: () => { S.filter.hidden = {}; updateVisible(); renderAll(); } },
  chartRange: { icon: 'chartRange', enabled: has, run: () => chartRange() },
  makeChart: { icon: 'newChart', key: 'F11', enabled: has, run: () => makeChart() },
  // Window
  reconnect: { icon: 'refresh', run: () => { S.waiting = true; renderLink(); send({ type: 'hello' }); waitForMain(); } },
  cancelEdit: { icon: 'close', run: () => cancelEdit() },
  commitEdit: { icon: 'check', run: () => (S.editing ? commitEdit() : undefined) },
};
const MENUS = {
  file: ['newSheet', 'openFile', 'importReplace', '-', 'saveFile', 'saveFileAs', 'saveChart', '-', 'print', 'printSelection', '-', 'dock', 'closeWindow'],
  edit: ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'pasteValues', 'pasteFormats', '-', 'fillDown', 'fillRight', '-', 'clearContents', 'clearFormats', 'clearAll', '-', 'selectAll', 'find', 'replace', 'goTo'],
  view: ['zoomIn', 'zoomOut', 'zoom100', '-', 'freezeTop', 'gridlines', 'formulaBar', 'showFormulas'],
  insert: ['insertRows', 'insertRowsBelow', 'insertColumns', 'insertColumnsRight', '-', 'deleteRows', 'deleteColumns', '-', 'autoSum', 'insertFunction'],
  format: ['bold', 'italic', 'underline', 'strike', '-', 'alignLeft', 'alignCenter', 'alignRight', '-', 'formatGeneral', 'formatThousands', 'formatCurrency', 'formatPercent', 'decimalMore', 'decimalLess', 'formatCustom', '-', 'autofit', 'clearFormats'],
  data: ['sortAsc', 'sortDesc', 'filter', 'clearFilter', '-', 'makeChart', 'chartRange', 'importReplace'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', view: 'eye', insert: 'insertCells', format: 'fillColor', data: 'dataGrid' };
const CONTEXT = ['cut', 'copy', 'paste', 'pasteValues', '-', 'insertRows', 'insertColumns', 'deleteRows', 'deleteColumns', '-', 'clearContents', 'clearFormats', '-', 'sortAsc', 'sortDesc', 'filter', '-', 'makeChart', 'chartRange', 'printSelection'];

const labelOf = (id) => t(`sheet.cmd.${id}`);
const tipOf = (id) => { const c = COMMANDS[id]; return c?.key ? `${labelOf(id)} (${keyLabel(c.key)})` : labelOf(id); };
function enabled(id) { const c = COMMANDS[id]; return Boolean(c) && (c.enabled ? c.enabled() : true); }
async function run(id) {
  const c = COMMANDS[id];
  if (!c || !enabled(id)) return;
  closePop();
  try { await c.run(); } catch (error) { reportError(error, id); }
  updateToolbarState();
}

function functionPicker() {
  dialog({
    title: t('sheet.cmd.insertFunction'), glyph: 'functionIcon',
    body: `<input type="search" class="sx-fn-search" data-dialog-input placeholder="${escapeHtml(t('sheet.fnSearch'))}" aria-label="${escapeHtml(t('sheet.fnSearch'))}" spellcheck="false" />
      <div class="sx-fn-list" role="listbox">${FUNCTION_NAMES.map((n, i) => `<label data-fn-row="${n}"><input type="radio" name="fn" value="${n}" ${i === 0 ? 'checked' : ''} /><b>${n}</b><span>${escapeHtml(t(`sheet.fn.${n}`, null, ''))}</span></label>`).join('')}</div>`,
    ok: (box) => { const name = box.querySelector('input[name="fn"]:checked')?.value; setTimeout(() => insertFunction(name), 0); return true; },
  });
}

function setZoom(z) {
  S.zoom = Math.round(Math.max(0.5, Math.min(2, z)) * 10) / 10;
  layout();
  draw();
  renderStatus();
}

// ───────────────────────── events

const SHORTCUTS = Object.entries(COMMANDS).filter(([, c]) => c.key).map(([id, c]) => [id, c.key]);
function matchKey(event, key) {
  const parts = key.split('+');
  const main = parts.pop();
  const want = { ctrl: parts.includes('Ctrl'), shift: parts.includes('Shift'), alt: parts.includes('Alt') };
  const ctrl = MAC ? event.metaKey : event.ctrlKey;
  if (ctrl !== want.ctrl || event.altKey !== want.alt) return false;
  const k = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (main === '=' && (event.code === 'Equal' || event.code === 'NumpadAdd') && (event.shiftKey === want.shift || event.code === 'NumpadAdd')) return true;
  if (main === '-' && (event.code === 'Minus' || event.code === 'NumpadSubtract')) return event.shiftKey === want.shift;
  if (main === '`' && event.code === 'Backquote') return true;
  if (main === '5' && event.code === 'Digit5') return event.shiftKey === want.shift;
  if (main === '0' && event.code === 'Digit0') return event.shiftKey === want.shift;
  if (event.shiftKey !== want.shift) return false;
  return k === main || k === main.toUpperCase();
}

function onGridKey(event) {
  if (S.dialog || !S.docId) return;
  const ctrl = MAC ? event.metaKey : event.ctrlKey;
  // While typing in a cell.
  if (S.editing && !S.editing.bar) {
    if (S.ac) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); S.ac.index = (S.ac.index + (event.key === 'ArrowDown' ? 1 : -1) + S.ac.list.length) % S.ac.list.length; drawAutocomplete(); return; }
      if (event.key === 'Tab') { event.preventDefault(); acceptAutocomplete(); return; }
      if (event.key === 'Escape') { event.preventDefault(); hideAutocomplete(); return; }
    }
    if (event.key === 'Enter' && event.altKey) {
      event.preventDefault();
      const ed = el.editor;
      const at = ed.selectionStart;
      editText(`${ed.value.slice(0, at)}\n${ed.value.slice(ed.selectionEnd)}`, null);
      ed.setSelectionRange(at + 1, at + 1);
      return;
    }
    if (event.key === 'Enter') { event.preventDefault(); commitEdit({ move: [event.shiftKey ? -1 : 1, 0] }); return; }
    if (event.key === 'Tab') { event.preventDefault(); commitEdit({ move: [0, event.shiftKey ? -1 : 1] }); return; }
    if (event.key === 'Escape') { event.preventDefault(); cancelEdit(); return; }
    if (event.key === 'F2') { event.preventDefault(); S.editing.mode = S.editing.mode === 'enter' ? 'edit' : 'enter'; S.mode = S.editing.mode; renderStatus(); return; }
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[event.key] && S.editing.mode === 'enter' && !event.isComposing) { event.preventDefault(); commitEdit({ move: arrows[event.key] }); return; }
    return;
  }
  if (event.isComposing) return;
  for (const [id, key] of SHORTCUTS) {
    if (key === 'Delete') continue;
    if (matchKey(event, key)) { if (['copy', 'cut', 'paste'].includes(id)) return; /* the copy / cut / paste events do these */ event.preventDefault(); run(id); return; }
  }
  const { r, c } = S.active;
  const extend = event.shiftKey;
  const used = usedSize(S.cells, S.sheet);
  const limits = { rows: Math.max(S.view.rows, used.rows), cols: Math.max(S.view.cols, used.cols) };
  const go = (rr, cc) => { event.preventDefault(); select(rr, cc, { extend }); };
  const step = (dr) => { const p = posOf(r) + dr; return rowAt(Math.max(0, Math.min(rowCount() - 1, p))); };
  const page = Math.max(1, Math.floor(el.body.clientHeight / RH()) - 1);
  switch (event.key) {
    case 'ArrowUp': return ctrl ? go(jumpEdge(S.cells, r, c, -1, 0, limits).r, c) : go(step(-1), c);
    case 'ArrowDown': return ctrl ? go(jumpEdge(S.cells, r, c, 1, 0, limits).r, c) : go(step(1), c);
    case 'ArrowLeft': return ctrl ? go(r, jumpEdge(S.cells, r, c, 0, -1, limits).c) : go(r, Math.max(0, c - 1));
    case 'ArrowRight': return ctrl ? go(r, jumpEdge(S.cells, r, c, 0, 1, limits).c) : go(r, c + 1);
    case 'PageUp': return go(step(-page), c);
    case 'PageDown': return go(step(page), c);
    case 'Home': return ctrl ? go(0, 0) : go(r, 0);
    case 'End': return ctrl ? go(Math.max(0, used.rows - 1), Math.max(0, used.cols - 1)) : go(r, Math.max(0, (S.cells[r]?.length ?? 1) - 1));
    case 'Tab': event.preventDefault(); return select(r, Math.max(0, c + (event.shiftKey ? -1 : 1)));
    case 'Enter': event.preventDefault(); return select(Math.max(0, r + (event.shiftKey ? -1 : 1)), c);
    case 'F2': event.preventDefault(); return beginEdit('edit');
    case 'Delete': event.preventDefault(); return run('clearContents');
    case 'Backspace': event.preventDefault(); beginEdit('enter', ''); return undefined;
    case 'Escape': if (S.clip?.marquee) { S.clip.marquee = null; drawOverlay(); } closeFind(); return undefined;
    case 'ContextMenu': { event.preventDefault(); const rr = rectOf(sel()); const b = el.body.getBoundingClientRect(); openMenu(CONTEXT, b.left + rr.x - el.body.scrollLeft + 20, b.top + rr.y - el.body.scrollTop + 20, 'context'); return undefined; }
    default:
  }
  // A character starts typing into the cell (replacing it); the key itself lands in the editor.
  if (!ctrl && !event.altKey && event.key.length === 1) beginEdit('enter', '');
  return undefined;
}

function bind() {
  const body = el.body;
  body.addEventListener('wheel', (event) => { if (!(event.ctrlKey || event.metaKey)) return; event.preventDefault(); setZoom(S.zoom + (event.deltaY < 0 ? 0.1 : -0.1)); }, { passive: false });
  body.addEventListener('scroll', () => { queueDraw(); hideAutocomplete(); }, { passive: true });
  new ResizeObserver(() => { queueDraw(); keepToolbarWhole(); updateTabsNav(); }).observe(body);
  el.tabs.addEventListener('wheel', (event) => { const strip = el.tabs.querySelector('.sx-tabs-strip'); if (!strip || !event.deltaY) return; event.preventDefault(); strip.scrollLeft += event.deltaY; updateTabsNav(); }, { passive: false });

  el.editor.addEventListener('keydown', onGridKey);
  el.editor.addEventListener('compositionstart', () => { if (!S.editing) beginEdit('enter', ''); });
  el.editor.addEventListener('input', () => {
    if (!S.editing) { const v = el.editor.value; beginEdit('enter', ''); el.editor.value = v; }
    editText(el.editor.value, el.editor);
    placeEditor();
  });
  el.editor.addEventListener('copy', (event) => { if (S.editing) return; event.preventDefault(); const text = clipFor(sel(), false); event.clipboardData?.setData('text/plain', text); event.clipboardData?.setData('text/html', htmlOf(S.clip.block)); drawOverlay(); });
  el.editor.addEventListener('cut', (event) => { if (S.editing) return; event.preventDefault(); const text = clipFor(sel(), true); event.clipboardData?.setData('text/plain', text); drawOverlay(); });
  el.editor.addEventListener('paste', (event) => { if (S.editing) return; event.preventDefault(); pasteText(event.clipboardData?.getData('text/plain') ?? '', 'all'); });

  // The formula bar edits the active cell too.
  el.formula.addEventListener('focus', () => { if (!S.docId) return; if (!S.editing) beginEdit('edit', null, { bar: true }); else S.editing.bar = true; });
  el.formula.addEventListener('input', () => { if (!S.editing) beginEdit('edit', null, { bar: true }); editText(el.formula.value, el.formula); });
  el.formula.addEventListener('keydown', (event) => {
    if (S.ac && (event.key === 'Tab' || event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      if (event.key === 'Tab') acceptAutocomplete(); else { S.ac.index = (S.ac.index + (event.key === 'ArrowDown' ? 1 : -1) + S.ac.list.length) % S.ac.list.length; drawAutocomplete(); }
      return;
    }
    if (event.key === 'Enter') { event.preventDefault(); commitEdit({ move: [event.shiftKey ? -1 : 1, 0] }); }
    else if (event.key === 'Escape') { event.preventDefault(); cancelEdit(); }
    else if (event.key === 'Tab') { event.preventDefault(); commitEdit({ move: [0, event.shiftKey ? -1 : 1] }); }
  });
  // The name box: type an address (B5, A1:C9) to go there.
  el.namebox.addEventListener('focus', () => el.namebox.select());
  el.namebox.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); const b = parseRange(el.namebox.value); if (b) selectBox(b); else toast(t('sheet.badAddress'), 'error'); focusGrid(); }
    else if (event.key === 'Escape') { event.preventDefault(); renderFormulaBar(); focusGrid(); }
  });

  // Mouse on the cells: select (drag for a range), point while typing a formula, fill handle, filter buttons.
  body.addEventListener('pointerdown', (event) => {
    if (event.button === 2) {
      const at = cellAt(event.clientX, event.clientY);
      const s = sel();
      if (!(at.r >= s.r0 && at.r <= s.r1 && at.c >= s.c0 && at.c <= s.c1)) { if (S.editing) commitEdit(); select(at.r, at.c, { reveal: false }); }
      return;
    }
    if (event.button !== 0 || event.target === el.editor && S.editing) return;
    if (event.target.closest('[data-filter-col]')) { event.preventDefault(); return; }
    if (event.target.closest('[data-fill-handle]')) { event.preventDefault(); fillDrag(event); return; }
    if (event.target.closest('.sx-ac')) return;
    event.preventDefault();
    const at = cellAt(event.clientX, event.clientY);
    if (S.editing && canPoint()) {
      const start = { ...at };
      pointAt({ r0: at.r, r1: at.r, c0: at.c, c1: at.c });
      dragCells(event, (cur) => pointAt({ r0: Math.min(start.r, cur.r), r1: Math.max(start.r, cur.r), c0: Math.min(start.c, cur.c), c1: Math.max(start.c, cur.c) }));
      return;
    }
    if (S.editing) commitEdit();
    select(at.r, at.c, { extend: event.shiftKey, reveal: false });
    focusGrid();
    dragCells(event, (cur) => { if (cur.r === S.active.r && cur.c === S.active.c) return; S.active = cur; S.dragInfo = `${Math.abs(cur.r - S.anchor.r) + 1}R × ${Math.abs(cur.c - S.anchor.c) + 1}C`; refreshSelection(); }, () => { S.dragInfo = null; renderFormulaBar(); });
  });
  body.addEventListener('click', (event) => {
    const fb = event.target.closest('[data-filter-col]');
    if (fb) { event.stopPropagation(); openFilterMenu(Number(fb.dataset.filterCol), fb); }
  });
  body.addEventListener('dblclick', (event) => {
    if (event.target.closest('[data-filter-col], [data-fill-handle]')) return;
    if (S.editing) return;
    const at = cellAt(event.clientX, event.clientY);
    select(at.r, at.c, { reveal: false });
    beginEdit('edit');
  });
  body.addEventListener('contextmenu', (event) => { event.preventDefault(); openMenu(CONTEXT, event.clientX, event.clientY, 'context'); });
  el.ac.addEventListener('pointerdown', (event) => { const item = event.target.closest('[data-ac]'); if (item) { event.preventDefault(); acceptAutocomplete(item.dataset.ac); } });

  // Column letters: select columns, drag a border to resize, double-click a border to fit.
  root.querySelector('.sx-colhead').addEventListener('pointerdown', (event) => {
    const resize = event.target.closest('[data-resize]');
    if (resize) { event.preventDefault(); resizeColumn(event, Number(resize.dataset.resize)); return; }
    const head = event.target.closest('[data-col]');
    if (!head || event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    const c = Number(head.dataset.col);
    if (S.editing && canPoint()) { pointAt({ r0: 0, r1: S.view.rows - 1, c0: c, c1: c }); return; }
    if (S.editing) commitEdit();
    const s = sel();
    if (event.button === 2 && c >= s.c0 && c <= s.c1 && s.r0 === 0 && s.r1 >= S.view.rows - 1) return;
    const startC = event.shiftKey ? S.anchor.c : c;
    const apply2 = (cc) => { S.anchor = { r: 0, c: startC }; S.active = { r: S.view.rows - 1, c: cc }; refreshSelection(); };
    apply2(c);
    S.active = { r: 0, c };
    S.anchor = { r: S.view.rows - 1, c: startC };
    refreshSelection();
    focusGrid();
    if (event.button === 0) dragHeads(event, 'col', (cc) => { S.active = { r: 0, c: cc }; S.anchor = { r: S.view.rows - 1, c: startC }; refreshSelection(); });
  });
  root.querySelector('.sx-colhead').addEventListener('dblclick', (event) => {
    const resize = event.target.closest('[data-resize]');
    if (resize) { const c = Number(resize.dataset.resize); const s = sel(); autofit(c >= s.c0 && c <= s.c1 && s.c1 > s.c0 ? Array.from({ length: s.c1 - s.c0 + 1 }, (_, i) => s.c0 + i) : [c]); }
  });
  root.querySelector('.sx-colhead').addEventListener('contextmenu', (event) => { event.preventDefault(); openMenu(['cut', 'copy', 'paste', '-', 'insertColumns', 'insertColumnsRight', 'deleteColumns', '-', 'autofit', 'sortAsc', 'sortDesc', 'filter', '-', 'clearContents'], event.clientX, event.clientY, 'context'); });
  root.querySelector('.sx-rowhead').addEventListener('pointerdown', (event) => {
    const head = event.target.closest('[data-row]');
    if (!head || event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    const r = Number(head.dataset.row);
    if (S.editing && canPoint()) { pointAt({ r0: r, r1: r, c0: 0, c1: S.view.cols - 1 }); return; }
    if (S.editing) commitEdit();
    const s = sel();
    if (event.button === 2 && r >= s.r0 && r <= s.r1 && s.c0 === 0 && s.c1 >= S.view.cols - 1) return;
    const startR = event.shiftKey ? S.anchor.r : r;
    S.active = { r, c: 0 };
    S.anchor = { r: startR, c: S.view.cols - 1 };
    refreshSelection();
    focusGrid();
    if (event.button === 0) dragHeads(event, 'row', (rr) => { S.active = { r: rr, c: 0 }; S.anchor = { r: startR, c: S.view.cols - 1 }; refreshSelection(); });
  });
  root.querySelector('.sx-rowhead').addEventListener('contextmenu', (event) => { event.preventDefault(); openMenu(['cut', 'copy', 'paste', '-', 'insertRows', 'insertRowsBelow', 'deleteRows', '-', 'clearContents', 'clearFormats'], event.clientX, event.clientY, 'context'); });
  el.corner.addEventListener('pointerdown', (event) => { event.preventDefault(); if (S.editing) commitEdit(); S.anchor = { r: 0, c: 0 }; S.active = { r: S.view.rows - 1, c: S.view.cols - 1 }; refreshSelection(); S.active = { r: 0, c: 0 }; S.anchor = { r: S.view.rows - 1, c: S.view.cols - 1 }; refreshSelection(); focusGrid(); });

  // Buttons, menus, tabs, dialogs.
  root.addEventListener('click', (event) => {
    const target = event.target;
    const menuButton = target.closest('[data-menu]');
    if (menuButton) {
      const open = S.menu?.kind === `menu-${menuButton.dataset.menu}`;
      closePop();
      if (!open) {
        const r = menuButton.getBoundingClientRect();
        openMenu(MENUS[menuButton.dataset.menu], r.left, r.bottom + 2, `menu-${menuButton.dataset.menu}`);
        S.menu.kind = `menu-${menuButton.dataset.menu}`;
        menuButton.classList.add('open');
      }
      return;
    }
    if (target.closest('.sx-filter-pop')) { filterPopClick(target); return; }
    const cmd = target.closest('[data-cmd]');
    if (cmd && !cmd.disabled) { run(cmd.dataset.cmd); return; }
    const tabsScroll = target.closest('[data-tabs-scroll]');
    if (tabsScroll) { scrollTabs(Number(tabsScroll.dataset.tabsScroll)); return; }
    const closeTab = target.closest('[data-tab-close]');
    if (closeTab) { if (S.editing && S.docId === closeTab.dataset.tabClose) commitEdit(); send({ type: 'close-tab', id: closeTab.dataset.tabClose }); return; }
    const tab = target.closest('[data-tab]');
    if (tab) { if (S.editing) commitEdit(); send({ type: 'activate', id: tab.dataset.tab }); return; }
    const preset = target.closest('[data-format-preset]');
    if (preset) { const input = el.modal.querySelector('[data-format-code]'); input.value = preset.dataset.formatPreset; input.dispatchEvent(new Event('input', { bubbles: true })); for (const b of el.modal.querySelectorAll('[data-format-preset]')) b.classList.toggle('on', b === preset); return; }
    const dlg = target.closest('[data-dialog]');
    if (dlg) { closeDialog(dlg.dataset.dialog === 'ok'); return; }
    const findAct = target.closest('[data-find-act]')?.dataset.findAct;
    if (findAct) {
      if (findAct === 'next') findStep(1);
      else if (findAct === 'prev') findStep(-1);
      else if (findAct === 'close') closeFind();
      else if (findAct === 'toggle') openFind(!S.find.replace);
      else if (findAct === 'replace') replaceCmd(false);
      else if (findAct === 'replaceAll') replaceCmd(true);
      return;
    }
    if (!target.closest('.sx-pop')) closePop();
  });
  root.addEventListener('pointerdown', (event) => { if (!event.target.closest('.sx-pop, [data-menu]')) closePop(); }, true);
  root.addEventListener('auxclick', (event) => { const tab = event.button === 1 && event.target.closest('[data-tab]'); if (tab) { event.preventDefault(); send({ type: 'close-tab', id: tab.dataset.tab }); } });
  root.addEventListener('dblclick', (event) => { if (event.target.closest('.sx-fn-list label, [data-format-preset]')) closeDialog(true); });
  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches('[data-number-format]')) { setNumberFormat(target.value); focusGrid(); }
    else if (target.matches('[data-color]')) { setFormat({ [target.dataset.color]: target.value }); focusGrid(); }
    else if (target.matches('[data-find-opt]')) { S.find[target.dataset.findOpt] = target.checked; updateFindCount(); }
    else if (target.matches('[data-fp-all]')) { for (const box of el.pop.querySelectorAll('[data-fp-value]')) if (!box.closest('label').hidden) box.checked = target.checked; }
  });
  root.addEventListener('input', (event) => {
    const target = event.target;
    if (target.matches('[data-find="query"]')) { S.find.query = target.value; updateFindCount(); }
    else if (target.matches('[data-find="with"]')) S.find.with = target.value;
    else if (target.matches('[data-zoom]')) setZoom(Number(target.value) / 100);
    else if (target.matches('[data-format-code]')) { const box = el.modal.querySelector('[data-format-preview]'); if (box && S.formatPreview) box.innerHTML = S.formatPreview(target.value || 'General'); }
    else if (target.matches('.sx-fp-search')) { const q = target.value.toLowerCase(); for (const label of el.pop.querySelectorAll('.sx-fp-list label:not(.sx-fp-all)')) label.hidden = Boolean(q) && !label.textContent.toLowerCase().includes(q); }
    else if (target.matches('.sx-fn-search')) { const q = target.value.toUpperCase(); let first = null; for (const label of el.modal.querySelectorAll('[data-fn-row]')) { label.hidden = Boolean(q) && !label.dataset.fnRow.includes(q) && !label.textContent.toUpperCase().includes(q); if (!label.hidden && !first) first = label; } if (first) first.querySelector('input').checked = true; }
  });
  root.addEventListener('keydown', (event) => {
    if (event.target.matches('[data-find="query"], [data-find="with"]')) {
      if (event.key === 'Enter') { event.preventDefault(); if (event.target.dataset.find === 'with') replaceCmd(false); else findStep(event.shiftKey ? -1 : 1); }
      else if (event.key === 'Escape') { event.preventDefault(); closeFind(); }
      return;
    }
    if (S.dialog) {
      if (event.key === 'Enter') { event.preventDefault(); closeDialog(true); } else if (event.key === 'Escape') { event.preventDefault(); closeDialog(false); }
      return;
    }
    if (!el.pop.hidden && event.key === 'Escape') { event.preventDefault(); closePop(); focusGrid(); }
    if (event.target.matches('.sx-fp-search') && event.key === 'Enter') { event.preventDefault(); filterPopClick(el.pop.querySelector('[data-fp="ok"]')); }
  });
  // Shortcuts that work anywhere in the window (not only in the grid).
  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || S.dialog) return;
    if (event.target === el.editor) return;
    const typing = event.target.matches?.('input, textarea, select');
    for (const id of ['saveFile', 'saveFileAs', 'openFile', 'print', 'find', 'replace', 'goTo', 'newSheet', 'closeWindow', 'undo', 'redo']) {
      if (typing && (id === 'undo' || id === 'redo')) continue;
      if (matchKey(event, COMMANDS[id].key)) { event.preventDefault(); run(id); return; }
    }
  });
  window.addEventListener('blur', () => closePop());
}

/** Drag over cells (selection or pointing): `move(cell)` while the button is held; the grid scrolls at its edges. */
function dragCells(event, move, done = () => {}) {
  let last = null;
  let timer = null;
  let lastEvent = event;
  const step = () => {
    const box = el.body.getBoundingClientRect();
    const e = lastEvent;
    let dx = 0;
    let dy = 0;
    if (e.clientY > box.bottom - 4) dy = Math.min(40, e.clientY - box.bottom + 8);
    else if (e.clientY < box.top + 4) dy = -Math.min(40, box.top - e.clientY + 8);
    if (e.clientX > box.right - 4) dx = Math.min(40, e.clientX - box.right + 8);
    else if (e.clientX < box.left + 4) dx = -Math.min(40, box.left - e.clientX + 8);
    if (dx || dy) { el.body.scrollTop += dy; el.body.scrollLeft += dx; }
    const cur = cellAt(Math.min(Math.max(e.clientX, box.left + 1), box.right - 1), Math.min(Math.max(e.clientY, box.top + 1), box.bottom - 1));
    if (!last || cur.r !== last.r || cur.c !== last.c) { last = cur; move(cur); }
  };
  const onMove = (e) => { lastEvent = e; step(); };
  const onUp = () => { clearInterval(timer); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); done(); };
  timer = setInterval(step, 60);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function dragHeads(event, axis, move) {
  const onMove = (e) => {
    const at = cellAt(e.clientX, e.clientY);
    move(axis === 'col' ? at.c : at.r);
  };
  const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function resizeColumn(event, c) {
  const startX = event.clientX;
  const start = baseWidth(c);
  const s = sel();
  const cols = c >= s.c0 && c <= s.c1 && s.r0 === 0 && s.r1 >= S.view.rows - 1 ? Array.from({ length: s.c1 - s.c0 + 1 }, (_, i) => s.c0 + i) : [c];
  document.body.classList.add('col-resizing');
  let w = start;
  const onMove = (e) => {
    w = Math.max(24, Math.round(start + (e.clientX - startX) / S.zoom));
    S.sheet = { ...(cloneSheet(S.sheet) ?? emptySheet()), widths: { ...(S.sheet.widths ?? {}), ...Object.fromEntries(cols.map((k) => [k, w])) } };
    layout();
    draw();
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    document.body.classList.remove('col-resizing');
    if (w !== start) apply({ cells: S.cells, sheet: S.sheet }, 'width');
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

/** The fill handle: drag down / up / right / left to continue the selection. */
function fillDrag(event) {
  const source = sel();
  const onMove = (e) => {
    const at = cellAt(e.clientX, e.clientY);
    const down = at.r > source.r1 ? at.r - source.r1 : at.r < source.r0 ? source.r0 - at.r : 0;
    const right = at.c > source.c1 ? at.c - source.c1 : at.c < source.c0 ? source.c0 - at.c : 0;
    if (!down && !right) S.fillDrag = null;
    else if (down >= right) S.fillDrag = at.r > source.r1 ? { ...source, r1: at.r } : { ...source, r0: Math.max(1, at.r) };
    else S.fillDrag = at.c > source.c1 ? { ...source, c1: at.c } : { ...source, c0: at.c };
    drawOverlay();
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    const target = S.fillDrag;
    S.fillDrag = null;
    if (target) {
      apply(fillBox(S.cells, S.sheet, source, target), 'fill');
      S.anchor = { r: target.r0 === source.r0 ? target.r1 : target.r0, c: target.c0 === source.c0 ? target.c1 : target.c0 };
      S.active = { r: source.r0 === target.r0 ? source.r0 : source.r1, c: source.c0 === target.c0 ? source.c0 : source.c1 };
    }
    refreshSelection();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

// ───────────────────────── start

window.addEventListener('error', (event) => { if (!/ResizeObserver loop/.test(String(event.message ?? ''))) reportError(event.error ?? event.message, 'sheet'); });
window.addEventListener('unhandledrejection', (event) => reportError(event.reason, 'sheet'));
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return;
  settings = loadSettings(globalThis.localStorage);
  applyLook();
  renderShell();
  renderAll();
});
globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyLook());

function waitForMain() {
  clearTimeout(waitForMain.timer);
  waitForMain.timer = setTimeout(() => { if (!S.connected) { S.waiting = false; renderLink(); } }, 2500);
}

async function start() {
  applyLook();
  renderShell();
  renderAll();
  if (desktop) {
    await getCurrentWebviewWindow().listen('sheet-to-window', (message) => receive(message.payload));
    // Closing the window with its title bar: the main window shows its grid again.
    await appWindow.onCloseRequested(async () => { if (S.editing) commitEdit(); await send({ type: 'closed', id: S.docId, active: S.active, box: sel() }); });
  } else if (bc) {
    bc.onmessage = (event) => receive(event.data);
    window.addEventListener('pagehide', () => { if (S.editing) commitEdit(); bc.postMessage({ type: 'closed', id: S.docId, active: S.active, box: sel() }); });
  }
  send({ type: 'hello' });
  waitForMain();
  focusGrid();
  if (desktop) native.invoke('popup_ready').catch(() => {});
  keepToolbarWhole();
}

/** Back to a plain view: no menu, find box, dialog, entry, filter or formula view (the tutorial between steps). */
function resetView() {
  closePop();
  if (S.find.open) closeFind();
  if (S.dialog) closeDialog(false);
  cancelEdit();
  S.filter = { on: false, hidden: {} };
  S.showFormulas = false;
  S.clip = null;
  updateVisible();
  renderAll();
}

// For the end-to-end tests and the tutorial.
window.__mychartmasterSheet = { resetView,  S, run, select, selectBox, beginEdit, commitEdit, cancelEdit, editText, pasteText, receive, display, sel, enabled, contentFor, openFilterMenu, el: () => el, commands: COMMANDS, menus: MENUS, context: CONTEXT };

start();
