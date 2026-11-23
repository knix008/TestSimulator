// The print window: printer and page setup in one column on the left, the sheet as it will print
// on the right, and a Print button that prints at once. In the desktop app on Windows the page
// goes straight to the chosen printer (no system dialog); a file printer such as "Microsoft Print
// to PDF" asks only where to save the PDF. The browser has no printer list and uses its own
// print dialog. The preview and the printed page are the same DOM built from planSheet().
//
// The same window prints the user guide ("document mode", open({ doc })): the guide is cut into
// pages of the chosen paper (docPages.js), the preview shows every page, and the options that
// only mean something for a picture (alignment, size, colour, source image) are hidden.
import {
  COPIES, DEFAULT_PRINT, MARGIN_LIMIT, MARGIN_PRESETS, PAPERS, SCALE, SIDES,
  marginPreset, normalizePrint, pageCss, planSheet, printJob,
} from './printLayout.js';
import { exportPixelWidth, layoutAspect, paintAscii } from './render.js';
import { getLanguage, t } from './i18n.js';
import { showDialog } from './popups.js';
import { paginate } from './docPages.js';
import { guideDocument } from './guide.js';

const MM_PX = 96 / 25.4;
const SCREEN_LOOK = { background: '#121418', ink: '#f3f1ea' };
const PAPER_LOOK = { background: '#ffffff', ink: '#000000' };

