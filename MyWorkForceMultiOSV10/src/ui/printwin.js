// The print window (index.html?tool=print): a window of its own with the printer and page setup on the left and
// a live preview of the pages on the right; Print, Save as PDF and Close below. Ported from MyBoard's print
// window (printer list, direct printing and PDF through src-tauri/src/printing.rs), for any content the main
// window hands over: a document, a page or the screen in view (see printContent in app.js).
//
// The content arrives through localStorage ('myworkforce-print-content'); a new print from the main window while
// this window is open replaces it (the 'storage' event). Pages are laid out here by measuring the content at the
// paper's width, so the preview and the paper are the same pages.

import { L } from '../i18n.js';
import { listPrinters, printDirect, printPagesToPdf, printWindow, chooseSave, closeThisWindow, errorText, isDesktop } from '../platform/native.js';
import { esc, icon } from './bits.js';

export const PRINT_CONTENT_KEY = 'myworkforce-print-content';
const SETUP_KEY = 'myworkforce-print-setup';

export const PAPERS = {
  A3: [297, 420], A4: [210, 297], A5: [148, 210], B4: [250, 353], B5: [176, 250],
  Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8],
};
export const MARGIN_PRESETS = { none: 0, narrow: 8, normal: 15, wide: 25 };
const HEAD_MM = 9;
const FOOT_MM = 8;
const PX_PER_MM = 96 / 25.4;

export function defaultSetup() {
  return {
    printer: '', copies: 1, paper: 'A4', orientation: 'portrait', margin: 'normal',
    custom: { top: 15, right: 15, bottom: 15, left: 15 }, scale: 100, color: 'color',
    header: true, footer: true, date: true, range: 'all', from: 1, to: 1, pages: '',
  };
}

function loadSetup() {
  try { return { ...defaultSetup(), ...(JSON.parse(localStorage.getItem(SETUP_KEY) || '{}') || {}) }; } catch { return defaultSetup(); }
}
function storeSetup(setup) { try { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)); } catch { /* storage off */ } }
function loadContent() {
  try { return JSON.parse(localStorage.getItem(PRINT_CONTENT_KEY) || 'null'); } catch { return null; }
}

/** Paper size (after orientation), margins and the content box, in millimetres. */
export function geometryOf(setup) {
  const [w, h] = PAPERS[setup.paper] || PAPERS.A4;
  const landscape = setup.orientation === 'landscape';
  const width = landscape ? h : w;
  const height = landscape ? w : h;
  const preset = MARGIN_PRESETS[setup.margin];
  const clamp = (value) => Math.max(0, Math.min(60, Number(value) || 0));
  const margins = setup.margin === 'custom'
    ? { top: clamp(setup.custom?.top), right: clamp(setup.custom?.right), bottom: clamp(setup.custom?.bottom), left: clamp(setup.custom?.left) }
    : { top: preset ?? 15, right: preset ?? 15, bottom: preset ?? 15, left: preset ?? 15 };
  const head = setup.header ? HEAD_MM : 0;
  const foot = setup.footer ? FOOT_MM : 0;
  return {
    width, height, margins, head, foot,
    inner: { width: Math.max(20, width - margins.left - margins.right), height: Math.max(20, height - margins.top - margins.bottom - head - foot) },
  };
}

/** "1-3, 5" → [1, 2, 3, 5] (1-based, inside 1..total); empty or wrong → every page. */
export function pagesInRange(text, total) {
  const out = new Set();
  for (const part of String(text || '').split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) continue;
    const a = Number(match[1]);
    const b = match[2] ? Number(match[2]) : a;
    for (let n = Math.min(a, b); n <= Math.max(a, b); n += 1) if (n >= 1 && n <= total) out.add(n);
  }
  return out.size ? [...out].sort((x, y) => x - y) : Array.from({ length: total }, (_, i) => i + 1);
}

// ───────────────────────── layout

/**
 * Splits the content into pages: each top-level block goes on the current page if it fits; a table or list that
 * does not fit continues on the next page (a table repeats its header); anything else taller than a page is shown
 * in slices, one page-height each.
 */
