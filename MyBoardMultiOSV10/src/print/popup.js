// The print window (popup kind 'print'): the printer, paper and what to print on the left, a live preview of the
// pages on the right, Print and Save as PDF below. Runs inside popup.js, which supplies the frame and controls
// through `api`. The content comes from the main window (print/host.js, 'print-content'); this window lays it out
// (print/pages.js). Print: on the desktop straight to the chosen printer with no dialog (WebView2), or the system
// dialog when the printers cannot be listed; on the web the browser's print dialog. The printed pages are the
// same as the preview (@page size = the paper, the page boxes in millimetres).
import * as native from '../platform/native.js';
import { defaultSetup, layoutPages, MARGINS, PAPERS, PARTS, pageHtml } from './pages.js';
import './texts.js';
import './print.css';

const SETUP_KEY = 'myboard.print.v1';
const PART_ICONS = { project: 'folder', board: 'columns', reports: 'viewReports', issues: 'list' };

function loadSetup() {
  try { return { ...defaultSetup(), ...(JSON.parse(globalThis.localStorage?.getItem(SETUP_KEY) ?? '{}') ?? {}) }; } catch { return defaultSetup(); }
}
function storeSetup(setup) { try { globalThis.localStorage?.setItem(SETUP_KEY, JSON.stringify(setup)); } catch { /* storage off */ } }

function ui(api) {
  const p = api.P();
  let u = api.state.printUi;
  if (!u || u.at !== p.at) {
    u = { at: p.at, setup: loadSetup(), page: 0, content: null, asked: false, printers: null, busy: null };
    api.state.printUi = u;
  }
  return u;
}

const layout = (api) => { const u = ui(api); return layoutPages(u.content, u.setup, api.t); };

function draw(api) {
  const { t, escapeHtml, icon, row, select, numberField, button } = api;
  const u = ui(api);
  const o = u.setup;
  if (!u.asked) { u.asked = true; api.action('print-content', {}); }
  if (!u.printers) {
    u.printers = { printers: [], defaultPrinter: '', filePrinters: [] };
    native.listPrinters().then((list) => { u.printers = list; if (list.printers.length) api.render(); }).catch(() => {});
  }
  const { printers, defaultPrinter } = u.printers;
  const lay = layout(api);
  u.page = Math.max(0, Math.min(u.page, lay.pages.length - 1));
  const seg = (key, options, current) => `<span class="segmented" role="radiogroup">${options.map(([value, label, glyph]) => `<button class="segment ${String(current) === String(value) ? 'active' : ''}" role="radio" aria-checked="${String(current) === String(value)}" data-action="print-set" data-key="${key}" data-value="${escapeHtml(value)}" title="${escapeHtml(label)}">${glyph ? icon(glyph) : ''}${escapeHtml(label)}</button>`).join('')}</span>`;
  const sw = (attrs, label, checked) => `<label class="switch-wrap" title="${escapeHtml(label)}"><input type="checkbox" ${attrs} ${checked ? 'checked' : ''} aria-label="${escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`;
  const section = (glyph, title, rows) => `<section class="print-section"><h3>${icon(glyph)}<span>${escapeHtml(title)}</span></h3>${rows.join('')}</section>`;
  const reports = u.content?.reports ?? [];
  api.root.innerHTML = api.frame({
    glyph: 'print', title: t('print.title'),
    body: `<div class="print-view mb-print-view">
      <div class="print-options">
        <div class="print-column">
          ${section('print', t('print.printer'), [
            printers.length
              // under the section title "프린터": the list (or a note) alone, no second label or icon
              ? `<div class="row print-plain"><span class="row-control">${select('data-print-key', 'printer', [['', t('print.defaultPrinter', { name: defaultPrinter || '-' }), 'print'], ...printers.map((name) => [name, name, 'print'])], printers.includes(o.printer) ? o.printer : '', t('print.printer'))}</span></div>`
              : `<p class="muted print-note">${escapeHtml(t(api.desktop ? 'print.systemDialog' : 'print.browserDialog'))}</p>`,
            printers.length ? row('duplicate', t('print.copies'), numberField('print:copies', o.copies, 1, 99, 1, '', t('print.copies')), t('print.copies'), 'inline') : '',
          ])}
          ${section('pageSetup', t('print.page'), [
            row('file', t('print.paper'), select('data-print-key', 'paper', Object.keys(PAPERS).map((paper) => [paper, `${paper} (${PAPERS[paper].width} × ${PAPERS[paper].height} mm)`, 'file']), o.paper, t('print.paper'))),
            row('pageSetup', t('print.orientation'), seg('orientation', [['portrait', t('print.portrait'), 'file'], ['landscape', t('print.landscape'), 'rotateRight']], o.orientation), t('print.orientation'), 'inline'),
            row('fitPage', t('print.margin'), seg('margin', Object.keys(MARGINS).map((m) => [m, t(`print.margin.${m}`)]), o.margin), t('print.margin'), 'inline'),
            row('palette', t('print.color'), seg('color', [['color', t('print.color.color'), 'palette'], ['grey', t('print.color.grey'), 'fillColor']], o.color), t('print.color'), 'inline'),
            row('notes', t('print.headerFooter'), sw('data-print-toggle="headerFooter"', t('print.headerFooter'), o.headerFooter)),
          ])}
        </div>
        <div class="print-column">
          ${section('list', t('print.contents'), PARTS.map((part) => row(PART_ICONS[part], t(`print.part.${part}`), sw(`data-print-part="${part}"`, t(`print.part.${part}`), o.parts?.[part] !== false))))}
          ${section('viewReports', t('print.reports'), reports.length
            ? reports.map((r) => row('viewReports', r.title, sw(`data-print-report="${escapeHtml(r.id)}"`, r.title, o.reports?.[r.id] !== false && o.parts?.reports !== false)))
            : [row('hourglass', '', `<span class="muted">${escapeHtml(t('print.loading'))}</span>`)])}
        </div>
      </div>
      <div class="print-preview" id="print-preview"></div>
    </div>
    <div class="print-sheet" aria-hidden="true"></div>`,
    foot: `<button class="icon-button" data-action="print-page" data-value="-1" title="${escapeHtml(t('print.prev'))}" aria-label="${escapeHtml(t('print.prev'))}">${icon('chevronLeft')}</button>
      <span class="page-number" id="page-number"></span>
      <button class="icon-button" data-action="print-page" data-value="1" title="${escapeHtml(t('print.next'))}" aria-label="${escapeHtml(t('print.next'))}">${icon('chevronRight')}</button>
      <span class="muted print-status" id="print-status"></span>
      <span class="grow"></span>
      ${button('print-pdf', t('print.savePdf'), 'exportFile', '', '', lay.pages.length && !u.busy ? '' : 'disabled')}
      ${button('print-go', t('print.print'), 'print', 'primary', '', lay.pages.length && !u.busy ? '' : 'disabled')}
      ${button('close', t('common.close'), 'close')}`,
  });
  setPageStyle(lay);
  drawPreview(api, lay);
  if (!u.keys) {
    u.keys = true;
    document.addEventListener('keydown', (event) => {
      if (event.key === 'PageDown') { event.preventDefault(); turn(api, 1); }
      if (event.key === 'PageUp') { event.preventDefault(); turn(api, -1); }
    });
    globalThis.addEventListener('resize', () => drawPreview(api));
  }
  api.ready();
}

