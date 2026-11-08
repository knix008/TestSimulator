// The print window: page setup on the left (one column; labels and controls in two aligned columns),
// the document on its paper on the right (page breaks marked, the page count below), and Print /
// Cancel. Print hands the page with the chosen @page size, margins and scale to the system's print
// dialog. On the desktop it is a window of its own (winbridge.js); in the browser a layer over the page.
import { openDialog } from './dialog.js';
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { runInWindow, useWindows } from './winbridge.js';

export const PAPERS = { A4: [210, 297], A3: [297, 420], A5: [148, 210], B5: [176, 250], Letter: [216, 279], Legal: [216, 356] };
export const MARGINS = { normal: 15, narrow: 6, wide: 25, none: 0 };
const PX_PER_MM = 96 / 25.4;
const STORE = 'mytextmaster.print';

/** The print options: the last ones used (a broken or missing value is the default). */
export function loadPrintOptions(storage = globalThis.localStorage) {
  let saved = {};
  try { saved = JSON.parse(storage?.getItem(STORE) ?? '{}') ?? {}; } catch { saved = {}; }
  return {
    paper: PAPERS[saved.paper] ? saved.paper : 'A4',
    landscape: saved.landscape === true,
    margin: MARGINS[saved.margin] !== undefined ? saved.margin : 'normal',
    scale: Number.isFinite(saved.scale) ? Math.min(200, Math.max(50, saved.scale)) : 100,
    background: saved.background !== false,
  };
}

/** The style that makes the page print with these options. */
export function printStyle(o) {
  const [w, h] = PAPERS[o.paper];
  const size = o.landscape ? `${h}mm ${w}mm` : `${w}mm ${h}mm`;
  return `@page { size: ${size}; margin: ${MARGINS[o.margin]}mm; } html { zoom: ${o.scale / 100}; } ${o.background ? 'html, body, * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }' : ''}`;
}

/** The page's HTML with the print style added at the end of its head. */
export const withPrintStyle = (html, o) => (/<\/head>/i.test(html) ? html.replace(/<\/head>/i, `<style data-print>${printStyle(o)}</style></head>`) : `<style data-print>${printStyle(o)}</style>${html}`);

export function openPrint(params) {
  return useWindows() ? runInWindow('print', params, { title: t('print.title'), width: 1080, height: 720, resizable: true, fixed: true }) : renderPrint(params);
}

