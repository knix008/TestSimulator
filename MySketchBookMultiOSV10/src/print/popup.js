// The print window (popup kind 'print'): page setup on the left, a live preview
// of the sheets on the right, Print and Save as PDF below. Runs inside popup.js,
// which supplies the frame and controls through `api`.
//
// The pictures come from the main window (print/host.js): this window lays out
// the sheets (print/layout.js), asks for every picture it does not have yet
// ('print-render'), and draws each sheet (print/sheet.js) as they arrive.
// Printing: the desktop app prints straight to a chosen printer (WebView2) or
// opens the system dialog; the web build prints this frame (window.print()).
// Save as PDF: WebView2's PDF of the same sheets on the desktop, a PDF of the
// sheets as pictures on the web (print/pdf.js).
import * as native from '../platform/native.js';
import { loadPrintSetup, storePrintSetup } from '../domain/settings.js';
import { layoutSheets, MARGINS, PAPERS, printablePages, pageChosen, SCALE_CHOICES } from './layout.js';
import { pageTitle, sheetSvg } from './sheet.js';
import { pdfFromJpegPages } from './pdf.js';
import { DIM_MODES } from './dimensions.js';
import './print.css';

const PAGE_ICONS = { view: 'view3d', plan: 'plan2d', scene: 'scene', summary: 'entityInfo' };

function ui(api) {
  const p = api.P();
  let u = api.state.printUi;
  if (!u || u.at !== p.at) {
    u = { at: p.at, setup: loadPrintSetup(globalThis.localStorage), picked: {}, page: 0, images: new Map(), failed: new Map(), asked: '', gen: 0, printers: null, busy: null, waiters: [] };
    api.state.printUi = u;
  }
  return u;
}

const info = (api) => api.P().info ?? { levels: [], scenes: [], summary: {} };

function layout(api) {
  const u = ui(api);
  return layoutSheets(info(api), u.setup, u.picked);
}

function sheetContext(api, total) {
  const u = ui(api);
  const i = info(api);
  return {
    t: api.t, total, project: i.name, author: u.setup.author || i.author, titleText: u.setup.titleText, date: new Date().toLocaleDateString(api.L() === 'en' ? 'en-US' : 'ko-KR'),
    scaleBar: u.setup.scaleBar, titleBlock: u.setup.titleBlock, summary: i.summary,
  };
}

function svgOf(api, lay, index) {
  const u = ui(api);
  const sheet = lay.sheets[index];
  const image = sheet.request ? u.images.get(sheet.request.key) ?? null : null;
  return sheetSvg(sheet, lay.geometry, image, { ...sheetContext(api, lay.sheets.length), index });
}

/** Asks the main window for the pictures still missing (the shown sheet first). */
function askPictures(api, lay) {
  const u = ui(api);
  const want = [];
  const order = [u.page, ...lay.sheets.map((_, i) => i).filter((i) => i !== u.page)];
  for (const i of order) {
    const req = lay.sheets[i]?.request;
    if (req && !u.images.has(req.key) && !u.failed.has(req.key) && !want.some((w) => w.key === req.key)) want.push(req);
  }
  const signature = want.map((w) => w.key).join('|');
  if (!want.length || signature === u.asked) return;
  u.asked = signature;
  u.gen += 1;
  api.action('print-render', { gen: u.gen, requests: want });
}

const seg = (api, key, options, current) => `<span class="segmented" role="radiogroup">${options.map(([value, label, glyph]) => `<button class="segment ${String(current) === String(value) ? 'active' : ''}" role="radio" aria-checked="${String(current) === String(value)}" data-action="print-set" data-key="${key}" data-value="${api.escapeHtml(value)}" title="${api.escapeHtml(label)}">${glyph ? api.icon(glyph) : ''}${api.escapeHtml(label)}</button>`).join('')}</span>`;
const check = (api, key, label, glyph, checked) => api.row(glyph, label, `<label class="switch-wrap" title="${api.escapeHtml(label)}"><input type="checkbox" data-print-toggle="${key}" ${checked ? 'checked' : ''} aria-label="${api.escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`);
const section = (api, glyph, title, rows, cls = '') => `<section class="print-section ${cls}"><h3>${api.icon(glyph)}<span>${api.escapeHtml(title)}</span></h3>${rows.join('')}</section>`;