function setPageStyle(lay) {
  let style = document.querySelector('#page-style');
  if (!style) { style = document.createElement('style'); style.id = 'page-style'; document.head.append(style); }
  const { width, height } = lay.geometry;
  // A hair under the paper's height: a page exactly as tall as the sheet can round over it and print an empty page.
  style.textContent = `@page { size: ${width}mm ${height}mm; margin: 0; }
@media print { .print-sheet .pp-page { width: ${width}mm !important; height: ${height - 0.5}mm !important; } }`;
}

function pageOf(api, lay, i) {
  const u = ui(api);
  return pageHtml(lay.pages[i], i, lay.pages.length, lay.geometry, u.setup, u.content, api.t);
}

/** Only the preview, the page number and the status (keeps the controls and the focus). */
function drawPreview(api, lay = layout(api)) {
  const u = ui(api);
  const area = api.root.querySelector('#print-preview');
  if (!area) return;
  const count = lay.pages.length;
  u.page = Math.max(0, Math.min(u.page, count - 1));
  area.innerHTML = !u.content
    ? `<div class="preview-empty">${api.icon('hourglass')}<span>${api.escapeHtml(api.t('print.loading'))}</span></div>`
    : count ? `<div class="preview-stage">${pageOf(api, lay, u.page)}</div>`
      : `<div class="preview-empty">${api.icon('info')}<span>${api.escapeHtml(api.t('print.empty'))}</span></div>`;
  const number = api.root.querySelector('#page-number');
  if (number) number.textContent = api.t('print.pageOf', { n: count ? u.page + 1 : 0, total: count });
  const [prev, next] = api.root.querySelectorAll('[data-action="print-page"]');
  if (prev) prev.disabled = u.page <= 0;
  if (next) next.disabled = u.page >= count - 1;
  const status = api.root.querySelector('#print-status');
  if (status) status.textContent = u.busy ?? (count ? api.t('print.pages', { n: count }) : '');
  fitPreview(area);
}

function fitPreview(area) {
  const stage = area.querySelector('.preview-stage');
  const page = stage?.firstElementChild;
  if (!page) return;
  const box = area.getBoundingClientRect();
  const w = page.offsetWidth;
  const h = page.offsetHeight;
  const scale = Math.min((box.width - 28) / w, (box.height - 28) / h);
  Object.assign(stage.style, { transform: `scale(${scale})`, width: `${w}px`, height: `${h}px`, left: `${(box.width - w * scale) / 2}px`, top: `${(box.height - h * scale) / 2}px` });
}

