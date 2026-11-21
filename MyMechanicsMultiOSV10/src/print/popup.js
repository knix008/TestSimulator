// The print window (popup kind 'print'): page setup on the left, a live preview of the page on the right,
// Save as PDF / Print / Close below. Runs inside popup.js, which supplies the frame and controls (`api`).
//
// What goes on the page comes from the main window (print/host.js): this window asks for it
// ('print-render') — the drawing's sheet SVG, or a picture of the 3D view at the pixel size of the
// page's picture box (asked again when the paper changes) — and draws the page (print/sheet.js).
// Printing: the desktop app prints straight to a chosen printer (WebView2) or opens the system dialog;
// the web build prints this frame (window.print()). Save as PDF: WebView2's (vector) PDF of the same
// page on the desktop, a PDF of the page as a picture on the web (print/pdf.js).
import * as native from '../platform/native.js';
import { captureSize, drawingPlacement, initialSetup, loadStored, MARGINS, modelBoxes, normalizeSetup, pageGeometry, PAPERS, storeSetup } from './layout.js';
import { pageSvg } from './sheet.js';
import { pdfFromJpegPages } from './pdf.js';
import './print.css';

/** The printer value that means "the system's print dialog". */
export const DIALOG = '*dialog';

function ui(api) {
  const p = api.P();
  let u = api.state.print;
  if (!u || u.at !== p.at) {
    const info = p.info ?? {};
    u = { at: p.at, setup: initialSetup(loadStored(globalThis.localStorage), info), content: new Map(), failed: new Map(), asked: '', gen: 0, printers: null, busy: null, waiters: [] };
    api.state.print = u;
  }
  return u;
}

const info = (api) => api.P().info ?? { mode: 'model', name: '' };
const geometry = (api) => pageGeometry(ui(api).setup);

/** What the page needs from the main window: { type, key, w?, h? }. */
function requestOf(api) {
  const i = info(api);
  if (i.mode === 'drawing') return { type: 'drawing', key: 'drawing' };
  const size = captureSize(modelBoxes(geometry(api)).picture);
  const framing = ui(api).setup.framing;
  return { type: 'model', key: `${size.key}:${framing}`, w: size.w, h: size.h, framing };
}

function contentOf(api) {
  return ui(api).content.get(requestOf(api).key) ?? null;
}

function svgOf(api) {
  const u = ui(api);
  const i = info(api);
  return pageSvg({
    mode: i.mode, geometry: geometry(api), setup: u.setup, content: contentOf(api), info: i, t: api.t,
    date: new Date().toLocaleDateString(api.L() === 'en' ? 'en-US' : 'ko-KR'),
  });
}

/** Asks the main window for the page's content when it is not here yet. */
function ask(api) {
  const u = ui(api);
  const req = requestOf(api);
  if (u.content.has(req.key) || u.failed.has(req.key) || u.asked === req.key) return;
  u.asked = req.key;
  u.gen += 1;
  api.action('print-render', { gen: u.gen, request: req });
}

const seg = (api, key, options, current) => `<span class="segmented" role="radiogroup">${options.map(([value, label, glyph]) => `<button class="segment ${String(current) === String(value) ? 'active' : ''}" role="radio" aria-checked="${String(current) === String(value)}" data-action="print-set" data-key="${key}" data-value="${api.escapeHtml(value)}" title="${api.escapeHtml(label)}">${glyph ? api.icon(glyph) : ''}${api.escapeHtml(label)}</button>`).join('')}</span>`;
const section = (api, glyph, title, rows) => `<section class="print-section"><h3>${api.icon(glyph)}<span>${api.escapeHtml(title)}</span></h3>${rows.filter(Boolean).join('')}</section>`;
const mm = (v) => String(+Number(v).toFixed(1));

/** The printer the job goes to: a name, '' (the default printer) or DIALOG. */
function printerChoice(api) {
  const u = ui(api);
  const list = u.printers?.printers ?? [];
  if (!api.desktop || !list.length) return DIALOG;
  const p = u.setup.printer;
  return p === DIALOG || list.includes(p) ? p : '';
}

