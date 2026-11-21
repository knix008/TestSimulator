// The print window (popup kind 'print'): page setup on the left, a live preview of the sheets on the
// right, Print and Save as PDF below. Runs inside popup.js, which supplies the frame and controls
// through `api`. The sheets are drawn here from the song (print/sheet.js) — no pictures to wait for.
// Printing: the desktop app prints straight to a chosen printer (WebView2) or opens the system dialog;
// the web build prints this frame. Save as PDF: WebView2's PDF on the desktop, a PDF of the sheets as
// pictures on the web (print/pdf.js).
import * as native from '../platform/native.js';
import { loadPrintSetup, storePrintSetup } from '../domain/settings.js';
import { MARGINS, PAPERS, printablePages, pageChosen, sheetGeometry } from './layout.js';
import { buildSheets, pageTitle } from './sheet.js';
import { pdfFromJpegPages } from './pdf.js';
import './print.css';

const PAGE_ICONS = { leadsheet: 'leadSheet', lyrics: 'lyrics', chords: 'chords', arrangement: 'arrangement', summary: 'songInfo' };

function ui(api) {
  const p = api.P();
  let u = api.state.printUi;
  if (!u || u.at !== p.at) {
    u = { at: p.at, setup: loadPrintSetup(globalThis.localStorage), picked: {}, page: 0, printers: null, busy: null };
    api.state.printUi = u;
  }
  return u;
}

const info = (api) => api.P().info ?? null;

function sheets(api) {
  const u = ui(api);
  const i = info(api);
  if (!i?.song) return [];
  return buildSheets(i, u.setup, u.picked, api.t);
}

const seg = (api, key, options, current) => `<span class="segmented" role="radiogroup">${options.map(([value, label, glyph]) => `<button class="segment ${String(current) === String(value) ? 'active' : ''}" role="radio" aria-checked="${String(current) === String(value)}" data-action="print-set" data-key="${key}" data-value="${api.escapeHtml(value)}" title="${api.escapeHtml(label)}">${glyph ? api.icon(glyph) : ''}${api.escapeHtml(label)}</button>`).join('')}</span>`;
const check = (api, key, label, glyph, checked) => api.row(glyph, label, `<label class="switch-wrap" title="${api.escapeHtml(label)}"><input type="checkbox" data-print-toggle="${key}" ${checked ? 'checked' : ''} aria-label="${api.escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`);
const section = (api, glyph, title, rows, cls = '') => `<section class="print-section ${cls}"><h3>${api.icon(glyph)}<span>${api.escapeHtml(title)}</span></h3>${rows.join('')}</section>`;

