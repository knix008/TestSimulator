// The report window and the print window (popup kinds 'report' and 'print'), drawn by popup.js's page.
//   report — which sections to include, a live preview, and saving as Markdown / HTML / Word / PDF (+ CSV);
//   print  — its own window: printer, copies, paper, orientation, margins, text size, colour, header / footer,
//            page range and sections on the left, a preview of the exact pages on the right. Print sends the
//            pages straight to the chosen printer (desktop, WebView2, no dialog) or to the browser's print (web).
// Both get the report model (src/report/content.js) with its pictures from the main window.
import * as native from './platform/native.js';
import { pickSections } from './report/content.js';
import { MARGINS, PAPERS, paginate, paperMm } from './report/paginate.js';
import { toHtml } from './report/writers.js';

const FORMATS = [['md', 'notes', 'Markdown', '.md'], ['html', 'htmlFile', 'HTML', '.html'], ['docx', 'docFile', 'Word', '.docx'], ['pdf', 'pdfFile', 'PDF', '.pdf']];
const SECTION_ICONS = { overview: 'info', layout2d: 'view2d', view3d: 'view3dBox', kpis: 'fChart', diagnosis: 'bottleneck', tables: 'table', charts: 'fChart', sd: 'fStock', experiment: 'experiment' };
const DEFAULT_SETUP = { paper: 'A4', orientation: 'portrait', margin: 'normal', scale: 100, grayscale: false, header: true, footer: true, copies: 1, printer: '', from: 1, to: 0 };

/** The report with its pictures; asks the main window for them the first time (null until they arrive). */
function docOf(api, kind) {
  const p = api.P();
  if (!p.doc) return null;
  const images = api.state.images;
  if (!images) {
    if (!api.state.askedImages) { api.state.askedImages = true; api.action('report-images', { kind }); }
    return null;
  }
  return { ...p.doc, blocks: p.doc.blocks.map((b) => (b.t === 'image' ? { ...b, src: images[b.src] ?? '' } : b)).filter((b) => b.t !== 'image' || b.src) };
}
/** The main window's answer to 'report-images'. */
export function reportHostMessage(kind, message, api) {
  if ((kind !== 'report' && kind !== 'print') || message?.type !== 'report-images') return false;
  api.state.images = message.images ?? {};
  api.state.pagesKey = null;
  api.render();
  return true;
}

const sectionsOf = (api) => {
  const st = api.state;
  if (!st.sections) {
    const p = api.P();
    const present = new Set((p.doc?.blocks ?? []).map((b) => b.section));
    st.sections = (p.sections ?? []).filter((s) => present.has(s));
  }
  return st.sections;
};
const presentSections = (api) => { const p = api.P(); const present = new Set((p.doc?.blocks ?? []).map((b) => b.section)); return (p.sections ?? []).filter((s) => present.has(s)); };
const sectionChecks = (api) => {
  const { t, icon, escapeHtml: e } = api;
  const chosen = sectionsOf(api);
  return `<div class="rp-sections">${presentSections(api).map((id) => `<label class="rp-check"><input type="checkbox" data-rp-section="${id}" ${chosen.includes(id) ? 'checked' : ''}/>${icon(SECTION_ICONS[id] ?? 'info')}<span>${e(t(`report.section.${id}`))}</span></label>`).join('')}</div>`;
};

// ───────────────────────── report window