function draw(api) {
  const { t, escapeHtml, icon, row, select, numberField, button } = api;
  const u = ui(api);
  const o = u.setup;
  const i = info(api);
  const g = geometry(api);
  if (!u.printers) {
    u.printers = { printers: [], defaultPrinter: '', filePrinters: [] };
    native.listPrinters().then((list) => { u.printers = { filePrinters: [], ...list }; if (list.printers?.length) api.render(); }).catch(() => {});
  }
  const { printers, defaultPrinter } = u.printers;
  const choice = printerChoice(api);
  const printerRows = api.desktop && printers.length
    ? [
      row('print', t('mprint.printer'), select('data-print-key', 'printer', [
        [DIALOG, t('mprint.systemDialog'), 'pageSetup'],
        ['', t('mprint.defaultPrinter', { name: defaultPrinter || '-' }), 'print'],
        ...printers.map((name) => [name, name, 'print']),
      ], choice, t('mprint.printer'))),
      choice !== DIALOG ? row('duplicate', t('mprint.copies'), numberField('print:copies', o.copies, 1, 99, 1, '', t('mprint.copies'))) : '',
    ]
    : [`<div class="row print-note">${icon('info')}<span class="muted">${escapeHtml(t(api.desktop ? 'mprint.systemDialogOnly' : 'mprint.browserDialog'))}</span></div>`];
  const drawing = i.mode === 'drawing';
  let scaleRows = [];
  if (drawing) {
    const place = drawingPlacement(i.sheetW ?? 420, i.sheetH ?? 297, g, o.scale);
    scaleRows = [
      row('scaleTool', t('mprint.scale'), seg(api, 'scale', [['actual', t('mprint.scale.actual')], ['fit', t('mprint.scale.fit')]], o.scale)),
      `<div class="row print-note"><span class="muted">${escapeHtml(t('mprint.sheetInfo', { sheet: i.sheet ?? '', w: mm(i.sheetW), h: mm(i.sheetH), pct: Math.round(place.scale * 1000) / 10 }))}</span></div>`,
      place.clipped ? `<div class="row print-note warn">${icon('warning')}<span>${escapeHtml(t('mprint.clipped'))}</span></div>` : '',
    ];
  } else {
    scaleRows = [
      row('view3d', t('mprint.framing'), seg(api, 'framing', [['screen', t('mprint.framing.screen')], ['model', t('mprint.framing.model')]], o.framing)),
      `<div class="row print-note"><span class="muted">${escapeHtml(t('mprint.modelNote'))}</span></div>`,
    ];
  }
  api.root.innerHTML = api.frame({
    glyph: 'print', title: t('mprint.title'),
    body: `<div class="print-view mprint-view">
      <div class="print-options">
        ${section(api, 'print', t('mprint.sectionPrinter'), printerRows)}
        ${section(api, 'pageSetup', t('mprint.sectionPaper'), [
          row('file', t('mprint.paper'), select('data-print-key', 'paper', Object.keys(PAPERS).map((paper) => [paper, `${paper} (${mm(PAPERS[paper].width)} × ${mm(PAPERS[paper].height)} mm)`, 'file']), o.paper, t('mprint.paper'))),
          row('pageSetup', t('mprint.orientation'), seg(api, 'orientation', [['portrait', t('mprint.portrait')], ['landscape', t('mprint.landscape')]], o.orientation)),
          row('fitPage', t('mprint.margin'), seg(api, 'margin', Object.keys(MARGINS).map((m) => [m, t(`mprint.margin.${m}`)]), o.margin)),
        ])}
        ${section(api, drawing ? 'drawing' : 'view3d', t(drawing ? 'mprint.sectionScale' : 'mprint.sectionPicture'), scaleRows)}
        ${section(api, 'palette', t('mprint.sectionOutput'), [
          row('palette', t('mprint.color'), seg(api, 'color', [['color', t('mprint.color.color')], ['mono', t('mprint.color.mono')]], o.color)),
        ])}
      </div>
      <div class="print-preview" id="print-preview"></div>
    </div>
    <div class="print-sheet" aria-hidden="true"></div>`,
    foot: `<span class="mprint-doc" title="${escapeHtml(i.name ?? '')}">${icon(drawing ? 'drawing' : i.kind === 'assembly' ? 'assembly' : 'part')}<span>${escapeHtml(i.name ?? '')}</span></span>
      <span class="muted print-paper-size" id="print-paper-size">${escapeHtml(`${o.paper} · ${mm(g.width)} × ${mm(g.height)} mm`)}</span>
      <span class="muted print-status" id="print-status"></span>
      <span class="grow"></span>
      ${button('print-pdf', t('mprint.savePdf'), 'exportFile', '', '', u.busy ? 'disabled' : '')}
      ${button('print-go', t('mprint.print'), 'print', 'primary', '', u.busy ? 'disabled' : '')}
      ${button('close', t('common.close'), 'close')}`,
  });
  setPageStyle(g);
  drawPreview(api);
  ask(api);
  if (!u.keys) {
    u.keys = true;
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        event.stopPropagation();
        if (!ui(api).busy) doPrint(api);
      }
    }, true);
    globalThis.addEventListener('resize', () => drawPreview(api));
  }
  api.ready();
}

