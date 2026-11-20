// The print window (popup "print"): a separate, resizable window with a preview of the
// page on the left and the options on the right — paper, orientation, margins, size
// (fit / fill / actual / percent), file-name header, date footer, border. "Print"
// lays the same page out in millimetres (printlayout.js) and hands it to the
// webview's print dialog, where the printer and copies are chosen.
// Options are remembered (localStorage PRINT_KEY) for the next time.
import {
  defaultPrintOptions, MARGINS, ORIENTATIONS, PAPERS, PERCENT, PRINT_KEY, pageRule, printLayout, sanitizePrintOptions, SCALES,
} from './domain/printlayout.js';
import { baseName } from './domain/naming.js';
import { getLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import { escapeHtml } from './ui.js';

const ORIENT_ICONS = { auto: 'pageAuto', portrait: 'portrait', landscape: 'landscape' };
const SCALE_ICONS = { fit: 'fit', fill: 'zoomIn', actual: 'actual', percent: 'sliders' };

export function loadPrintOptions(storage = globalThis.localStorage) {
  try { return sanitizePrintOptions(JSON.parse(storage?.getItem(PRINT_KEY) ?? 'null')); } catch { return sanitizePrintOptions(null); }
}
function storePrintOptions(options, storage = globalThis.localStorage) {
  try { storage?.setItem(PRINT_KEY, JSON.stringify(options)); } catch { /* the next print starts from the defaults */ }
}

const fixed = (value, digits = 0) => Number(value).toFixed(digits);
const today = () => new Date().toLocaleString(getLanguage() === 'en' ? 'en-US' : 'ko-KR', { dateStyle: 'medium', timeStyle: 'short' });

/** The page's content (header, image, footer) positioned in millimetres: used for print. */
export function sheetHtml(layout, { url, name, date }) {
  const { page, image, options, area } = layout;
  const mm = (value) => `${fixed(value, 3)}mm`;
  return `<div class="print-sheet" style="width:${mm(page.width)};height:${mm(page.height)}">
    ${options.header ? `<div class="print-sheet-head" style="left:${mm(area.x)};top:${mm(options.margin)};width:${mm(area.width)}">${escapeHtml(name)}</div>` : ''}
    <div class="print-sheet-area" style="left:${mm(area.x)};top:${mm(area.y)};width:${mm(area.width)};height:${mm(area.height)}">
      <img class="print-sheet-image ${options.border ? 'bordered' : ''}" src="${url}" alt="" style="left:${mm(image.x - area.x)};top:${mm(image.y - area.y)};width:${mm(image.width)};height:${mm(image.height)}" />
    </div>
    ${options.footer ? `<div class="print-sheet-foot" style="left:${mm(area.x)};bottom:${mm(options.margin)};width:${mm(area.width)}"><span>${escapeHtml(date)}</span><span>MyCapture</span></div>` : ''}
  </div>`;
}

/**
 * Starts the print window in `root`. `params` = { path, name, width, height } of the
 * image; `loadUrl(path)` gives a URL the page can show (with a PNG fallback for
 * formats the webview cannot draw); `ready()` shows the window once drawn.
 */
export function startPrintWindow({ root, params, loadUrl, ready }) {
  const state = {
    options: loadPrintOptions(),
    url: null,
    error: null,
    width: Number(params.width) || 0,
    height: Number(params.height) || 0,
    name: params.name || baseName(params.path ?? ''),
  };

  const option = (key, value, label, glyph) => {
    const on = String(state.options[key]) === String(value);
    return `<button type="button" class="segment ${on ? 'active' : ''}" role="radio" aria-checked="${on}" data-print="${key}" data-value="${value}">${glyph ? icon(glyph) : ''}<span>${label}</span></button>`;
  };
  const group = (glyph, label, control) => `<div class="print-group"><span class="print-label">${icon(glyph)}<span>${label}</span></span>${control}</div>`;
  const check = (key, glyph, label) => `<label class="print-check"><input type="checkbox" data-print-toggle="${key}" ${state.options[key] ? 'checked' : ''} />${icon(glyph)}<span>${label}</span></label>`;

  function preview(layout) {
    if (state.error) return `<p class="print-error">${icon('info')}<span>${escapeHtml(state.error)}</span></p>`;
    if (!state.url) return `<p class="print-loading">${t('print.loading')}</p>`;
    const { page, image, area, options } = layout;
    const pct = (value, total) => `${fixed((value / total) * 100, 4)}%`;
    return `<div class="print-page" style="aspect-ratio:${fixed(page.width, 3)} / ${fixed(page.height, 3)}" data-landscape="${layout.landscape}">
      <div class="print-area-guide" style="left:${pct(area.x, page.width)};top:${pct(area.y, page.height)};width:${pct(area.width, page.width)};height:${pct(area.height, page.height)}">
        <img class="print-preview-image ${options.border ? 'bordered' : ''}" src="${state.url}" alt="" style="left:${pct(image.x - area.x, area.width)};top:${pct(image.y - area.y, area.height)};width:${pct(image.width, area.width)};height:${pct(image.height, area.height)}" />
      </div>
      ${options.header ? `<div class="print-page-head" style="top:${pct(options.margin, page.height)};left:${pct(area.x, page.width)};width:${pct(area.width, page.width)}">${escapeHtml(state.name)}</div>` : ''}
      ${options.footer ? `<div class="print-page-foot" style="bottom:${pct(options.margin, page.height)};left:${pct(area.x, page.width)};width:${pct(area.width, page.width)}"><span>${escapeHtml(today())}</span><span>MyCapture</span></div>` : ''}
    </div>`;
  }

  function render() {
    const layout = printLayout(state.options, state.width || 1, state.height || 1);
    const o = state.options;
    const pageSize = `${fixed(layout.page.width)} × ${fixed(layout.page.height)} mm`;
    root.innerHTML = `
    <div class="popup popup-print" role="dialog" aria-labelledby="popup-title">
      <header class="popup-head" data-tauri-drag-region>
        <h2 id="popup-title" data-tauri-drag-region>${icon('print')}<span data-tauri-drag-region>${t('print.title')}</span><small class="print-file" data-tauri-drag-region title="${escapeHtml(params.path ?? '')}">${escapeHtml(state.name)}</small></h2>
        <div class="guide-head-actions">
          <button class="window-button" data-action="guide-maximize" title="${t('win.maximize')}" aria-label="${t('win.maximize')}">${icon('winMaximize')}</button>
          <button class="window-button close" data-action="close" title="${t('modal.close')}" aria-label="${t('modal.close')}">${icon('close')}</button>
        </div>
      </header>
      <div class="print-body">
        <div class="print-stage" aria-label="${t('print.preview')}">${preview(layout)}</div>
        <div class="print-options">
          ${group('paper', t('print.paper'), `<div class="segmented print-wrap" role="radiogroup">${Object.keys(PAPERS).map((paper) => option('paper', paper, paper, 'paper')).join('')}</div>`)}
          ${group('pageAuto', t('print.orientation'), `<div class="segmented" role="radiogroup">${ORIENTATIONS.map((value) => option('orientation', value, t(`print.orient.${value}`), ORIENT_ICONS[value])).join('')}</div>`)}
          ${group('margin', t('print.margin'), `<div class="segmented" role="radiogroup">${MARGINS.map((value) => option('margin', value, `${value}`, null)).join('')}<span class="print-unit">mm</span></div>`)}
          ${group('fit', t('print.scale'), `<div class="segmented print-wrap" role="radiogroup">${SCALES.map((value) => option('scale', value, t(`print.scale.${value}`), SCALE_ICONS[value])).join('')}</div>
            <span class="quality print-percent ${o.scale === 'percent' ? '' : 'off'}"><input type="range" min="${PERCENT.min}" max="${PERCENT.max}" step="${PERCENT.step}" value="${o.percent}" data-print-percent aria-label="${t('print.scale.percent')}" ${o.scale === 'percent' ? '' : 'disabled'} /><output>${o.percent}%</output></span>`)}
          <div class="print-checks">
            ${check('header', 'list', t('print.header'))}
            ${check('footer', 'clock', t('print.footer'))}
            ${check('border', 'frame', t('print.border'))}
          </div>
          <div class="print-info">
            <span>${icon('images')}<span>${state.width} × ${state.height} px</span></span>
            <span>${icon('paper')}<span>${o.paper} · ${pageSize}${layout.landscape ? ` · ${t('print.orient.landscape')}` : ''}</span></span>
            <span>${icon('fit')}<span data-print-size>${fixed(layout.image.width)} × ${fixed(layout.image.height)} mm · ${fixed(layout.zoom * 100)}%</span></span>
            ${layout.clipped ? `<span class="print-warn">${icon('info')}<span>${t('print.clipped')}</span></span>` : ''}
          </div>
        </div>
      </div>
      <footer class="modal-foot">
        <button class="button" data-print-action="reset">${icon('refresh')}<span>${t('print.reset')}</span></button>
        <span class="foot-group">
          <button class="button" data-action="close">${icon('close')}<span>${t('modal.close')}</span></button>
          <button class="primary small" data-print-action="print" ${state.url ? '' : 'disabled'}>${icon('print')}<span>${t('print.button')}</span></button>
        </span>
      </footer>
      <span class="guide-resize" data-resize aria-hidden="true"></span>
    </div>
    <div class="print-out" aria-hidden="true"></div>`;
  }

  function set(patch) {
    state.options = sanitizePrintOptions({ ...state.options, ...patch });
    storePrintOptions(state.options);
    render();
  }

  /** Lays the page out for the printer and opens the print dialog. */
  function print() {
    if (!state.url) return;
    const layout = printLayout(state.options, state.width || 1, state.height || 1);
    let rule = document.querySelector('#print-page-rule');
    if (!rule) {
      rule = document.createElement('style');
      rule.id = 'print-page-rule';
      document.head.appendChild(rule);
    }
    rule.textContent = pageRule(layout);
    root.querySelector('.print-out').innerHTML = sheetHtml(layout, { url: state.url, name: state.name, date: today() });
    document.body.classList.add('printing');
    const done = () => document.body.classList.remove('printing');
    window.addEventListener('afterprint', done, { once: true });
    // The image must be decoded before the dialog takes its snapshot of the page.
    const img = root.querySelector('.print-sheet-image');
    (img?.decode?.() ?? Promise.resolve()).catch(() => {}).then(() => {
      window.print();
      setTimeout(done, 0);
    });
  }

  root.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-print]');
    if (choice) {
      const key = choice.dataset.print;
      const raw = choice.dataset.value;
      set({ [key]: key === 'margin' ? Number(raw) : raw });
      return;
    }
    const action = event.target.closest('[data-print-action]')?.dataset.printAction;
    if (action === 'reset') set({ ...defaultPrintOptions });
    else if (action === 'print') print();
  });
  root.addEventListener('change', (event) => {
    const toggle = event.target.dataset?.printToggle;
    if (toggle) set({ [toggle]: event.target.checked });
    else if ('printPercent' in (event.target.dataset ?? {})) set({ percent: Number(event.target.value) });
  });
  root.addEventListener('input', (event) => {
    if (!('printPercent' in (event.target.dataset ?? {}))) return;
    event.target.nextElementSibling.textContent = `${event.target.value}%`;
  });

  render();
  ready();
  loadUrl(params.path)
    .then(({ url, width, height }) => {
      state.url = url;
      if (width && height) { state.width = width; state.height = height; }
      render();
    })
    .catch((error) => { state.error = `${t('print.loadError')} ${String(error?.message ?? error ?? '')}`.trim(); render(); });

  return {
    state,
    set,
    print,
    relabel: render,
  };
}