export function renderReportWindow(api) {
  const { t, P, frame, button, icon, escapeHtml: e } = api;
  const p = P();
  const full = docOf(api, 'report');
  const doc = full ? pickSections(full, sectionsOf(api)) : null;
  const html = doc ? toHtml(doc, api.L()) : `<p style="font-family:sans-serif;color:#6b7280;padding:24px">${e(t('print.laying'))}</p>`;
  const formats = FORMATS.map(([id, glyph, label, ext]) => `<button class="rp-format" data-action="report-format" data-value="${id}" title="${e(t('report.saveAs', { format: label }))}">${icon(glyph)}<b>${e(label)}</b><small>${e(ext)}</small></button>`).join('');
  api.root.innerHTML = frame({
    glyph: 'report', title: `${t('report.title')} — ${p.name ?? ''}`,
    body: `<div class="rp-layout">
      <aside class="rp-side">
        <h3>${icon('list')}<span>${e(t('report.include'))}</span></h3>${sectionChecks(api)}
        <h3>${icon('save')}<span>${e(t('report.formats'))}</span></h3><div class="rp-formats">${formats}</div>
        <p class="rp-hint">${icon('info')}<span>${e(t('report.imagesHint'))}</span></p>
      </aside>
      <iframe class="rp-preview" title="${e(t('report.preview'))}" srcdoc="${e(html)}"></iframe>
    </div>`,
    foot: `${button('report-csv', t('report.csv'), 'csvFile')}<span class="grow"></span>${button('report-print', t('action.print'), 'print')}${button('close', t('common.done'), 'check', 'primary')}`,
  });
  api.ready();
}

// ───────────────────────── print window

const setupOf = (api) => {
  api.state.setup ??= { ...DEFAULT_SETUP, ...(api.P().setup ?? {}) };
  return api.state.setup;
};

async function layoutPages(api) {
  const st = api.state;
  const full = docOf(api, 'print');
  if (!full) return;
  const setup = setupOf(api);
  const key = JSON.stringify([sectionsOf(api), setup.paper, setup.orientation, setup.margin, setup.scale, setup.grayscale, setup.header, setup.footer]);
  if (st.pagesKey === key) return;
  st.pagesKey = key; st.laying = true;
  const gen = (st.gen = (st.gen ?? 0) + 1);
  const result = await paginate(pickSections(full, sectionsOf(api)), { ...setup, scale: setup.scale / 100 });
  if (gen !== st.gen) return;
  st.pages = result.pages.map((c) => c.toDataURL('image/png'));
  st.size = [result.widthMm, result.heightMm];
  st.laying = false;
  if (!setup.to || setup.to > st.pages.length) setup.to = st.pages.length;
  setup.from = Math.min(Math.max(1, setup.from), st.pages.length);
  api.render();
}