function setPageStyle(g) {
  let style = document.querySelector('#page-style');
  if (!style) { style = document.createElement('style'); style.id = 'page-style'; document.head.append(style); }
  // A hair under the paper's height: a page exactly as tall as the paper can round over it and print an empty page.
  style.textContent = `@page { size: ${g.width}mm ${g.height}mm; margin: 0; }
@media print { .print-sheet .print-page { width: ${g.width}mm; height: ${g.height - 0.5}mm; } }`;
}

/** Only the preview and the status (content arriving keeps the controls and the focus). */
function drawPreview(api) {
  const u = ui(api);
  const area = api.root.querySelector('#print-preview');
  if (!area) return;
  area.innerHTML = `<div class="preview-stage">${svgOf(api)}</div>`;
  const key = requestOf(api).key;
  const status = api.root.querySelector('#print-status');
  if (status) {
    const failed = u.failed.get(key);
    status.textContent = u.busy ? u.busy : failed ? api.t('mprint.failed', { error: failed }) : u.content.has(key) ? '' : api.t('mprint.preparing');
    status.classList.toggle('error', Boolean(failed) && !u.busy);
  }
  fitPreview(area);
}

function fitPreview(area) {
  const stage = area.querySelector('.preview-stage');
  const svg = stage?.querySelector('svg');
  if (!svg) return;
  const box = area.getBoundingClientRect();
  const w = Number(svg.getAttribute('width'));
  const h = Number(svg.getAttribute('height'));
  const scale = Math.min((box.width - 32) / w, (box.height - 32) / h);
  Object.assign(stage.style, { transform: `scale(${scale})`, width: `${w}px`, height: `${h}px`, left: `${(box.width - w * scale) / 2}px`, top: `${(box.height - h * scale) / 2}px` });
}

function change(api, patch) {
  const u = ui(api);
  u.setup = normalizeSetup({ ...u.setup, ...patch });
  storeSetup(globalThis.localStorage, u.setup, info(api).mode);
  api.render();
}

/** Resolves when the page's content is here (true) or failed / took too long (false). */
function contentReady(api, timeout = 120000) {
  const u = ui(api);
  const key = requestOf(api).key;
  const done = () => u.content.has(key) || u.failed.has(key);
  if (done()) return Promise.resolve(u.content.has(key));
  ask(api);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { u.waiters = u.waiters.filter((w) => w !== check); resolve(false); }, timeout);
    const check = () => { if (!done()) return false; clearTimeout(timer); resolve(u.content.has(key)); return true; };
    u.waiters.push(check);
  });
}

async function withBusy(api, label, task) {
  const u = ui(api);
  u.busy = label;
  api.render();
  try { return await task(); } finally { u.busy = null; api.render(); }
}

function job(api) {
  const u = ui(api);
  const g = geometry(api);
  const choice = printerChoice(api);
  return { printer: choice === DIALOG ? '' : choice, dialog: choice === DIALOG, copies: u.setup.copies ?? 1, widthMm: g.width, heightMm: g.height };
}

/** Puts the page into the (print-only) sheet. */
function fillSheet(api) {
  const holder = api.root.querySelector('.print-sheet');
  if (holder) holder.innerHTML = `<div class="print-page">${svgOf(api)}</div>`;
  setPageStyle(geometry(api));
}

/** A printer that writes a file and asks for its name (Microsoft Print to PDF, the XPS writer), else ''. */
function filePrinterOf(api) {
  const u = ui(api);
  const j = job(api);
  if (j.dialog) return '';
  const name = j.printer || u.printers?.defaultPrinter || '';
  return (u.printers?.filePrinters ?? []).includes(name) ? name : '';
}