function draw(api) {
  const { t, escapeHtml, icon, row, select, numberField, button } = api;
  const u = ui(api);
  const o = u.setup;
  const lay = layout(api);
  u.page = Math.max(0, Math.min(u.page, lay.sheets.length - 1));
  if (!u.printers) {
    u.printers = { printers: [], defaultPrinter: '' };
    native.listPrinters().then((list) => { u.printers = list; if (list.printers.length) api.render(); }).catch(() => {});
  }
  const { printers, defaultPrinter } = u.printers;
  const pages = printablePages(info(api));
  const chosen = pages.filter((page) => pageChosen(page, o, u.picked)).length;
  const pageRow = (page) => {
    const on = pageChosen(page, o, u.picked);
    const title = pageTitle(page, t);
    return `<label class="print-page-row" title="${escapeHtml(title)}"><input type="checkbox" data-print-pick="${escapeHtml(page.key)}" ${on ? 'checked' : ''} aria-label="${escapeHtml(title)}" />${icon(PAGE_ICONS[page.type])}<span>${escapeHtml(title)}</span></label>`;
  };
  const groups = [['includeView', 'view'], ['includePlans', 'plan'], ['includeScenes', 'scene'], ['includeSummary', 'summary']].filter(([, type]) => pages.some((pg) => pg.type === type));
  const scales = SCALE_CHOICES.map((c) => [String(c), c === 'auto' ? t('print3d.scale.auto') : c === 'fit' ? t('print3d.scale.fit') : `1:${c}`]);
  api.root.innerHTML = api.frame({
    glyph: 'print', title: t('print3d.title'),
    body: `<div class="print-view print3d-view">
      <div class="print-options">
        <div class="print-column">
        ${section(api, 'print', t('print.printer'), [
          printers.length ? row('print', t('print.printer'), select('data-print-key', 'printer', [['', t('print.defaultPrinter', { name: defaultPrinter || '-' }), 'print'], ...printers.map((name) => [name, name, 'print'])], printers.includes(o.printer) ? o.printer : '', t('print.printer'))) : row('info', '', `<span class="muted">${escapeHtml(t(api.desktop ? 'print.systemDialog' : 'print3d.browserDialog'))}</span>`),
          printers.length ? row('duplicate', t('print.copies'), numberField('print:copies', o.copies, 1, 99, 1, '', t('print.copies'))) : '',
        ])}
        ${section(api, 'list', t('print3d.pages'), [
          `<div class="print-groups">${groups.map(([key, type]) => `<button class="chip ${o[key] ? 'on' : ''}" data-action="print-group" data-key="${key}" title="${escapeHtml(t(`print3d.group.${type}`))}">${icon(PAGE_ICONS[type])}<span>${escapeHtml(t(`print3d.group.${type}`))}</span></button>`).join('')}</div>`,
          `<div class="print-pages">${pages.map(pageRow).join('')}</div>`,
          `<div class="row print-count"><span class="muted">${escapeHtml(t('print3d.count', { pages: chosen, sheets: lay.sheets.length }))}</span></div>`,
        ], 'grow')}
        ${section(api, 'notes', t('print3d.titleBlock'), [
          check(api, 'titleBlock', t('print3d.titleBlockShow'), 'notes', o.titleBlock),
          row('edit', t('print3d.titleText'), `<input type="text" data-print-text="titleText" value="${escapeHtml(o.titleText)}" placeholder="${escapeHtml(info(api).name ?? '')}" title="${escapeHtml(t('print3d.titleText'))}" />`),
          row('user', t('print3d.author'), `<input type="text" data-print-text="author" value="${escapeHtml(o.author)}" placeholder="${escapeHtml(info(api).author || t('print3d.authorHint'))}" title="${escapeHtml(t('print3d.author'))}" />`),
        ])}
        </div>
        <div class="print-column">
        ${section(api, 'pageSetup', t('print3d.paper'), [
          row('file', t('print.paper'), select('data-print-key', 'paper', Object.keys(PAPERS).map((paper) => [paper, `${paper} (${PAPERS[paper].width} × ${PAPERS[paper].height} mm)`]), o.paper, t('print.paper'))),
          row('pageSetup', t('print.orientation'), seg(api, 'orientation', [['portrait', t('print.portrait')], ['landscape', t('print.landscape')]], o.orientation)),
          row('fitPage', t('print.margin'), seg(api, 'margin', Object.keys(MARGINS).map((m) => [m, t(`print.margin.${m}`)]), o.margin)),
        ])}
        ${section(api, 'plan2d', t('print3d.planSection'), [
          row('scaleTool', t('print3d.scale'), select('data-print-key', 'planScale', scales, String(o.planScale), t('print3d.scale'))),
          row('styleShaded', t('print3d.planStyle'), seg(api, 'planStyle', [['lines', t('print3d.planStyle.lines')], ['colour', t('print3d.planStyle.colour')]], o.planStyle)),
          row('dimension', t('print3d.dims'), seg(api, 'dimensions', DIM_MODES.map((m) => [m, t(`print3d.dims.${m}`)]), o.dimensions)),
          check(api, 'scaleBar', t('print3d.scaleBar'), 'rulers', o.scaleBar),
        ])}
        ${section(api, 'palette', t('print3d.output'), [
          row('palette', t('print3d.color'), seg(api, 'color', [['color', t('print3d.color.color')], ['grey', t('print3d.color.grey')]], o.color)),
          row('view3d', t('print3d.viewFit'), seg(api, 'viewFit', [['fit', t('print3d.viewFit.fit')], ['fill', t('print3d.viewFit.fill')]], o.viewFit)),
          row('quality', t('print3d.dpi'), seg(api, 'dpi', [100, 150, 200, 300].map((d) => [d, `${d} dpi`]), o.dpi)),
        ])}
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
      ${button('print-pdf', t('print3d.savePdf'), 'exportFile', '', '', lay.sheets.length && !u.busy ? '' : 'disabled')}
      ${button('print-go', t('print.print'), 'print', 'primary', '', lay.sheets.length && !u.busy ? '' : 'disabled')}
      ${button('close', t('common.close'), 'close')}`,
  });
  setPageStyle(lay);
  drawPreview(api, lay);
  askPictures(api, lay);
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
  // A hair under the paper's height: a sheet exactly as tall as the page can round over it and print an empty page.
  style.textContent = `@page { size: ${width}mm ${height}mm; margin: 0; }
@media print { .print-sheet .print-page { width: ${width}mm; height: ${height - 0.5}mm; } }`;
}