export function renderPrintWindow(api) {
  const { t, P, frame, button, icon, escapeHtml: e } = api;
  const st = api.state; const p = P();
  const setup = setupOf(api);
  if (!st.printersAsked) {
    st.printersAsked = true;
    native.listPrinters().then((list) => { st.printers = list.printers ?? []; st.filePrinters = list.filePrinters ?? []; st.defaultPrinter = list.defaultPrinter ?? ''; api.render(); }).catch(() => { st.printers = []; api.render(); });
  }
  layoutPages(api);
  const pages = st.pages ?? [];
  const [wMm, hMm] = st.size ?? paperMm(setup);
  const from = Math.max(1, Math.min(setup.from || 1, pages.length || 1)); const to = Math.max(from, Math.min(setup.to || pages.length, pages.length || 1));
  const printing = pages.length ? (to - from + 1) * Math.max(1, setup.copies) : 0;
  const printers = st.printers ?? null;
  const printerSelect = printers === null
    ? `<select disabled><option>${e(t('print.finding'))}</option></select>`
    : printers.length
      ? `<select data-ps="printer"><option value="">${e(st.defaultPrinter ? t('print.defaultPrinter', { name: st.defaultPrinter }) : t('print.defaultPrinterNone'))}</option>${printers.map((n) => `<option value="${e(n)}" ${n === setup.printer ? 'selected' : ''}>${e(n)}</option>`).join('')}</select>`
      : `<select disabled><option>${e(t(api.desktop ? 'print.systemDialog' : 'print.browserDialog'))}</option></select>`;
  const seg = (key, options) => `<span class="segmented">${options.map(([v, label, glyph]) => `<button class="segment ${String(setup[key]) === String(v) ? 'active' : ''}" data-action="ps-seg" data-ps-seg="${key}" data-value="${v}">${glyph ? icon(glyph) : ''}${e(label)}</button>`).join('')}</span>`;
  const field = (glyph, label, control) => `<div class="ps-field"><span class="ps-label">${icon(glyph)}<span>${e(label)}</span></span>${control}</div>`;
  const preview = pages.length
    ? pages.map((src, i) => `<figure class="ps-page ${i + 1 >= from && i + 1 <= to ? '' : 'skipped'}" style="aspect-ratio:${wMm} / ${hMm}"><img src="${src}" alt="${i + 1}"/><figcaption>${i + 1} / ${pages.length}</figcaption></figure>`).join('')
    : `<div class="ps-wait">${icon('hourglass')}<span>${e(t(p.doc ? 'print.laying' : 'print.nothing'))}</span></div>`;
  api.root.innerHTML = frame({
    glyph: 'print', title: `${t('print.title')} — ${p.name ?? ''}`,
    body: `<div class="ps-layout">
      <aside class="ps-side">
        ${field('print', t('print.printer'), printerSelect)}
        <div class="ps-pair">${field('duplicate', t('print.copies'), `<input type="number" data-ps="copies" min="1" max="99" step="1" value="${setup.copies}" data-unit="${e(t('print.copiesUnit'))}"/>`)}${field('textTool', t('print.textSize'), `<input type="number" data-ps="scale" min="60" max="160" step="10" value="${setup.scale}" data-unit="%"/>`)}</div>
        ${field('fileNew', t('print.paper'), `<select data-ps="paper">${Object.keys(PAPERS).map((k) => `<option value="${k}" ${k === setup.paper ? 'selected' : ''}>${k} (${PAPERS[k][0]} × ${PAPERS[k][1]} mm)</option>`).join('')}</select>`)}
        <div class="ps-pair">${field('rotateRight', t('print.orientation'), seg('orientation', [['portrait', t('print.portrait')], ['landscape', t('print.landscape')]]))}${field('palette', t('print.color'), seg('grayscale', [['false', t('print.colorOn')], ['true', t('print.grayscale')]]))}</div>
        ${field('autoSize', t('print.margins'), seg('margin', Object.keys(MARGINS).map((k) => [k, `${t(`print.margin.${k}`)} ${MARGINS[k]}mm`])))}
        ${field('list', t('print.headerFooter'), `<span class="ps-row"><label class="rp-check"><input type="checkbox" data-ps-check="header" ${setup.header ? 'checked' : ''}/><span>${e(t('print.header'))}</span></label><label class="rp-check"><input type="checkbox" data-ps-check="footer" ${setup.footer ? 'checked' : ''}/><span>${e(t('print.footer'))}</span></label></span>`)}
        ${field('report', t('print.range'), `<span class="ps-row ps-range"><input type="number" data-ps="from" min="1" max="${pages.length || 1}" step="1" value="${from}" data-unit="${e(t('print.pageUnit'))}"/><span>–</span><input type="number" data-ps="to" min="1" max="${pages.length || 1}" step="1" value="${to}" data-unit="${e(t('print.pageUnit'))}"/></span>`)}
        <div class="ps-field ps-sections"><span class="ps-label">${icon('layers')}<span>${e(t('report.include'))}</span></span>${sectionChecks(api)}</div>
        <div class="ps-info">
          <div><span>${e(t('print.sheetSize'))}</span><b>${wMm.toFixed(0)} × ${hMm.toFixed(0)} mm</b></div>
          <div><span>${e(t('print.pageCount'))}</span><b>${pages.length || '…'}</b></div>
          <div><span>${e(t('print.sheets'))}</span><b>${printing || '…'}</b></div>
          <div><span>${e(t('print.target'))}</span><b>${e(setup.printer || st.defaultPrinter || t(api.desktop ? 'print.systemDialog' : 'print.browserDialog'))}</b></div>
        </div>
        ${st.status ? `<p class="ps-status ${st.statusKind ?? ''}">${e(st.status)}</p>` : ''}
      </aside>
      <div class="ps-preview" aria-label="${e(t('report.preview'))}">${preview}</div>
    </div>`,
    foot: `${button('print-pdf', t('print.savePdf'), 'pdfFile')}<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('print-go', t('print.go'), 'print', 'primary', '', pages.length ? '' : 'disabled')}`,
  });
  api.ready();
}