async function doPrint(api) {
  const hook = window.__mymechanicsPrintHook;
  const toFile = api.desktop && !hook ? filePrinterOf(api) : '';
  // A PDF printer: the same page saved as a PDF where the user chooses (what that printer would ask for).
  if (toFile && /pdf/i.test(toFile)) { await savePdf(api); return; }
  await withBusy(api, api.t('mprint.preparing'), async () => {
    if (!(await contentReady(api))) { api.action('report-error', { titleKey: 'error.print', message: ui(api).failed.get(requestOf(api).key) ?? api.t('mprint.notReady'), context: 'print' }); return; }
    fillSheet(api);
    const j = job(api);
    try {
      if (hook) await hook(j, api.root.querySelector('.print-sheet')?.innerHTML ?? '');
      else if (api.desktop && !j.dialog && !toFile) await native.printDirect(j);
      else await native.printWindow();
      if (!j.dialog || hook) api.action('notice', { kind: 'success', text: api.t('notice.printed') });
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
    img.onerror = () => reject(new Error('page picture'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** The page as a PDF of one picture (the web's Save as PDF; the desktop's fallback). 200 dpi, long side ≤ 6000 px. */
export async function rasterPdf(api) {
  const g = geometry(api);
  const dpi = Math.min(200, 6000 / (Math.max(g.width, g.height) / 25.4));
  const w = Math.round((g.width / 25.4) * dpi);
  const h = Math.round((g.height / 25.4) * dpi);
  const svg = svgOf(api).replace(/^<svg([^>]*?) width="\d+" height="\d+"/, `<svg$1 width="${w}" height="${h}"`);
  const jpeg = await svgToJpeg(svg, w, h);
  return pdfFromJpegPages([{ jpeg, width: w, height: h, widthMm: g.width, heightMm: g.height }], { title: info(api).name ?? '' });
}

function toBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

async function savePdf(api) {
  const name = `${(info(api).name || 'MyMechanics').replace(/[\\/:*?"<>|]+/g, '_')}.pdf`;
  await withBusy(api, api.t('mprint.preparing'), async () => {
    if (!(await contentReady(api))) { api.action('report-error', { titleKey: 'error.print', message: ui(api).failed.get(requestOf(api).key) ?? api.t('mprint.notReady'), context: 'print' }); return; }
    try {
      if (window.__mymechanicsPdfHook) { await window.__mymechanicsPdfHook(await rasterPdf(api), name); return; }
      if (!api.desktop) { api.action('print-save-pdf', { name, base64: toBase64(await rasterPdf(api)) }); return; }
      const dir = api.s().lastDirectory;
      let path = await native.chooseSavePath(dir ? `${dir}/${name}` : name, ['pdf']);
      if (!path) return;
      if (!/\.pdf$/i.test(path)) path += '.pdf';
      fillSheet(api);
      try {
        await native.invoke('print_pages_to_pdf', { job: job(api), path });
      } catch {
        await native.writeBase64File(path, toBase64(await rasterPdf(api)), 'print-pdf');
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
  if (type === 'stepper') {
    if (target.dataset.stepper !== 'copies') return false;
    change(api, { copies: Number(target.dataset.value) });
    return true;
  }
  if (type === 'change') {
    if (target.dataset.printKey) { change(api, { [target.dataset.printKey]: target.value }); return true; }
    return false;
  }
  if (type === 'input') return false;
  switch (target.dataset?.action) {
    case 'print-set': change(api, { [target.dataset.key]: target.dataset.value }); return true;
    case 'print-go': doPrint(api); return true;
    case 'print-pdf': savePdf(api); return true;
    default: return false;
  }
}

/** Content from the main window. */
export function printHostMessage(kind, message, api) {
  if (kind !== 'print' || message?.type !== 'print-content') return false;
  const u = ui(api);
  if (message.content) u.content.set(message.key, message.content);
  else u.failed.set(message.key, message.error ?? 'error');
  if (u.asked === message.key) u.asked = '';
  u.waiters = u.waiters.filter((check) => !check());
  if (!u.busy) drawPreview(api);
  return true;
}