function draw(api) {
  const { t, escapeHtml, icon, row, select, numberField, button } = api;
  const u = ui(api);
  const o = u.setup;
  const list = sheets(api);
  u.page = Math.max(0, Math.min(u.page, list.length - 1));
  if (!u.printers) {
    u.printers = { printers: [], defaultPrinter: '' };
    native.listPrinters().then((l) => { u.printers = l; if (l.printers.length) api.render(); }).catch(() => {});
  }
  const { printers, defaultPrinter } = u.printers;
  const pages = printablePages();
  const pageRow = (page) => {
    const on = pageChosen(page, o, u.picked);
    const title = pageTitle(page.type, t);
    return `<label class="print-page-row" title="${escapeHtml(title)}"><input type="checkbox" data-print-pick="${escapeHtml(page.key)}" ${on ? 'checked' : ''} aria-label="${escapeHtml(title)}" />${icon(PAGE_ICONS[page.type])}<span>${escapeHtml(title)}</span><small class="muted">${escapeHtml(t(`print.pageNote.${page.type}`))}</small></label>`;
  };
  api.root.innerHTML = api.frame({
    glyph: 'print', title: t('print.title'),
    body: `<div class="print-view print3d-view">
      <div class="print-options">
        <div class="print-column">
        ${section(api, 'print', t('print.printer'), [
          printers.length ? row('print', t('print.printer'), select('data-print-key', 'printer', [['', t('print.defaultPrinter', { name: defaultPrinter || '-' }), 'print'], ...printers.map((name) => [name, name, 'print'])], printers.includes(o.printer) ? o.printer : '', t('print.printer'))) : row('info', '', `<span class="muted">${escapeHtml(t(api.desktop ? 'print.systemDialog' : 'print.browserDialog'))}</span>`),
          printers.length ? row('duplicate', t('print.copies'), numberField('print:copies', o.copies, 1, 99, 1, '', t('print.copies'))) : '',
        ])}
        ${section(api, 'list', t('print.pages'), [`<div class="print-pages">${pages.map(pageRow).join('')}</div>`, `<div class="row print-count"><span class="muted">${escapeHtml(t('print.count', { sheets: list.length }))}</span></div>`], 'grow')}
        ${section(api, 'notes', t('print.titleBlock'), [
          check(api, 'titleBlock', t('print.titleBlockShow'), 'notes', o.titleBlock),
          row('edit', t('print.titleText'), `<input type="text" data-print-text="titleText" value="${escapeHtml(o.titleText)}" placeholder="${escapeHtml(info(api)?.song?.title ?? '')}" title="${escapeHtml(t('print.titleText'))}" />`),
          row('user', t('print.author'), `<input type="text" data-print-text="author" value="${escapeHtml(o.author)}" placeholder="${escapeHtml(info(api)?.song?.artist || t('print.authorHint'))}" title="${escapeHtml(t('print.author'))}" />`),
        ])}
        </div>
        <div class="print-column">
        ${section(api, 'pageSetup', t('print.paperSection'), [
          row('file', t('print.paper'), select('data-print-key', 'paper', Object.keys(PAPERS).map((paper) => [paper, `${paper} (${PAPERS[paper].width} × ${PAPERS[paper].height} mm)`]), o.paper, t('print.paper'))),
          row('pageSetup', t('print.orientation'), seg(api, 'orientation', [['portrait', t('print.portrait')], ['landscape', t('print.landscape')]], o.orientation)),
          row('fitPage', t('print.margin'), seg(api, 'margin', Object.keys(MARGINS).map((m) => [m, t(`print.margin.${m}`)]), o.margin)),
        ])}
        ${section(api, 'lyrics', t('print.textSection'), [
          row('columns', t('print.lyricColumns'), seg(api, 'lyricColumns', [[1, '1'], [2, '2']], o.lyricColumns)),
          row('font', t('print.fontScale'), numberField('print:fontScale', o.fontScale, 70, 150, 10, '%', t('print.fontScale'))),
        ])}
        </div>
      </div>
      <div class="print-preview" id="print-preview"></div>
    </div>
    <div class="print-sheet" aria-hidden="true"></div>`,
    foot: `<button class="icon-button" data-action="print-page" data-value="-1" title="${escapeHtml(t('print.prev'))}" aria-label="${escapeHtml(t('print.prev'))}">${icon('chevronLeft')}</button>
      <span class="page-number" id="page-number"></span>
      <button class="icon-button" data-action="print-page" data-value="1" title="${escapeHtml(t('print.next'))}" aria-label="${escapeHtml(t('print.next'))}">${icon('chevronRight')}</button>
      <span class="muted print-status" id="print-status">${escapeHtml(u.busy ?? '')}</span>
      <span class="grow"></span>
      ${button('print-pdf', t('print.savePdf'), 'pdfFile', '', '', list.length && !u.busy ? '' : 'disabled')}
      ${button('print-go', t('print.print'), 'print', 'primary', '', list.length && !u.busy ? '' : 'disabled')}
      ${button('close', t('common.close'), 'close')}`,
  });
  setPageStyle(o);
  drawPreview(api, list);
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

function setPageStyle(setup) {
  let style = document.querySelector('#page-style');
  if (!style) { style = document.createElement('style'); style.id = 'page-style'; document.head.append(style); }
  const { width, height } = sheetGeometry(setup);
  style.textContent = `@page { size: ${width}mm ${height}mm; margin: 0; }
@media print { .print-sheet .print-page { width: ${width}mm; height: ${height - 0.5}mm; } }`;
}

function drawPreview(api, list = sheets(api)) {
  const u = ui(api);
  const area = api.root.querySelector('#print-preview');
  if (!area) return;
  const count = list.length;
  u.page = Math.max(0, Math.min(u.page, count - 1));
  area.innerHTML = count ? `<div class="preview-stage">${list[u.page].svg}</div>` : `<div class="preview-empty">${api.icon('info')}<span>${api.escapeHtml(api.t('print.empty'))}</span></div>`;
  const number = api.root.querySelector('#page-number');
  if (number) number.textContent = api.t('print.page', { n: count ? u.page + 1 : 0, total: count });
  const [prev, next] = api.root.querySelectorAll('[data-action="print-page"]');
  if (prev) prev.disabled = u.page <= 0;
  if (next) next.disabled = u.page >= count - 1;
  const stage = area.querySelector('.preview-stage');
  const svg = stage?.querySelector('svg');
  if (!svg) return;
  const box = area.getBoundingClientRect();
  const w = Number(svg.getAttribute('width'));
  const h = Number(svg.getAttribute('height'));
  const scale = Math.min((box.width - 28) / w, (box.height - 28) / h);
  Object.assign(stage.style, { transform: `scale(${scale})`, width: `${w}px`, height: `${h}px`, left: `${(box.width - w * scale) / 2}px`, top: `${(box.height - h * scale) / 2}px` });
}

function turn(api, step) { ui(api).page += step; drawPreview(api); }

function change(api, patch) {
  const u = ui(api);
  u.setup = { ...u.setup, ...patch };
  storePrintSetup(globalThis.localStorage, u.setup);
  api.render();
}

async function withBusy(api, label, task) {
  const u = ui(api);
  u.busy = label;
  api.render();
  try { return await task(); } finally { u.busy = null; api.render(); }
}

function job(api) {
  const u = ui(api);
  const o = u.setup;
  const { width, height } = sheetGeometry(o);
  return { printer: u.printers?.printers.includes(o.printer) ? o.printer : '', copies: o.copies ?? 1, widthMm: width, heightMm: height };
}

function fillSheets(api, list) {
  const holder = api.root.querySelector('.print-sheet');
  if (holder) holder.innerHTML = list.map((s) => `<div class="print-page">${s.svg}</div>`).join('');
  setPageStyle(ui(api).setup);
}

function filePrinterOf(api) {
  const u = ui(api);
  const filePrinters = u.printers?.filePrinters ?? [];
  const name = job(api).printer || u.printers?.defaultPrinter || '';
  return filePrinters.includes(name) ? name : '';
}

async function doPrint(api) {
  const list = sheets(api);
  const toFile = api.desktop && !window.__myaudiomakerPrintHook ? filePrinterOf(api) : '';
  if (toFile && /pdf/i.test(toFile)) { await savePdf(api); return; }
  await withBusy(api, api.t('print.preparing'), async () => {
    fillSheets(api, list);
    const j = job(api);
    try {
      if (window.__myaudiomakerPrintHook) await window.__myaudiomakerPrintHook(list, j);
      else if (api.desktop && ui(api).printers?.printers.length && !toFile) await native.printDirect(j);
      else await native.printWindow();
      api.action('notice', { kind: 'success', text: api.t('notice.printed') });
    } catch (error) {
      api.action('report-error', { titleKey: 'error.print', message: native.errorText(error), context: 'print' });
    }
  });
}

function svgToJpeg(svg, widthPx, heightPx) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = widthPx; canvas.height = heightPx;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, widthPx, heightPx);
      ctx.drawImage(img, 0, 0, widthPx, heightPx);
      canvas.toBlob((blob) => (blob ? blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject) : reject(new Error('JPEG'))), 'image/jpeg', 0.92);
    };
    img.onerror = () => reject(new Error('sheet picture'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export async function rasterPdf(api, list = sheets(api)) {
  const dpi = 200;
  const { width, height } = sheetGeometry(ui(api).setup);
  const w = Math.round((width / 25.4) * dpi);
  const h = Math.round((height / 25.4) * dpi);
  const pages = [];
  for (const s of list) {
    const svg = s.svg.replace(/^<svg([^>]*?) width="\d+" height="\d+"/, `<svg$1 width="${w}" height="${h}"`);
    pages.push({ jpeg: await svgToJpeg(svg, w, h), width: w, height: h, widthMm: width, heightMm: height });
  }
  return pdfFromJpegPages(pages, { title: info(api)?.song?.title ?? '' });
}

function toBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

async function savePdf(api) {
  const list = sheets(api);
  const name = `${(ui(api).setup.titleText || info(api)?.song?.title || 'MyAudioMaker').replace(/[\\/:*?"<>|]+/g, '_')}.pdf`;
  await withBusy(api, api.t('print.preparing'), async () => {
    try {
      if (window.__myaudiomakerPdfHook) { await window.__myaudiomakerPdfHook(list, await rasterPdf(api, list)); return; }
      if (!api.desktop) { api.action('print-save-pdf', { name, base64: toBase64(await rasterPdf(api, list)) }); return; }
      const dir = api.s().lastDirectory;
      let path = await native.chooseSavePath(dir ? `${dir}/${name}` : name, ['pdf']);
      if (!path) return;
      if (!/\.pdf$/i.test(path)) path += '.pdf';
      fillSheets(api, list);
      try { await native.invoke('print_pages_to_pdf', { job: job(api), path }); } catch { await native.writeBase64File(path, toBase64(await rasterPdf(api, list)), 'print-pdf'); }
      api.action('notice', { kind: 'success', text: api.t('notice.exported', { name: path.split(/[\\/]/).pop() }) });
    } catch (error) {
      api.action('report-error', { titleKey: 'error.print', message: native.errorText(error), context: 'print' });
    }
  });
}

// ───────────────────────── popup.js hooks

export function renderPrintPopup(kind, api) {
  if (kind !== 'print') return false;
  draw(api);
  return true;
}

export function printPopupAction(kind, target, api, type = 'click') {
  if (kind !== 'print') return false;
  const u = ui(api);
  if (type === 'stepper') {
    const field = target.dataset.stepper;
    if (field !== 'copies' && field !== 'fontScale') return false;
    change(api, { [field]: Number(target.dataset.value) });
    return true;
  }
  if (type === 'change') {
    if (target.dataset.printToggle) { change(api, { [target.dataset.printToggle]: target.checked }); return true; }
    if (target.dataset.printPick) { u.picked = { ...u.picked, [target.dataset.printPick]: target.checked }; api.render(); return true; }
    if (target.dataset.printKey) { change(api, { [target.dataset.printKey]: target.value }); return true; }
    if (target.dataset.printText) { change(api, { [target.dataset.printText]: target.value.trim() }); return true; }
    return false;
  }
  if (type === 'input') return Boolean(target.dataset.printText);
  switch (target.dataset?.action) {
    case 'print-set': { const v = target.dataset.value; change(api, { [target.dataset.key]: /^\d+$/.test(v) ? Number(v) : v }); return true; }
    case 'print-page': turn(api, Number(target.dataset.value)); return true;
    case 'print-go': doPrint(api); return true;
    case 'print-pdf': savePdf(api); return true;
    default: return false;
  }
}

export function printHostMessage() { return false; }