function layout(content, setup) {
  const g = geometryOf(setup);
  if (!content) return { pages: [], geometry: g };
  const zoom = Math.max(0.3, Math.min(3, (Number(setup.scale) || 100) / 100));
  const room = (g.inner.height * PX_PER_MM) / zoom;
  const measure = document.createElement('div');
  measure.className = 'pp-measure md';
  measure.style.width = `${(g.inner.width * PX_PER_MM) / zoom}px`;
  measure.innerHTML = content.html || '';
  document.body.append(measure);
  // Wrappers without their own look are opened so their children pack one by one.
  let blocks = [...measure.children];
  for (let pass = 0; pass < 3; pass += 1) {
    blocks = blocks.flatMap((el) => (el.tagName === 'DIV' && !el.className && el.children.length > 1 ? [...el.children] : [el]));
  }
  const pages = [];
  let page = [];
  let used = 0;
  const flush = () => { if (page.length) pages.push(page.join('')); page = []; used = 0; };
  const outer = (el) => {
    const style = getComputedStyle(el);
    return el.getBoundingClientRect().height + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
  };
  for (const el of blocks) {
    const h = outer(el);
    if (used + h <= room) { page.push(el.outerHTML); used += h; continue; }
    if (el.tagName === 'TABLE' && el.tBodies[0]?.rows.length > 1) {
      // Rows flow over pages; the header row comes along on each.
      const head = el.tHead ? el.tHead.outerHTML : '';
      const headH = el.tHead ? el.tHead.getBoundingClientRect().height : 0;
      const rows = [...el.tBodies[0].rows];
      let chunk = [];
      let chunkH = headH;
      const open = el.outerHTML.slice(0, el.outerHTML.indexOf('>') + 1);
      const emit = () => { if (chunk.length) { page.push(`${open}${head}<tbody>${chunk.join('')}</tbody></table>`); used += chunkH; } chunk = []; chunkH = headH; };
      for (const row of rows) {
        const rh = row.getBoundingClientRect().height;
        if (used + chunkH + rh > room && (chunk.length || page.length)) { emit(); flush(); }
        chunk.push(row.outerHTML);
        chunkH += rh;
      }
      emit();
      continue;
    }
    if ((el.tagName === 'UL' || el.tagName === 'OL') && el.children.length > 1) {
      const items = [...el.children];
      const tag = el.tagName.toLowerCase();
      let start = Number(el.getAttribute('start') || 1);
      let chunk = [];
      let chunkH = 0;
      const emit = () => { if (chunk.length) { page.push(`<${tag}${tag === 'ol' ? ` start="${start}"` : ''}>${chunk.join('')}</${tag}>`); used += chunkH; start += chunk.length; } chunk = []; chunkH = 0; };
      for (const item of items) {
        const ih = outer(item);
        if (used + chunkH + ih > room && (chunk.length || page.length)) { emit(); flush(); }
        chunk.push(item.outerHTML);
        chunkH += ih;
      }
      emit();
      continue;
    }
    if (page.length) flush();
    if (h <= room) { page.push(el.outerHTML); used = h; continue; }
    // Taller than a page: one slice per page.
    for (let top = 0; top < h; top += room) {
      pages.push(`<div class="pp-slice" style="height:${room}px"><div style="margin-top:${-top}px">${el.outerHTML}</div></div>`);
    }
  }
  flush();
  measure.remove();
  return { pages, geometry: g, zoom };
}

/** One sheet: header, content and footer, sized in millimetres. */
function pageHtml(lay, index, total, setup, content) {
  const g = lay.geometry;
  const date = new Date(content?.at || Date.now()).toLocaleDateString(content?.lang === 'en' ? 'en-US' : 'ko-KR');
  const head = setup.header ? `<header class="pp-head" style="height:${g.head}mm"><b>${esc(content?.title || '')}</b><span class="grow"></span><span>${esc(content?.subtitle || '')}</span></header>` : '';
  const foot = setup.footer ? `<footer class="pp-foot" style="height:${g.foot}mm"><span>MyWorkForce</span><span class="grow"></span>${setup.date ? `<span>${esc(date)}</span><span class="grow"></span>` : ''}<span>${esc(L(`${index + 1} / ${total} 쪽`, `Page ${index + 1} of ${total}`))}</span></footer>` : '';
  const m = g.margins;
  return `<div class="pp-page${setup.color === 'grey' ? ' grey' : ''}" style="width:${g.width}mm;height:${g.height}mm;padding:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm">${head}<main class="pp-body md" style="zoom:${lay.zoom}">${lay.pages[index]}</main>${foot}</div>`;
}