/** Only the preview, the page number and the status (pictures arriving keep the controls and the focus). */
function drawPreview(api, lay = layout(api)) {
  const u = ui(api);
  const area = api.root.querySelector('#print-preview');
  if (!area) return;
  const count = lay.sheets.length;
  u.page = Math.max(0, Math.min(u.page, count - 1));
  area.innerHTML = count
    ? `<div class="preview-stage">${svgOf(api, lay, u.page)}</div>`
    : `<div class="preview-empty">${api.icon('info')}<span>${api.escapeHtml(api.t('print3d.empty'))}</span></div>`;
  const number = api.root.querySelector('#page-number');
  if (number) number.textContent = api.t('print.page', { n: count ? u.page + 1 : 0, total: count });
  const [prev, next] = api.root.querySelectorAll('[data-action="print-page"]');
  if (prev) prev.disabled = u.page <= 0;
  if (next) next.disabled = u.page >= count - 1;
  const needed = lay.sheets.filter((s) => s.request).map((s) => s.request.key);
  const ready = needed.filter((k) => u.images.has(k)).length;
  const failed = needed.filter((k) => u.failed.has(k)).length;
  const status = api.root.querySelector('#print-status');
  if (status) status.textContent = u.busy ? u.busy : failed ? api.t('print3d.failed', { n: failed }) : ready < needed.length ? api.t('print3d.progress', { n: ready, total: needed.length }) : '';
  fitPreview(area);
}