function turn(api, step) {
  const u = ui(api);
  u.page += step;
  drawPreview(api);
}

function change(api, patch) {
  const u = ui(api);
  u.setup = { ...u.setup, ...patch };
  storeSetup(u.setup);
  api.render();
}

async function withBusy(api, label, task) {
  const u = ui(api);
  u.busy = label;
  api.render();
  try { return await task(); } finally { u.busy = null; api.render(); }
}

function job(api, lay) {
  const u = ui(api);
  const o = u.setup;
  return { printer: u.printers?.printers.includes(o.printer) ? o.printer : '', copies: o.copies ?? 1, widthMm: lay.geometry.width, heightMm: lay.geometry.height };
}

/** Every page into the print-only sheet list (what WebView2 / the browser prints). */
function fillSheets(api, lay) {
  const holder = api.root.querySelector('.print-sheet');
  if (holder) holder.innerHTML = lay.pages.map((_, i) => pageOf(api, lay, i)).join('');
  setPageStyle(lay);
}

/** A printer that writes a file (Microsoft Print to PDF, XPS): WebView2 cannot print to it without its own dialog. */
function filePrinterOf(api) {
  const u = ui(api);
  const name = job(api, layout(api)).printer || u.printers?.defaultPrinter || '';
  return (u.printers?.filePrinters ?? []).includes(name) ? name : '';
}

async function doPrint(api) {
  const lay = layout(api);
  const toFile = api.desktop && !window.__myboardPrintHook ? filePrinterOf(api) : '';
  if (toFile && /pdf/i.test(toFile)) { await savePdf(api); return; }
  await withBusy(api, api.t('print.preparing'), async () => {
    fillSheets(api, lay);
    const j = job(api, lay);
    try {
      if (window.__myboardPrintHook) await window.__myboardPrintHook(lay, j);
      else if (api.desktop && ui(api).printers?.printers.length && !toFile) await native.printDirect(j);
      else await native.printWindow();
      api.action('notice', { kind: 'success', text: api.t('print.printed') });
    } catch (error) {
      api.action('report-error', { titleKey: 'print.failed', message: native.errorText(error), context: 'print' });
    }
  });
}

async function savePdf(api) {
  const lay = layout(api);
  const name = `${(ui(api).content?.project?.key || 'MyBoard').replace(/[\\/:*?"<>|]+/g, '_')}.pdf`;
  // The web: the browser's print dialog has "Save as PDF".
  if (!api.desktop) { fillSheets(api, lay); await native.printWindow(); return; }
  await withBusy(api, api.t('print.preparing'), async () => {
    try {
      const dir = api.s().lastDirectory;
      let path = await native.chooseSavePath(dir ? `${dir}/${name}` : name, ['pdf']);
      if (!path) return;
      if (!/\.pdf$/i.test(path)) path += '.pdf';
      fillSheets(api, lay);
      await native.invoke('print_pages_to_pdf', { job: job(api, lay), path });
      api.action('notice', { kind: 'success', text: api.t('print.saved', { name: path.split(/[\\/]/).pop() }) });
    } catch (error) {
      api.action('report-error', { titleKey: 'print.failed', message: native.errorText(error), context: 'print' });
    }
  });
}

// ───────────────────────── popup.js hooks

export function renderPrintPopup(kind, api) {
  if (kind !== 'print') return false;
  draw(api);
  return true;
}

/** Clicks, changes and steppers of the print window; true when handled. */
export function printPopupAction(kind, target, api, type = 'click') {
  if (kind !== 'print') return false;
  const u = ui(api);
  if (type === 'stepper') {
    if (target.dataset.stepper !== 'copies') return false;
    change(api, { copies: Number(target.dataset.value) });
    return true;
  }
  if (type === 'change') {
    if (target.dataset.printToggle) { change(api, { [target.dataset.printToggle]: target.checked }); return true; }
    if (target.dataset.printPart) { change(api, { parts: { ...u.setup.parts, [target.dataset.printPart]: target.checked } }); return true; }
    if (target.dataset.printReport) { change(api, { reports: { ...u.setup.reports, [target.dataset.printReport]: target.checked }, ...(target.checked ? { parts: { ...u.setup.parts, reports: true } } : {}) }); return true; }
    if (target.dataset.printKey) { change(api, { [target.dataset.printKey]: target.value }); return true; }
    return false;
  }
  if (type === 'input') return false;
  switch (target.dataset?.action) {
    case 'print-set': { const v = target.dataset.value; change(api, { [target.dataset.key]: /^\d+$/.test(v) ? Number(v) : v }); return true; }
    case 'print-page': turn(api, Number(target.dataset.value)); return true;
    case 'print-go': doPrint(api); return true;
    case 'print-pdf': savePdf(api); return true;
    default: return false;
  }
}

/** The content from the main window. */
export function printHostMessage(kind, message, api) {
  if (kind !== 'print' || message?.type !== 'print-content') return false;
  const u = ui(api);
  u.content = message.content ?? null;
  api.render();
  return true;
}