const ICONS = {
  printer: '<path d="M4.4 5.6V1.8h7.2v3.8"/><rect x="1.8" y="5.6" width="12.4" height="5.6" rx="1.2"/><path d="M4.4 9.4h7.2v4.8H4.4z"/>',
  pdf: '<path d="M4 1.8h5.2L13 5.6V14.2H4z"/><path d="M9 1.8V5.8h4M6 9.6h4.4M6 11.8h3"/>',
  browser: '<rect x="1.8" y="2.6" width="12.4" height="10.8" rx="1.4"/><path d="M1.8 5.6h12.4"/>',
  paper: '<path d="M4 1.8h8v12.4H4z"/><path d="M6 5h4M6 7.4h4M6 9.8h2.6"/>',
  check: '<path d="M3.2 8.4 6.6 11.6 12.8 4.6"/>',
  caret: '<path d="M2.5 4.5 6 8l3.5-3.5"/>',
};
const svg = (name, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 ${name === 'caret' ? '12 12' : '16 16'}" aria-hidden="true">${ICONS[name]}</svg>`;
const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** A drop-down with an icon on the button and on every item (native selects cannot show icons). */
function createPick(root, { items, onChange }) {
  const button = root.querySelector('.pick-button');
  const list = root.querySelector('.pick-list');
  let value = '';
  const paint = () => {
    const item = items().find((entry) => entry.value === value) ?? items()[0];
    button.innerHTML = item
      ? `${svg(item.icon)}<span class="pick-text"><strong>${escape(item.label)}</strong>${item.hint ? `<small>${escape(item.hint)}</small>` : ''}</span>${svg('caret', 'caret')}`
      : `${svg('caret', 'caret')}`;
    button.dataset.icon = item?.icon ?? '';
  };
  const close = () => {
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    list.innerHTML = items().map((item) => `<button type="button" role="option" class="pick-item${item.value === value ? ' on' : ''}" data-value="${escape(item.value)}" data-icon="${item.icon}" aria-selected="${item.value === value}">${svg(item.icon)}<span class="pick-text"><strong>${escape(item.label)}</strong>${item.hint ? `<small>${escape(item.hint)}</small>` : ''}</span>${item.value === value ? svg('check', 'ico pick-check') : ''}</button>`).join('');
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  button.addEventListener('click', () => (list.hidden ? open() : close()));
  list.addEventListener('click', (event) => {
    const item = event.target.closest('[data-value]');
    if (!item) return;
    value = item.dataset.value;
    close();
    paint();
    onChange(value);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!list.hidden && !root.contains(event.target)) close();
  });
  return {
    get value() { return value; },
    set(next) { value = next; paint(); },
    close,
    paint,
  };
}

export function createPrintWindow({ dialog, getOptions, setOptions, sourceUrlOf, titleOf, platform, onStatus }) {
  const q = (selector) => dialog.querySelector(selector);
  const stage = q('#print-stage');
  const info = q('#print-info');
  const note = q('#print-note');
  const subject = q('#print-subject');
  const titleOn = q('#print-title-on');
  const sourceOn = q('#print-source-on');
  const footerOn = q('#print-footer-on');
  const go = q('#print-go');
  const sheetHost = document.querySelector('#print-sheet');
  const pageStyle = document.querySelector('#print-page-style');

  let result = null;
  let doc = null; // { lang, fontSize, html, title } in document mode
  let docCache = { key: '', pages: [] };
  let options = { ...DEFAULT_PRINT };
  let images = new Map();
  let renderToken = 0;
  let printers = { printers: [], defaultPrinter: '', filePrinters: [], direct: false };
  let busy = false;

  for (const selector of ['input[name="print-halign"]', 'input[name="print-valign"]', '.stepper[data-field="scale"]', 'input[name="print-ink"]']) {
    const row = q(selector)?.closest('.print-row');
    if (row) row.dataset.artOnly = '';
  }
  sourceOn.closest('label').dataset.artOnly = '';

  const isFilePrinter = (name) => printers.filePrinters.includes(name);
  const printerName = () => options.printer || printers.defaultPrinter || printers.printers[0] || '';

  const printerPick = createPick(q('#print-printer-pick'), {
    items: () => {
      if (!printers.direct || !printers.printers.length) {
        return [{ value: '', label: t(printers.direct ? 'printNoPrinter' : 'printBrowser'), hint: t(printers.direct ? '' : 'printBrowserHint'), icon: 'browser' }];
      }
      return printers.printers.map((name) => ({
        value: name,
        label: name,
        hint: [name === printers.defaultPrinter ? t('printDefaultPrinter') : '', isFilePrinter(name) ? t('printFilePrinter') : ''].filter(Boolean).join(' · '),
        icon: isFilePrinter(name) ? 'pdf' : 'printer',
      }));
    },
    onChange: (value) => update({ printer: value }),
  });
  const paperPick = createPick(q('#print-paper-pick'), {
    items: () => Object.entries(PAPERS).map(([id, [w, h]]) => ({ value: id, label: id, hint: `${Math.round(w)} × ${Math.round(h)} mm`, icon: 'paper' })),
    onChange: (value) => update({ paper: value }),
  });

  const colorAvailable = () => Boolean(result?.colors) && !result?.edited;
  const effectiveInk = () => (options.ink === 'color' && !colorAvailable() ? 'mono' : options.ink);

  const STEPPERS = {
    copies: { get: () => options.copies, set: (v) => ({ copies: v }), min: COPIES.min, max: COPIES.max, step: 1, unit: () => t('printCopiesUnit') },
    scale: { get: () => options.scale, set: (v) => ({ scale: v }), min: SCALE.min, max: SCALE.max, step: SCALE.step, unit: () => '%' },
  };
  for (const side of SIDES) {
    STEPPERS[`margin-${side}`] = {
      get: () => options.margins[side],
      set: (v) => ({ margins: { ...options.margins, [side]: v } }),
      min: MARGIN_LIMIT.min,
      max: MARGIN_LIMIT.max,
      step: MARGIN_LIMIT.step,
      unit: () => ' mm',
    };
  }

  function fillControls() {
    dialog.classList.toggle('doc-mode', Boolean(doc));
    stage.classList.toggle('doc-stage', Boolean(doc));
    printerPick.set(printers.direct ? printerName() : '');
    paperPick.set(options.paper);
    const radios = {
      'print-orientation': options.orientation,
      'print-margin-preset': marginPreset(options.margins),
      'print-halign': options.hAlign,
      'print-valign': options.vAlign,
      'print-ink': options.ink,
    };
    for (const [name, value] of Object.entries(radios)) {
      for (const input of dialog.querySelectorAll(`input[name="${name}"]`)) input.checked = input.value === value;
    }
    const colorInput = dialog.querySelector('input[name="print-ink"][value="color"]');
    colorInput.disabled = !colorAvailable();
    colorInput.closest('label').title = colorAvailable() ? '' : t('printColorNone');
    titleOn.checked = options.title;
    sourceOn.checked = options.source;
    sourceOn.disabled = !result?.previewUrl;
    footerOn.checked = options.footer;
    for (const stepper of dialog.querySelectorAll('.stepper[data-field]')) {
      const spec = STEPPERS[stepper.dataset.field];
      const value = spec.get();
      stepper.querySelector('output').textContent = `${value}${spec.unit()}`;
      stepper.querySelector('[data-step="-1"]').disabled = value <= spec.min;
      stepper.querySelector('[data-step="1"]').disabled = value >= spec.max;
    }
    const file = printers.direct && isFilePrinter(printerName());
    note.hidden = printers.direct && !file;
    note.textContent = !printers.direct ? t('printBrowserNote') : file ? t('printFileNote') : '';
    go.querySelector('[data-i18n]').textContent = t(file ? 'printGoPdf' : 'printGo');
    go.disabled = busy;
  }

  function update(patch) {
    options = normalizePrint({ ...options, ...patch });
    setOptions(options);
    fillControls();
    void render();
  }

  async function imageUrl(kind) {
    const key = kind === 'text' ? `text:${effectiveInk()}` : 'source';
    if (images.has(key)) return images.get(key);
    let url;
    if (kind === 'text') {
      const ink = effectiveInk();
      const subjectResult = ink === 'mono' ? { ...result, colors: null } : result;
      const canvas = paintAscii(document.createElement('canvas'), subjectResult, exportPixelWidth(result, 2400), 1, ink === 'screen' ? SCREEN_LOOK : PAPER_LOOK);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      url = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
    } else {
      url = sourceUrlOf(result) || result.previewUrl;
    }
    images.set(key, url);
    return url;
  }

  function currentPlan() {
    // A document is portrait unless landscape is chosen; it has no source picture.
    if (doc) return planSheet({ ...options, source: false }, 0.7);
    return planSheet(options, layoutAspect(result), result.imageWidth / result.imageHeight);
  }

  /** The text area of a document page, below the title band and above the footer band. */
  function docArea(plan) {
    const m = plan.margins;
    const top = plan.title ? plan.title.y + plan.title.h : m.top;
    const bottom = plan.footer ? plan.footer.y : plan.page.h - m.bottom;
    return { x: m.left, y: top, w: Math.max(10, plan.page.w - m.left - m.right), h: Math.max(10, bottom - top) };
  }

  async function docPages(plan) {
    const area = docArea(plan);
    const key = [doc.lang, doc.fontSize, area.w, area.h].join('|');
    if (docCache.key === key) return docCache.pages;
    const host = document.createElement('div');
    host.className = 'guide-content doc-body doc-measure';
    host.style.setProperty('--guide-font', `${doc.fontSize}px`);
    document.body.append(host);
    try {
      const pages = await paginate(host, doc.html, { widthMm: area.w, heightMm: area.h });
      docCache = { key, pages };
      return pages;
    } finally {
      host.remove();
    }
  }

  async function buildDocSheets(plan) {
    const pages = await docPages(plan);
    const area = docArea(plan);
    const date = new Intl.DateTimeFormat(getLanguage() === 'en' ? 'en-CA' : 'ko-KR', { dateStyle: 'long' }).format(new Date());
    return pages.map((nodes, index) => {
      const sheet = document.createElement('div');
      sheet.className = 'sheet doc-sheet ink-mono';
      sheet.style.width = `${plan.page.w}mm`;
      sheet.style.height = `${plan.page.h}mm`;
      const band = (cls, rect, text) => {
        const el = document.createElement('div');
        el.className = cls;
        Object.assign(el.style, box(rect));
        el.textContent = text;
        sheet.append(el);
      };
      if (plan.title) band('sheet-title', plan.title, doc.title);
      const body = document.createElement('div');
      body.className = 'guide-content doc-body';
      body.lang = doc.lang;
      body.style.setProperty('--guide-font', `${doc.fontSize}px`);
      body.style.setProperty('--page-text-h', `${area.h}mm`);
      Object.assign(body.style, box(area));
      body.append(...nodes.map((node) => node.cloneNode(true)));
      sheet.append(body);
      // The page number is always there; the date only when "date" is on.
      const number = `${index + 1} / ${pages.length}`;
      const footRect = plan.footer ?? { x: plan.margins.left, y: plan.page.h - Math.max(4, plan.margins.bottom * 0.7) - 5, w: area.w, h: 5 };
      band('sheet-footer doc-footer', footRect, plan.footer ? `${date} · Image2Text · ${number}` : number);
      return sheet;
    });
  }

  async function renderDoc() {
    const token = ++renderToken;
    const plan = currentPlan();
    const sheets = await buildDocSheets(plan);
    if (token !== renderToken) return;
    const pageW = plan.page.w * MM_PX;
    const pageH = plan.page.h * MM_PX;
    const k = Math.min((stage.clientWidth - 48) / pageW, (stage.clientHeight - 48) / pageH);
    const frames = sheets.map((sheet) => {
      const frame = document.createElement('div');
      frame.className = 'sheet-frame';
      frame.style.width = `${pageW * k}px`;
      frame.style.height = `${pageH * k}px`;
      sheet.style.transform = `scale(${k})`;
      frame.append(sheet);
      const guide = document.createElement('div');
      guide.className = 'sheet-margins';
      Object.assign(guide.style, {
        left: `${plan.margins.left * MM_PX * k}px`,
        top: `${plan.margins.top * MM_PX * k}px`,
        right: `${plan.margins.right * MM_PX * k}px`,
        bottom: `${plan.margins.bottom * MM_PX * k}px`,
      });
      frame.append(guide);
      return frame;
    });
    const keep = stage.scrollTop;
    stage.replaceChildren(...frames);
    stage.scrollTop = keep;
    info.textContent = `${t('printInfo', {
      paper: plan.options.paper,
      orientation: t(plan.orientation === 'landscape' ? 'printLandscape' : 'printPortrait'),
      w: Math.round(plan.page.w),
      h: Math.round(plan.page.h),
      copies: plan.options.copies,
    })} · ${t('printPages', { n: sheets.length })}`;
  }

  async function buildSheet(plan) {
    const ink = effectiveInk();
    const sheet = document.createElement('div');
    sheet.className = `sheet ink-${ink}`;
    sheet.style.width = `${plan.page.w}mm`;
    sheet.style.height = `${plan.page.h}mm`;
    const band = (cls, rect, text) => {
      const el = document.createElement('div');
      el.className = cls;
      Object.assign(el.style, box(rect));
      el.textContent = text;
      sheet.append(el);
    };
    if (plan.title) band('sheet-title', plan.title, titleOf(result));
    if (plan.footer) {
      const date = new Intl.DateTimeFormat(getLanguage() === 'en' ? 'en-CA' : 'ko-KR', { dateStyle: 'long' }).format(new Date());
      band('sheet-footer', plan.footer, `${date} · Image2Text`);
    }
    for (const item of plan.boxes) {
      const img = document.createElement('img');
      img.className = `sheet-${item.kind}`;
      img.alt = '';
      img.draggable = false;
      Object.assign(img.style, box(item));
      img.src = await imageUrl(item.kind);
      sheet.append(img);
    }
    await Promise.all([...sheet.querySelectorAll('img')].map((img) => img.decode().catch(() => {})));
    return sheet;
  }

  async function render() {
    if (doc) return renderDoc();
    if (!result) return;
    const token = ++renderToken;
    const plan = currentPlan();
    const sheet = await buildSheet(plan);
    if (token !== renderToken) return;
    const pageW = plan.page.w * MM_PX;
    const pageH = plan.page.h * MM_PX;
    const k = Math.min((stage.clientWidth - 48) / pageW, (stage.clientHeight - 48) / pageH);
    const frame = document.createElement('div');
    frame.className = 'sheet-frame';
    frame.style.width = `${pageW * k}px`;
    frame.style.height = `${pageH * k}px`;
    sheet.style.transform = `scale(${k})`;
    frame.append(sheet);
    // The margins as a dashed line, only in the preview.
    const guide = document.createElement('div');
    guide.className = 'sheet-margins';
    Object.assign(guide.style, {
      left: `${plan.margins.left * MM_PX * k}px`,
      top: `${plan.margins.top * MM_PX * k}px`,
      right: `${plan.margins.right * MM_PX * k}px`,
      bottom: `${plan.margins.bottom * MM_PX * k}px`,
    });
    frame.append(guide);
    stage.replaceChildren(frame);
    info.textContent = t('printInfo', {
      paper: plan.options.paper,
      orientation: t(plan.orientation === 'landscape' ? 'printLandscape' : 'printPortrait'),
      w: Math.round(plan.page.w),
      h: Math.round(plan.page.h),
      copies: plan.options.copies,
    });
  }

  function errorText(error) {
    const code = error instanceof Error ? error.message : String(error);
    const known = { 'printer-unavailable': 'printErrUnavailable', 'print-failed': 'printErrFailed', 'no-answer': 'printErrNoAnswer' };
    return known[code] ? t(known[code]) : code;
  }

  async function printNow() {
    if ((!result && !doc) || busy) return;
    busy = true;
    fillControls();
    try {
      const plan = currentPlan();
      const sheets = doc ? await buildDocSheets(plan) : [await buildSheet(plan)];
      // A sheet exactly as tall as the paper can spill a blank page on some printers.
      for (const sheet of sheets) sheet.style.height = `${plan.page.h - 1}mm`;
      sheetHost.replaceChildren(...sheets);
      pageStyle.textContent = pageCss(plan);
      const job = { ...printJob(plan), printer: printers.direct ? printerName() : '' };
      if (!printers.direct) {
        dialog.close('print');
        onStatus('printOpened');
        await platform.fallbackPrint();
        return;
      }
      if (isFilePrinter(job.printer)) {
        const path = await platform.pickPdfPath(`${(doc ? doc.title : titleOf(result)).replace(/[<>:"/\\|?*]/g, '_')}.pdf`, t('printSavePdf'));
        if (!path) {
          onStatus('printCancelled');
          return;
        }
        onStatus('printing', { printer: job.printer });
        await platform.printPdf(job, path);
        dialog.close('print');
        onStatus('printSavedPdf', { path });
        return;
      }
      onStatus('printing', { printer: job.printer });
      await platform.printDirect(job);
      dialog.close('print');
      onStatus('printSent', { printer: job.printer, copies: job.copies });
    } catch (error) {
      onStatus('printFailed', { error: errorText(error) });
    } finally {
      busy = false;
      if (dialog.open) fillControls();
    }
  }

  function forget() {
    for (const url of images.values()) if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    images = new Map();
  }

  dialog.addEventListener('change', (event) => {
    const input = event.target;
    if (!input.closest('.print-options')) return;
    if (input.name === 'print-orientation') update({ orientation: input.value });
    else if (input.name === 'print-margin-preset') {
      const mm = MARGIN_PRESETS[input.value];
      update({ margins: { top: mm, right: mm, bottom: mm, left: mm } });
    } else if (input.name === 'print-halign') update({ hAlign: input.value });
    else if (input.name === 'print-valign') update({ vAlign: input.value });
    else if (input.name === 'print-ink') update({ ink: input.value });
    else if (input === titleOn) update({ title: titleOn.checked });
    else if (input === sourceOn) update({ source: sourceOn.checked });
    else if (input === footerOn) update({ footer: footerOn.checked });
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close('cancel');
      return;
    }
    const button = event.target.closest('.stepper [data-step]');
    if (!button || button.disabled) return;
    const spec = STEPPERS[button.closest('.stepper').dataset.field];
    const next = Math.min(spec.max, Math.max(spec.min, spec.get() + Number(button.dataset.step) * spec.step));
    update(spec.set(next));
  });
  // Wheel over a stepper changes its value too.
  dialog.addEventListener('wheel', (event) => {
    const stepper = event.target.closest('.stepper[data-field]');
    if (!stepper) return;
    event.preventDefault();
    stepper.querySelector(`[data-step="${event.deltaY < 0 ? 1 : -1}"]`)?.click();
  }, { passive: false });
  q('#print-defaults').addEventListener('click', () => update({ ...DEFAULT_PRINT, printer: options.printer }));
  go.addEventListener('click', () => void printNow());
  dialog.addEventListener('close', () => {
    printerPick.close();
    paperPick.close();
  });
  window.addEventListener('afterprint', () => sheetHost.replaceChildren());
  new ResizeObserver(() => { if (dialog.open) void render(); }).observe(stage);

  return {
    async open(next) {
      if (!next) return false;
      forget();
      if (next.doc) {
        const { html, title, lang } = guideDocument(next.doc.lang);
        doc = { lang, title, html, fontSize: Math.min(22, Math.max(11, Math.round(Number(next.doc.fontSize) || 14))) };
        docCache = { key: '', pages: [] };
        result = null;
      } else {
        doc = null;
        result = next;
      }
      options = normalizePrint(getOptions());
      subject.textContent = doc ? doc.title : titleOf(result);
      fillControls();
      showDialog(dialog);
      void render();
      try {
        printers = { ...printers, ...(await platform.listPrinters()) };
      } catch {
        printers = { printers: [], defaultPrinter: '', filePrinters: [], direct: false };
      }
      if (options.printer && !printers.printers.includes(options.printer)) options = { ...options, printer: '' };
      fillControls();
      return true;
    },
    printNow,
    get isDocument() { return Boolean(doc); },
    refreshLanguage() {
      if (dialog.open) {
        fillControls();
        void render();
      }
    },
  };
}

function box(item) {
  return { left: `${item.x}mm`, top: `${item.y}mm`, width: `${item.w}mm`, height: `${item.h}mm` };
}