export async function renderPrint({ html, title }) {
  const o = loadPrintOptions();
  const save = () => { try { globalThis.localStorage?.setItem(STORE, JSON.stringify(o)); } catch { /* private mode */ } };
  const row = (glyph, label, control) => `<div class="print-row"><span class="print-label">${icon(glyph)}<span>${escapeHtml(label)}</span></span><span class="print-control">${control}</span></div>`;
  const select = (key, options) => `<select data-print="${key}">${options.map(([value, label]) => `<option value="${value}" ${String(o[key]) === String(value) ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>`;
  const setup = `<aside class="print-setup">
      <h3 class="print-setup-title">${icon('pageSetup')}<span>${escapeHtml(t('print.setup'))}</span></h3>
      ${row('file', t('print.paper'), select('paper', Object.entries(PAPERS).map(([id, [w, h]]) => [id, `${id} (${w} × ${h} mm)`])))}
      ${row('rotateRight', t('print.orientation'), `<span class="segmented"><button type="button" class="segment ${o.landscape ? '' : 'active'}" data-print-orientation="portrait">${icon('file')}<span>${escapeHtml(t('print.portrait'))}</span></button><button type="button" class="segment ${o.landscape ? 'active' : ''}" data-print-orientation="landscape">${icon('rotateRight')}<span>${escapeHtml(t('print.landscape'))}</span></button></span>`)}
      ${row('columns', t('print.margins'), select('margin', Object.entries(MARGINS).map(([id, mm]) => [id, `${t(`print.margin.${id}`)} (${mm} mm)`])))}
      ${row('zoomIn', t('print.scale'), `<input type="range" min="50" max="200" step="5" value="${o.scale}" data-print="scale"/><output>${o.scale}%</output>`)}
      ${row('palette', t('print.background'), `<label class="switch-wrap"><input type="checkbox" data-print="background" ${o.background ? 'checked' : ''}/><span class="switch"></span></label>`)}
      ${row('reportPages', t('print.pages'), '<b class="print-pages">—</b>')}
      <p class="muted print-note">${icon('info')}<span>${escapeHtml(t('print.note'))}</span></p>
    </aside>`;
  const preview = `<section class="pw-preview" aria-label="${escapeHtml(t('print.preview'))}"><div class="pw-stage"><div class="pw-sheet"><iframe class="pw-page" title="${escapeHtml(title)}" sandbox="allow-same-origin"></iframe><div class="pw-breaks"></div></div></div></section>`;

  let frameReady = null;
  let loaded = false;
  const layout = (box) => {
    const [pw, ph] = PAPERS[o.paper];
    const [w, h] = o.landscape ? [ph, pw] : [pw, ph];
    const m = MARGINS[o.margin];
    const sheet = box.querySelector('.pw-sheet');
    const frame = box.querySelector('.pw-page');
    const stage = box.querySelector('.pw-stage');
    const sheetW = w * PX_PER_MM;
    const pageH = h * PX_PER_MM;
    const printableH = (h - 2 * m) * PX_PER_MM;
    const doc = frame.contentDocument;
    if (!loaded || !doc?.documentElement) return;
    doc.documentElement.style.zoom = String(o.scale / 100);
    frame.style.left = `${m * PX_PER_MM}px`;
    frame.style.top = `${m * PX_PER_MM}px`;
    frame.style.width = `${(w - 2 * m) * PX_PER_MM}px`;
    // (CSS zoom is already in the measured height.) Measured in a 1px-high frame: otherwise the frame's own
    // height (set below for the last page count) is the least scrollHeight, and the count could only grow.
    frame.style.height = '1px';
    const contentH = Math.max(40, doc.documentElement.scrollHeight);
    const pages = Math.max(1, Math.ceil(contentH / printableH));
    frame.style.height = `${pages * printableH}px`;
    sheet.style.width = `${sheetW}px`;
    sheet.style.height = `${pages * pageH}px`;
    sheet.classList.toggle('no-background', !o.background);
    // A dashed line and the page number where each paper ends.
    box.querySelector('.pw-breaks').innerHTML = Array.from({ length: pages }, (_, i) => `<div class="pw-break" style="top:${(i + 1) * pageH}px"><span>${i + 1} / ${pages}</span></div>`).join('');
    // The paper fits the preview's width.
    const fit = Math.min(1, (stage.clientWidth - 40) / sheetW);
    sheet.style.transform = `scale(${fit})`;
    sheet.style.marginBottom = `${-(1 - fit) * pages * pageH}px`;
    box.querySelector('.print-pages').textContent = t('print.pageCount', { n: pages });
  };
  const loadFrame = (box) => {
    const frame = box.querySelector('.pw-page');
    frameReady = new Promise((resolve) => {
      frame.addEventListener('load', () => { loaded = true; layout(box); resolve(); }, { once: true });
      frame.srcdoc = withPrintStyle(html, { ...o, scale: 100 });
    });
  };

  const result = await openDialog({
    id: 'print', title: t('print.title'), icon: 'print', width: 1080, height: 720, className: 'print-dialog',
    body: `<div class="print-layout">${setup}${preview}</div>`,
    buttons: [{ id: 'cancel', label: t('action.cancel'), icon: 'close' }, { id: 'print', label: t('print.print'), icon: 'print', primary: true }],
    onMount: (box) => {
      loadFrame(box);
      new ResizeObserver(() => layout(box)).observe(box.querySelector('.pw-stage'));
      box.addEventListener('change', (event) => {
        const key = event.target.dataset.print;
        if (!key) return;
        o[key] = event.target.type === 'checkbox' ? event.target.checked : key === 'scale' ? Number(event.target.value) : event.target.value;
        save();
        layout(box);
      });
      box.addEventListener('input', (event) => {
        if (event.target.dataset.print !== 'scale') return;
        o.scale = Number(event.target.value);
        event.target.nextElementSibling.textContent = `${o.scale}%`;
        layout(box);
      });
      box.addEventListener('click', (event) => {
        const orientation = event.target.closest('[data-print-orientation]')?.dataset.printOrientation;
        if (!orientation) return;
        o.landscape = orientation === 'landscape';
        save();
        for (const b of box.querySelectorAll('[data-print-orientation]')) b.classList.toggle('active', b.dataset.printOrientation === orientation);
        layout(box);
      });
    },
    onButton: async (id) => {
      if (id !== 'print') return true;
      await frameReady;
      save();
      // The page as it will print, in a frame of its own, through the system's print dialog.
      const job = document.createElement('iframe');
      job.className = 'print-frame';
      job.setAttribute('sandbox', 'allow-same-origin allow-modals');
      document.body.appendChild(job);
      await new Promise((resolve) => { job.addEventListener('load', resolve, { once: true }); job.srcdoc = withPrintStyle(html, o); });
      await new Promise((resolve) => setTimeout(resolve, 150));
      try { job.contentWindow.focus(); job.contentWindow.print(); } finally { setTimeout(() => job.remove(), 1000); }
      return true;
    },
  });
  return result === 'print' ? 'printed' : 'cancel';
}
