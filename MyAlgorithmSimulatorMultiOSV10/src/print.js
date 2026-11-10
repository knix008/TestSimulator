// The print window: printer, paper and a preview of the current algorithm.
// Print sends the sheet straight to the chosen printer on the desktop, and opens
// the browser's print dialog on the web.
import './styles.css';
import './print.css';
import { icon } from './icons.js';
import { setLanguage, t } from './i18n.js';
import { applyTheme, resolveTheme } from './themes.js';
import { getPrintPayload, isDesktop, listPrinters, printDirect } from './platform/native.js';

const PAPERS = {
  A4: { portrait: [210, 297], landscape: [297, 210] },
  Letter: { portrait: [216, 279], landscape: [279, 216] },
};
const root = document.getElementById('print-app');
const params = new URLSearchParams(location.search);
const boot = globalThis.__PRINT__ ?? {};
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const state = {
  doc: null,
  lang: params.get('lang') === 'en' || boot.lang === 'en' ? 'en' : 'ko',
  themeId: params.get('theme') || boot.theme || 'light',
  printer: '',
  printers: [],
  filePrinters: [],
  defaultPrinter: '',
  copies: 1,
  paper: 'A4',
  orientation: 'portrait',
  status: '',
};

function applyLook() {
  setLanguage(state.lang);
  applyTheme(resolveTheme(state.themeId, matchMedia('(prefers-color-scheme: dark)').matches));
  document.documentElement.lang = state.lang;
  document.title = `MyAlgorithmSimulator — ${t('print.title')}`;
}

async function loadDoc() {
  try { state.doc = JSON.parse(await getPrintPayload() || 'null'); } catch { state.doc = null; }
  if (state.doc?.lang === 'en' || state.doc?.lang === 'ko') state.lang = state.doc.lang;
}

function sheetHtml() {
  const doc = state.doc;
  if (!doc) return `<article class="sheet"><p>${esc(t('print.failed'))}</p></article>`;
  const complexity = Object.entries(doc.complexity ?? {}).map(([key, value]) => `<tr><td>${esc(key)}</td><td>${esc(value)}</td></tr>`).join('');
  const vars = Object.entries(doc.vars ?? {}).map(([key, value]) => `<tr><td>${esc(key)}</td><td>${esc(value)}</td></tr>`).join('');
  const pseudo = (doc.pseudo ?? []).map((line, index) => `${String(index + 1).padStart(2, ' ')}  ${line}`).join('\n');
  return `<article class="sheet">
    <h2>${esc(doc.title)}</h2>
    <p class="summary">${esc(doc.summary ?? '')}</p>
    ${doc.image ? `<img src="${doc.image}" alt="">` : ''}
    ${doc.step ? `<p><b>${esc(doc.stepNo)} / ${esc(doc.stepTotal)}</b> ${esc(doc.step)}</p>` : ''}
    <h3>${esc(t('complexity.title') || 'Complexity')}</h3>
    <table>${complexity}</table>
    <p>${esc(doc.traits ?? '')}</p>
    <h3>Input</h3>
    <pre>${esc(doc.input ?? '')}</pre>
    ${vars ? `<h3>Variables</h3><table>${vars}</table>` : ''}
    <h3>Pseudocode</h3>
    <pre>${esc(pseudo)}</pre>
    <p>${esc(doc.description ?? '')}</p>
    <h3>${esc(doc.language ?? '')}</h3>
    <pre>${esc(doc.code ?? '')}</pre>
  </article>`;
}

function render() {
  applyLook();
  const printerOptions = state.printers.length
    ? [`<option value="">${esc(t('print.defaultPrinter'))}${state.defaultPrinter ? ` (${esc(state.defaultPrinter)})` : ''}</option>`, ...state.printers.map((name) => `<option value="${esc(name)}"${name === state.printer ? ' selected' : ''}>${esc(name)}</option>`)].join('')
    : `<option value="">${esc(t('print.systemDialog'))}</option>`;
  root.innerHTML = `<div class="print-shell">
    <header class="print-bar">
      <h1>${icon('print')}<span>${esc(t('print.title'))}</span></h1>
      <span class="grow"></span>
      <span class="print-status">${esc(state.status)}</span>
      <button class="button primary" id="print-go">${icon('print')}<span>${esc(t('print.go'))}</span></button>
    </header>
    <div class="print-body">
      <aside class="print-options">
        <label class="print-field"><span>${esc(t('print.printer'))}</span><select id="print-printer">${printerOptions}</select></label>
        <div class="print-field"><span>${esc(t('print.copies'))}</span><div class="print-copies">
          <button type="button" class="step-btn" id="copies-down" title="${esc(t('nudge.down'))}">${icon('minus')}</button>
          <output id="copies-out">${state.copies}</output>
          <button type="button" class="step-btn" id="copies-up" title="${esc(t('nudge.up'))}">${icon('plus')}</button>
        </div></div>
        <label class="print-field"><span>${esc(t('print.paper'))}</span><select id="print-paper">${Object.keys(PAPERS).map((paper) => `<option${paper === state.paper ? ' selected' : ''}>${paper}</option>`).join('')}</select></label>
        <label class="print-field"><span>${esc(t('print.orientation'))}</span><select id="print-orient">
          <option value="portrait"${state.orientation === 'portrait' ? ' selected' : ''}>${esc(t('print.portrait'))}</option>
          <option value="landscape"${state.orientation === 'landscape' ? ' selected' : ''}>${esc(t('print.landscape'))}</option>
        </select></label>
      </aside>
      <div class="print-preview">${sheetHtml()}</div>
    </div>
  </div>`;
  root.querySelector('#print-printer').onchange = (event) => { state.printer = event.target.value; };
  root.querySelector('#print-paper').onchange = (event) => { state.paper = event.target.value; };
  root.querySelector('#print-orient').onchange = (event) => { state.orientation = event.target.value; };
  root.querySelector('#copies-down').onclick = () => { state.copies = Math.max(1, state.copies - 1); root.querySelector('#copies-out').textContent = String(state.copies); };
  root.querySelector('#copies-up').onclick = () => { state.copies = Math.min(99, state.copies + 1); root.querySelector('#copies-out').textContent = String(state.copies); };
  root.querySelector('#print-go').onclick = printNow;
}

async function printNow() {
  const [widthMm, heightMm] = PAPERS[state.paper][state.orientation];
  const style = document.getElementById('page-style') ?? document.head.appendChild(document.createElement('style'));
  style.id = 'page-style';
  style.textContent = `@page { size: ${widthMm}mm ${heightMm}mm; margin: 12mm; }`;
  const filePrinter = state.filePrinters.includes(state.printer);
  if (isDesktop() && state.printers.length && !filePrinter) {
    try {
      await printDirect({ printer: state.printer, copies: state.copies, widthMm, heightMm });
      state.status = '';
      return;
    } catch (error) {
      state.status = String(error?.message || error || t('print.failed'));
      render();
    }
  }
  window.print();
}

async function bootPrint() {
  await loadDoc();
  try {
    const list = await listPrinters();
    state.printers = list.printers ?? [];
    state.filePrinters = list.filePrinters ?? [];
    state.defaultPrinter = list.defaultPrinter ?? '';
  } catch { /* the web build prints through the browser */ }
  render();
}

window.addEventListener('print-refresh', () => { loadDoc().then(render); });
bootPrint();