/** Prints the chosen pages: straight to the printer on the desktop, the browser's print on the web. */
async function printNow(api) {
  const st = api.state; const setup = setupOf(api);
  const pages = st.pages ?? []; if (!pages.length) return;
  const [wMm, hMm] = st.size;
  const from = Math.max(1, setup.from || 1); const to = Math.min(pages.length, setup.to || pages.length);
  let sheet = document.getElementById('ps-print-sheets');
  if (!sheet) { sheet = document.createElement('div'); sheet.id = 'ps-print-sheets'; document.body.append(sheet); }
  sheet.innerHTML = pages.slice(from - 1, to).map((src) => `<img src="${src}" style="width:${wMm}mm;height:${hMm}mm"/>`).join('');
  await Promise.all([...sheet.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))));
  let style = document.getElementById('ps-page-style');
  if (!style) { style = document.createElement('style'); style.id = 'ps-page-style'; document.head.append(style); }
  style.textContent = `@page { size: ${wMm}mm ${hMm}mm; margin: 0; }`;
  api.action('print-setup', { setup });
  const direct = api.desktop && (st.printers?.length ?? 0) > 0 && !(st.filePrinters ?? []).includes(setup.printer);
  st.status = t(api, 'print.sending'); st.statusKind = ''; api.render();
  try {
    if (direct) await native.printDirect({ printer: setup.printer, copies: Math.max(1, setup.copies), widthMm: wMm, heightMm: hMm });
    else if (api.desktop) await native.printWindow();
    else window.print();
    st.status = t(api, 'print.sent', { n: (to - from + 1) * Math.max(1, setup.copies) }); st.statusKind = 'ok';
  } catch (error) {
    st.status = `${t(api, 'print.failed')}: ${native.errorText?.(error) ?? String(error)}`; st.statusKind = 'error';
  }
  api.render();
}
const t = (api, key, params) => api.t(key, params);

/** Clicks, changes and inputs of the report and print windows; true when handled. */
export function reportPopupAction(kind, target, api, type = 'click') {
  if (kind !== 'report' && kind !== 'print') return false;
  const action = target.dataset?.action;
  if (type === 'change' && target.dataset?.rpSection) {
    const id = target.dataset.rpSection; const cur = sectionsOf(api);
    api.state.sections = target.checked ? presentSections(api).filter((s) => s === id || cur.includes(s)) : cur.filter((s) => s !== id);
    api.render(); return true;
  }
  if (kind === 'report') {
    if (type === 'click' && action === 'report-format') { api.action('report-save', { format: target.dataset.value, sections: sectionsOf(api) }); return true; }
    if (type === 'click' && action === 'report-print') { api.action('open-print'); return true; }
    if (type === 'click' && action === 'report-csv') { api.action('report-save-csv'); return true; }
    return false;
  }
  const setup = setupOf(api);
  if (type === 'click' && target.dataset?.psSeg) { const k = target.dataset.psSeg; setup[k] = k === 'grayscale' ? target.dataset.value === 'true' : target.dataset.value; api.render(); return true; }
  if ((type === 'change') && target.dataset?.psCheck) { setup[target.dataset.psCheck] = target.checked; api.render(); return true; }
  if ((type === 'change' || type === 'input') && target.dataset?.ps) {
    const k = target.dataset.ps;
    const v = ['copies', 'scale', 'from', 'to'].includes(k) ? Number(target.value) || DEFAULT_SETUP[k] : target.value;
    setup[k] = k === 'copies' ? Math.max(1, Math.min(99, v)) : k === 'scale' ? Math.max(60, Math.min(160, v)) : v;
    if (type === 'change') api.render();
    return true;
  }
  if (type === 'click' && action === 'print-go') { printNow(api); return true; }
  if (type === 'click' && action === 'print-pdf') { api.action('print-save-pdf', { setup: { ...setup, scale: setup.scale / 100 }, sections: sectionsOf(api) }); return true; }
  return false;
}