function fitPreview(area) {
  const stage = area.querySelector('.preview-stage');
  const svg = stage?.querySelector('svg');
  if (!svg) return;
  const box = area.getBoundingClientRect();
  const w = Number(svg.getAttribute('width'));
  const h = Number(svg.getAttribute('height'));
  const scale = Math.min((box.width - 28) / w, (box.height - 28) / h);
  Object.assign(stage.style, { transform: `scale(${scale})`, width: `${w}px`, height: `${h}px`, left: `${(box.width - w * scale) / 2}px`, top: `${(box.height - h * scale) / 2}px` });
}

function turn(api, step) {
  const u = ui(api);
  u.page += step;
  const lay = layout(api);
  drawPreview(api, lay);
  askPictures(api, lay);
}

function change(api, patch) {
  const u = ui(api);
  u.setup = { ...u.setup, ...patch };
  storePrintSetup(globalThis.localStorage, u.setup);
  api.render();
}

/** Resolves when every picture of the layout is here (or failed), at most `timeout` ms. */
function allPictures(api, lay, timeout = 180000) {
  const u = ui(api);
  const missing = () => lay.sheets.some((s) => s.request && !u.images.has(s.request.key) && !u.failed.has(s.request.key));
  if (!missing()) return Promise.resolve(true);
  askPictures(api, lay);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { u.waiters = u.waiters.filter((w) => w !== check); resolve(false); }, timeout);
    const check = () => { if (missing()) return false; clearTimeout(timer); resolve(true); return true; };
    u.waiters.push(check);
  });
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

/** Puts every sheet into the (print-only) sheet list. */
function fillSheets(api, lay) {
  const holder = api.root.querySelector('.print-sheet');
  if (holder) holder.innerHTML = lay.sheets.map((_, i) => `<div class="print-page">${svgOf(api, lay, i)}</div>`).join('');
  setPageStyle(lay);
}

/**
 * The printer a job goes to when it writes a file instead of printing (port PORTPROMPT:/FILE: — Microsoft
 * Print to PDF, the XPS writer), else ''. WebView2 cannot print to those without their file dialog.
 */
function filePrinterOf(api) {
  const u = ui(api);
  const list = u.printers?.filePrinters ?? [];
  const name = job(api, layout(api)).printer || u.printers?.defaultPrinter || '';
  return list.includes(name) ? name : '';
}

async function doPrint(api) {
  const lay = layout(api);
  const toFile = api.desktop && !window.__mysketchbookPrintHook ? filePrinterOf(api) : '';
  // A PDF printer: the same sheets saved as a PDF where the user chooses (what the printer would ask for).
  if (toFile && /pdf/i.test(toFile)) { await savePdf(api); return; }
  await withBusy(api, api.t('print3d.preparing'), async () => {
    await allPictures(api, lay);
    fillSheets(api, lay);
    const j = job(api, lay);
    try {
      if (window.__mysketchbookPrintHook) await window.__mysketchbookPrintHook(lay, j);
      else if (api.desktop && ui(api).printers?.printers.length && !toFile) await native.printDirect(j);
      else await native.printWindow();
      api.action('notice', { kind: 'success', text: api.t('notice.printed') });
    } catch (error) {
      api.action('report-error', { titleKey: 'error.print', message: native.errorText(error), context: 'print' });
    }
  });
}

// ───────────────────────── PDF

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