// ───────────────────────── the window

const state = { setup: loadSetup(), content: loadContent(), printers: null, busy: '', lay: null, fit: true, zoom: 1 };

function chosenPages(lay) {
  const total = lay.pages.length;
  if (state.setup.range === 'pages') return pagesInRange(state.setup.pages, total);
  if (state.setup.range === 'current') return [Math.min(total, Math.max(1, state.current || 1))];
  return Array.from({ length: total }, (_, i) => i + 1);
}

function seg(key, options, current) {
  return `<span class="segmented" role="radiogroup">${options.map(([value, label, glyph]) => `<button type="button" class="segment${String(current) === String(value) ? ' active' : ''}" role="radio" aria-checked="${String(current) === String(value)}" data-set="${key}" data-value="${esc(value)}">${glyph ? icon(glyph) : ''}<span>${esc(label)}</span></button>`).join('')}</span>`;
}

function row(glyph, label, control) {
  return `<label class="pw-row"><span class="pw-label">${icon(glyph)}<span>${esc(label)}</span></span><span class="pw-control">${control}</span></label>`;
}

function render() {
  const o = state.setup;
  const list = state.printers || { printers: [], defaultPrinter: '', filePrinters: [] };
  const printerRow = list.printers.length
    ? `<select data-key="printer"><option value="">${esc(L(`기본 프린터 (${list.defaultPrinter || '-'})`, `Default printer (${list.defaultPrinter || '-'})`))}</option>${list.printers.map((name) => `<option value="${esc(name)}" ${o.printer === name ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select>`
    : `<span class="muted pw-note">${esc(isDesktop() ? L('프린터 목록을 읽지 못하면 인쇄할 때 시스템 인쇄 창이 열립니다.', 'If the printers cannot be listed, Print opens the system print dialog.') : L('인쇄를 누르면 브라우저의 인쇄 창에서 프린터를 고릅니다.', 'Print opens the browser print dialog, where you choose the printer.'))}</span>`;
  const custom = o.margin === 'custom' ? `<div class="pw-margins">${['top', 'right', 'bottom', 'left'].map((side) => `<label><span>${esc({ top: L('위', 'Top'), right: L('오른쪽', 'Right'), bottom: L('아래', 'Bottom'), left: L('왼쪽', 'Left') }[side])}</span><input type="number" min="0" max="60" step="1" data-margin="${side}" value="${esc(o.custom?.[side] ?? 15)}"><small>mm</small></label>`).join('')}</div>` : '';
  const range = `${seg('range', [['all', L('모두', 'All')], ['current', L('현재 쪽', 'Current')], ['pages', L('쪽 지정', 'Pages')]], o.range)}${o.range === 'pages' ? `<input class="pw-pages" data-key="pages" value="${esc(o.pages || '')}" placeholder="${esc(L('예: 1-3, 5', 'e.g. 1-3, 5'))}">` : ''}`;
  document.querySelector('#print-app').innerHTML = `
    <div class="pw">
      <aside class="pw-options">
        <h1>${icon('printer')}<span>${esc(L('인쇄', 'Print'))}</span></h1>
        <p class="muted pw-what">${icon('file')}<span>${esc(state.content?.title || L('인쇄할 내용이 없습니다.', 'Nothing to print.'))}</span></p>
        <section><h2>${icon('printer')}<span>${esc(L('프린터', 'Printer'))}</span></h2>
          ${row('printer', L('프린터', 'Printer'), printerRow)}
          ${row('copy', L('매수', 'Copies'), `<span class="stepper"><button type="button" class="icon-button" data-step="copies" data-value="-1" aria-label="−">−</button><input type="number" min="1" max="99" data-key="copies" value="${esc(o.copies)}"><button type="button" class="icon-button" data-step="copies" data-value="1" aria-label="+">+</button></span>`)}
          ${row('list', L('인쇄 범위', 'Pages'), range)}
        </section>
        <section><h2>${icon('file')}<span>${esc(L('페이지 설정', 'Page setup'))}</span></h2>
          ${row('file', L('용지', 'Paper'), `<select data-key="paper">${Object.entries(PAPERS).map(([id, [w, h]]) => `<option value="${id}" ${o.paper === id ? 'selected' : ''}>${id} (${w} × ${h} mm)</option>`).join('')}</select>`)}
          ${row('file', L('방향', 'Orientation'), seg('orientation', [['portrait', L('세로', 'Portrait'), 'file'], ['landscape', L('가로', 'Landscape'), 'columns']], o.orientation))}
          ${row('layers', L('여백', 'Margins'), `<select data-key="margin">${[['none', L('없음 (0 mm)', 'None (0 mm)')], ['narrow', L('좁게 (8 mm)', 'Narrow (8 mm)')], ['normal', L('보통 (15 mm)', 'Normal (15 mm)')], ['wide', L('넓게 (25 mm)', 'Wide (25 mm)')], ['custom', L('직접 정하기', 'Custom')]].map(([id, label]) => `<option value="${id}" ${o.margin === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`)}
          ${custom}
          ${row('search', L('배율', 'Scale'), `<span class="stepper"><button type="button" class="icon-button" data-step="scale" data-value="-10" aria-label="−">−</button><input type="number" min="30" max="300" step="5" data-key="scale" value="${esc(o.scale)}"><small>%</small><button type="button" class="icon-button" data-step="scale" data-value="10" aria-label="+">+</button></span>`)}
          ${row('palette', L('색', 'Colour'), seg('color', [['color', L('컬러', 'Colour')], ['grey', L('흑백', 'Greyscale')]], o.color))}
        </section>
        <section><h2>${icon('list')}<span>${esc(L('머리글과 바닥글', 'Header and footer'))}</span></h2>
          <label class="check"><input type="checkbox" data-toggle="header" ${o.header ? 'checked' : ''}>${esc(L('머리글 (제목)', 'Header (title)'))}</label>
          <label class="check"><input type="checkbox" data-toggle="footer" ${o.footer ? 'checked' : ''}>${esc(L('바닥글 (쪽 번호)', 'Footer (page numbers)'))}</label>
          <label class="check"><input type="checkbox" data-toggle="date" ${o.date ? 'checked' : ''} ${o.footer ? '' : 'disabled'}>${esc(L('바닥글에 날짜', 'Date in the footer'))}</label>
        </section>
      </aside>
      <section class="pw-preview-wrap">
        <div class="pw-preview-bar">
          <button type="button" class="icon-button" data-page="-1" title="${esc(L('이전 쪽 (PageUp)', 'Previous page (PageUp)'))}">&lt;</button>
          <span id="pw-page" class="pw-page-number"></span>
          <button type="button" class="icon-button" data-page="1" title="${esc(L('다음 쪽 (PageDown)', 'Next page (PageDown)'))}">&gt;</button>
          <span class="grow"></span>
          <button type="button" class="small-button${state.fit ? ' primary' : ''}" data-zoom="fit">${esc(L('폭 맞춤', 'Fit width'))}</button>
          <button type="button" class="small-button${!state.fit && state.zoom === 1 ? ' primary' : ''}" data-zoom="1">100%</button>
        </div>
        <div class="pw-preview" id="pw-preview"></div>
      </section>
    </div>
    <footer class="pw-foot">
      <span id="pw-status" class="muted"></span>
      <span class="grow"></span>
      <button type="button" class="button" data-act="pdf">${icon('download')}<span>${esc(L('PDF로 저장', 'Save as PDF'))}</span></button>
      <button type="button" class="button primary" data-act="print">${icon('printer')}<span>${esc(L('인쇄', 'Print'))}</span></button>
      <button type="button" class="button" data-act="close">${icon('close')}<span>${esc(L('닫기', 'Close'))}</span></button>
    </footer>
    <div class="print-sheet" aria-hidden="true"></div>`;
  drawPreview();
}

/** The pages again (after a setup change), keeping the controls and the focus. */
function drawPreview() {
  const area = document.querySelector('#pw-preview');
  if (!area) return;
  state.lay = layout(state.content, state.setup);
  const lay = state.lay;
  const total = lay.pages.length;
  const chosen = new Set(chosenPages(lay));
  area.innerHTML = !state.content
    ? `<div class="pw-empty">${icon('info')}<span>${esc(L('인쇄할 내용이 없습니다. 메인 창에서 인쇄를 누르세요.', 'Nothing to print. Press Print in the main window.'))}</span></div>`
    : `<div class="pw-stage">${lay.pages.map((_, i) => `<div class="pw-sheet${chosen.has(i + 1) ? '' : ' skipped'}" data-index="${i + 1}">${pageHtml(lay, i, total, state.setup, state.content)}<span class="pw-sheet-number">${i + 1}</span></div>`).join('')}</div>`;
  fitPreview();
  const status = document.querySelector('#pw-status');
  if (status) status.textContent = state.busy || (total ? L(`${total}쪽 · 인쇄할 쪽 ${chosen.size}`, `${total} pages · ${chosen.size} to print`) : '');
  for (const button of document.querySelectorAll('[data-act="print"], [data-act="pdf"]')) button.disabled = !total || Boolean(state.busy);
  updatePageNumber();
}

function fitPreview() {
  const area = document.querySelector('#pw-preview');
  const stage = area?.querySelector('.pw-stage');
  const sheet = stage?.querySelector('.pp-page');
  if (!sheet) return;
  const width = sheet.offsetWidth;
  // The zoom scales the stage padding (48 px) too.
  const zoom = state.fit ? Math.max(0.2, Math.min(2, (area.clientWidth - 8) / (width + 48))) : state.zoom;
  stage.style.zoom = String(zoom);
}

function updatePageNumber() {
  const area = document.querySelector('#pw-preview');
  const total = state.lay?.pages.length || 0;
  let current = 1;
  if (area) {
    const top = area.getBoundingClientRect().top;
    for (const sheet of area.querySelectorAll('.pw-sheet')) {
      if (sheet.getBoundingClientRect().top - top < area.clientHeight / 2) current = Number(sheet.dataset.index);
    }
  }
  state.current = current;
  const label = document.querySelector('#pw-page');
  if (label) label.textContent = total ? L(`${current} / ${total} 쪽`, `Page ${current} of ${total}`) : L('0쪽', '0 pages');
}

function turn(step) {
  const total = state.lay?.pages.length || 0;
  const next = Math.max(1, Math.min(total, (state.current || 1) + step));
  document.querySelector(`.pw-sheet[data-index="${next}"]`)?.scrollIntoView({ block: 'start' });
  state.current = next;
  updatePageNumber();
}

function change(patch, full = false) {
  state.setup = { ...state.setup, ...patch };
  storeSetup(state.setup);
  if (full) render(); else drawPreview();
}

/** The pages to print, into the print-only sheet list, and the paper size for the printer. */
function fillSheets() {
  const lay = state.lay || layout(state.content, state.setup);
  const pages = chosenPages(lay);
  document.querySelector('.print-sheet').innerHTML = pages.map((n) => pageHtml(lay, n - 1, lay.pages.length, state.setup, state.content)).join('');
  let style = document.querySelector('#page-style');
  if (!style) { style = document.createElement('style'); style.id = 'page-style'; document.head.append(style); }
  const { width, height } = lay.geometry;
  // A hair under the paper's height: a page exactly as tall as the sheet can round over and print an empty page.
  style.textContent = `@page { size: ${width}mm ${height}mm; margin: 0; } @media print { .print-sheet .pp-page { width: ${width}mm !important; height: ${height - 0.5}mm !important; } }`;
  return { printer: (state.printers?.printers || []).includes(state.setup.printer) ? state.setup.printer : '', copies: Math.max(1, Math.min(99, Number(state.setup.copies) || 1)), widthMm: width, heightMm: height };
}

async function busy(label, task) {
  state.busy = label;
  drawPreview();
  try { await task(); } finally { state.busy = ''; drawPreview(); }
}

function notice(text, bad = false) {
  const status = document.querySelector('#pw-status');
  if (status) { status.textContent = text; status.classList.toggle('danger-text', bad); }
}

async function doPrint() {
  const list = state.printers || { printers: [], filePrinters: [], defaultPrinter: '' };
  const name = (list.printers.includes(state.setup.printer) ? state.setup.printer : '') || list.defaultPrinter || '';
  // A printer that writes a file (Microsoft Print to PDF): WebView2 cannot print to it without its own dialog.
  if (isDesktop() && list.filePrinters.includes(name) && /pdf/i.test(name)) { await savePdf(); return; }
  await busy(L('인쇄를 준비하는 중…', 'Preparing…'), async () => {
    const job = fillSheets();
    try {
      if (isDesktop() && list.printers.length && !list.filePrinters.includes(name)) await printDirect(job);
      else await printWindow();
      notice(L('인쇄를 보냈습니다.', 'Sent to the printer.'));
    } catch (error) {
      notice(L(`인쇄하지 못했습니다: ${errorText(error)}`, `Printing failed: ${errorText(error)}`), true);
    }
  });
}

async function savePdf() {
  const base = String(state.content?.title || 'MyWorkForce').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'MyWorkForce';
  if (!isDesktop()) { fillSheets(); await printWindow(); return; }
  await busy(L('PDF를 만드는 중…', 'Making the PDF…'), async () => {
    try {
      let path = await chooseSave(`${base}.pdf`, ['pdf']);
      if (!path) return;
      if (!/\.pdf$/i.test(path)) path += '.pdf';
      const job = fillSheets();
      await printPagesToPdf(job, path);
      notice(L(`PDF로 저장했습니다: ${path.split(/[\\/]/).pop()}`, `Saved as PDF: ${path.split(/[\\/]/).pop()}`));
    } catch (error) {
      notice(L(`PDF로 저장하지 못했습니다: ${errorText(error)}`, `Could not save the PDF: ${errorText(error)}`), true);
    }
  });
}

function bind() {
  const app = document.querySelector('#print-app');
  app.addEventListener('click', (event) => {
    const el = event.target.closest('button');
    if (!el) return;
    if (el.dataset.set) { const value = el.dataset.value; change({ [el.dataset.set]: value }, true); return; }
    if (el.dataset.step) {
      const key = el.dataset.step;
      const limits = key === 'copies' ? [1, 99] : [30, 300];
      change({ [key]: Math.max(limits[0], Math.min(limits[1], (Number(state.setup[key]) || 0) + Number(el.dataset.value))) }, true);
      return;
    }
    if (el.dataset.page) { turn(Number(el.dataset.page)); return; }
    if (el.dataset.zoom) { state.fit = el.dataset.zoom === 'fit'; state.zoom = state.fit ? state.zoom : 1; render(); return; }
    if (el.dataset.act === 'print') { doPrint(); return; }
    if (el.dataset.act === 'pdf') { savePdf(); return; }
    if (el.dataset.act === 'close') closeThisWindow();
  });
  app.addEventListener('change', (event) => {
    const el = event.target;
    if (el.dataset.toggle) { change({ [el.dataset.toggle]: el.checked }, true); return; }
    if (el.dataset.margin) { change({ custom: { ...state.setup.custom, [el.dataset.margin]: Number(el.value) } }); return; }
    if (el.dataset.key) {
      const numeric = ['copies', 'scale'].includes(el.dataset.key);
      change({ [el.dataset.key]: numeric ? Number(el.value) : el.value }, el.tagName === 'SELECT');
    }
  });
  app.addEventListener('scroll', (event) => { if (event.target.id === 'pw-preview') updatePageNumber(); }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'PageDown') { event.preventDefault(); turn(1); }
    if (event.key === 'PageUp') { event.preventDefault(); turn(-1); }
    if (event.key === 'Escape') closeThisWindow();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') { event.preventDefault(); doPrint(); }
  });
  window.addEventListener('resize', () => fitPreview());
  // A new print from the main window while this one is open.
  window.addEventListener('storage', (event) => {
    if (event.key === PRINT_CONTENT_KEY) { state.content = loadContent(); render(); }
  });
}

export function startPrintWindow() {
  document.title = `MyWorkForce — ${L('인쇄', 'Print')}`;
  document.body.classList.add('tool-window', 'print-window');
  document.body.innerHTML = '<div id="print-app"></div>';
  bind();
  render();
  listPrinters().then((list) => {
    state.printers = list;
    if (list.printers.length) render();
  }).catch(() => {});
  // The test hook: what a print would send, without a printer.
  globalThis.__mwfPrint = { state, layout: () => state.lay, fillSheets };
}