/** The sheets as a PDF of pictures (the web's Save as PDF; the desktop's fallback). */
export async function rasterPdf(api, lay) {
  const dpi = Math.min(200, ui(api).setup.dpi);
  const { width, height } = lay.geometry;
  const w = Math.round((width / 25.4) * dpi);
  const h = Math.round((height / 25.4) * dpi);
  const pages = [];
  for (let i = 0; i < lay.sheets.length; i++) {
    const svg = svgOf(api, lay, i).replace(/^<svg([^>]*?) width="\d+" height="\d+"/, `<svg$1 width="${w}" height="${h}"`);
    pages.push({ jpeg: await svgToJpeg(svg, w, h), width: w, height: h, widthMm: width, heightMm: height });
  }
  return pdfFromJpegPages(pages, { title: info(api).name ?? '' });
}

function toBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

async function savePdf(api) {
  const lay = layout(api);
  const name = `${(ui(api).setup.titleText || info(api).name || 'MySketchBook').replace(/[\\/:*?"<>|]+/g, '_')}.pdf`;
  await withBusy(api, api.t('print3d.preparing'), async () => {
    await allPictures(api, lay);
    try {
      if (window.__mysketchbookPdfHook) { await window.__mysketchbookPdfHook(lay, await rasterPdf(api, lay)); return; }
      if (!api.desktop) { api.action('print-save-pdf', { name, base64: toBase64(await rasterPdf(api, lay)) }); return; }
      const dir = api.s().lastDirectory;
      let path = await native.chooseSavePath(dir ? `${dir}/${name}` : name, ['pdf']);
      if (!path) return;
      if (!/\.pdf$/i.test(path)) path += '.pdf';
      fillSheets(api, lay);
      try {
        await native.invoke('print_pages_to_pdf', { job: job(api, lay), path });
      } catch {
        await native.writeBase64File(path, toBase64(await rasterPdf(api, lay)), 'print-pdf');
      }
      api.action('notice', { kind: 'success', text: api.t('notice.exported', { name: path.split(/[\\/]/).pop() }) });
    } catch (error) {
      api.action('report-error', { titleKey: 'error.print', message: native.errorText(error), context: 'print' });
    }
  });
}

// ───────────────────────── popup.js hooks

/** Draws the print window; false for other popups. */
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
    if (target.dataset.printPick) { u.picked = { ...u.picked, [target.dataset.printPick]: target.checked }; api.render(); return true; }
    if (target.dataset.printKey) { change(api, { [target.dataset.printKey]: target.value }); return true; }
    if (target.dataset.printText) { change(api, { [target.dataset.printText]: target.value.trim() }); return true; }
    return false;
  }
  if (type === 'input') return Boolean(target.dataset.printText);
  switch (target.dataset?.action) {
    case 'print-set': { const v = target.dataset.value; change(api, { [target.dataset.key]: /^\d+$/.test(v) ? Number(v) : v }); return true; }
    case 'print-group': {
      const key = target.dataset.key;
      const type = { includeView: 'view', includePlans: 'plan', includeScenes: 'scene', includeSummary: 'summary' }[key];
      u.picked = Object.fromEntries(Object.entries(u.picked).filter(([k]) => !(k === type || k.startsWith(`${type}:`))));
      change(api, { [key]: !u.setup[key] });
      return true;
    }
    case 'print-page': turn(api, Number(target.dataset.value)); return true;
    case 'print-go': doPrint(api); return true;
    case 'print-pdf': savePdf(api); return true;
    default: return false;
  }
}

/** Pictures from the main window. */
export function printHostMessage(kind, message, api) {
  if (kind !== 'print' || message?.type !== 'print-image') return false;
  const u = ui(api);
  if (message.url) u.images.set(message.key, message.url);
  else u.failed.set(message.key, message.error ?? 'error');
  u.waiters = u.waiters.filter((check) => !check());
  if (!u.busy) drawPreview(api);
  return true;
}
