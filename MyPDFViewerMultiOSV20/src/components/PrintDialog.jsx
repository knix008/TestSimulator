import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal.jsx';
import { IconPrint, IconPrev, IconNext, IconFirst, IconLast } from './Icons.jsx';
import {
  clampPreviewIndex, pagesForScope, choosePrinter, clampCopies, planForDoc, renderPreviewSheet, toContiguousRanges,
} from '../lib/print.js';
import {
  PAPER_IDS, MARGIN_IDS, PAGES_PER_SHEET, SCALE_MODES, SUBSETS, COLOR_MODES, PRINT_ORIENTATIONS,
  SCALE_MIN, SCALE_MAX, normalizePrintOptions, clampScalePercent, printPlan,
} from '../lib/print-layout.js';

// The print window always has this size: nothing in it grows, shrinks or
// scrolls when the choices change (fields that are not in use stay, disabled).
// Most of it is the preview, large enough to read the text on the sheet.
export const PRINT_WINDOW_SIZE = Object.freeze({ width: 1180, height: 860 });
// Smaller screens get a window that still fits on them (the size is fixed
// from then on).
export function printWindowSize(scr = typeof screen !== 'undefined' ? screen : null) {
  const aw = Number(scr?.availWidth) || 0;
  const ah = Number(scr?.availHeight) || 0;
  return {
    width: aw > 0 ? Math.max(900, Math.min(PRINT_WINDOW_SIZE.width, aw - 40)) : PRINT_WINDOW_SIZE.width,
    height: ah > 0 ? Math.max(620, Math.min(PRINT_WINDOW_SIZE.height, ah - 40)) : PRINT_WINDOW_SIZE.height,
  };
}
// Used where the preview box has not been laid out yet (tests).
const PREVIEW_FALLBACK = { width: 760, height: 700 };
// The preview is drawn with at least this many pixels per CSS px, so the
// magnifier has real detail to show; it is shown shrunk to fit.
export const PREVIEW_DETAIL = 2.5;
// The magnifier: a window onto the sheet at this zoom, under the pointer.
export const LENS = Object.freeze({ width: 300, height: 190, zoom: 2.5 });

// "1–3, 5"
const rangeText = (pages) => toContiguousRanges(pages).map((r) => (r.from === r.to ? `${r.from}` : `${r.from}–${r.to}`)).join(', ');

// A number with a decrease button on its left and an increase button on its right.
function Stepper({ value, min, max, step = 1, onValue, label, disabled = false, id }) {
  const { t } = useTranslation();
  const n = Number(value);
  const set = (v) => onValue(Math.min(max, Math.max(min, v)));
  return (
    <div className={`print-stepper${disabled ? ' disabled' : ''}`} data-print-stepper={id}>
      <button
        type="button"
        className="bg-step"
        onClick={() => set((Number.isFinite(n) ? n : min) - step)}
        disabled={disabled || !(n > min)}
        aria-label={t('startbg.decrease', { name: label })}
        title={t('startbg.decrease', { name: label })}
      >−</button>
      <input
        className="input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onValue(e.target.value)}
        onBlur={() => set(Number.isFinite(n) ? n : min)}
        data-print-number={id}
      />
      <button
        type="button"
        className="bg-step"
        onClick={() => set((Number.isFinite(n) ? n : min) + step)}
        disabled={disabled || !(n < max)}
        aria-label={t('startbg.increase', { name: label })}
        title={t('startbg.increase', { name: label })}
      >+</button>
    </div>
  );
}

// A label above its control. `group` for a stepper: a <label> around several
// buttons would press the first one when its text is clicked.
function Field({ label, children, wide = false, group = false }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className={`print-field${wide ? ' wide' : ''}`} role={group ? 'group' : undefined} aria-label={group ? label : undefined}>
      <span className="print-field-label">{label}</span>
      {children}
    </Tag>
  );
}

// The print window: what to print (all, the page on screen, a range; odd or
// even pages), the printer and copies, and the page setup — paper, orientation,
// margins, pages per sheet, scale, colour — beside a preview of each sheet
// exactly as it will come out of the printer. On the desktop it is a window of
// its own; on the web a browser pop-up (or, if pop-ups are blocked, in the page).
export default function PrintDialog({
  open, doc, numPages, pageNumber, rotation = 0,
  settings, onChange, onPrint, onClose, busy, listPrinters = null,
}) {
  const { t } = useTranslation();
  const [scope, setScope] = useState(settings.printScope || 'all');
  const [custom, setCustom] = useState('');
  const [sheetIndex, setSheetIndex] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const lensRef = useRef(null);
  const [lens, setLens] = useState(null);   // { x, y } in the preview box, or null
  const [windowSize] = useState(() => printWindowSize());
  // Desktop: the printer is chosen here and Print sends the job straight to it.
  const direct = typeof listPrinters === 'function';
  const [printers, setPrinters] = useState({ printers: [], default: null, loading: direct });
  const [printer, setPrinter] = useState('');
  const [copies, setCopies] = useState(1);
  const [orientation, setOrientation] = useState(settings.printOrientation || 'auto');
  const [options, setOptions] = useState(() => normalizePrintOptions(settings.printOptions));
  const [plan, setPlan] = useState(null);

  useEffect(() => {
    if (!open || !direct) return undefined;
    let alive = true;
    setPrinters((p) => ({ ...p, loading: true }));
    listPrinters()
      .then((res) => {
        if (!alive) return;
        const list = { printers: res?.printers || [], default: res?.default || null };
        setPrinters({ ...list, loading: false });
        setPrinter(choosePrinter(settings.printPrinter, list));
      })
      .catch(() => { if (alive) setPrinters({ printers: [], default: null, loading: false }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, direct]);

  // Every opening starts from what was used last time.
  useEffect(() => {
    if (!open) return;
    setScope(settings.printScope || 'all');
    setCustom((prev) => prev || `${pageNumber}`);
    setOrientation(settings.printOrientation || 'auto');
    setOptions(normalizePrintOptions(settings.printOptions));
    setSheetIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selection = useMemo(
    () => pagesForScope({ scope, custom, pageNumber, numPages }),
    [scope, custom, pageNumber, numPages],
  );
  const invalid = scope === 'custom' && !!selection.error;

  // The plan: which pages print and how they fall on sheets. A first guess at
  // once (A4-shaped pages), then the real one once the first page is measured.
  useEffect(() => {
    if (!open) return undefined;
    const pages = invalid ? [] : selection.pages;
    setPlan(printPlan({ pages, options, orientation }));
    if (!doc || !pages.length) return undefined;
    let alive = true;
    planForDoc({ doc, pages, options, orientation, rotation })
      .then((p) => { if (alive) setPlan(p); })
      .catch(() => {});
    return () => { alive = false; };
  }, [open, doc, selection, invalid, options, orientation, rotation]);

  const sheets = plan?.sheets || [];
  const sheetCount = sheets.length;
  const safeSheet = clampPreviewIndex(sheetIndex, sheetCount);
  const printedPages = plan?.pages || [];
  const emptySubset = !invalid && selection.pages.length > 0 && printedPages.length === 0;

  useEffect(() => { setSheetIndex((i) => clampPreviewIndex(i, sheetCount)); }, [sheetCount]);

  // The preview: drawn off screen, then put in place in one go (no flicker).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!open || !doc || !plan || !sheetCount || !canvas) { setPreviewing(false); return undefined; }
    let cancelled = false;
    setPreviewing(true);
    (async () => {
      try {
        // Drawn on a canvas of this page's document (where pdf.js keeps the
        // PDF's fonts), then copied into the print window's canvas.
        const off = document.createElement('canvas');
        const box = boxRef.current;
        const bw = (box?.clientWidth || PREVIEW_FALLBACK.width) - 20;
        const bh = (box?.clientHeight || PREVIEW_FALLBACK.height) - 20;
        // As many device pixels as the screen has, so small print stays legible.
        const screenRatio = canvas.ownerDocument?.defaultView?.devicePixelRatio || window.devicePixelRatio || 1;
        const ratio = Math.max(screenRatio, PREVIEW_DETAIL);
        const res = await renderPreviewSheet({
          doc, plan, sheetIndex: safeSheet, canvas: off, rotation, maxWidth: bw, maxHeight: bh, pixelRatio: ratio,
        });
        if (cancelled) return;
        canvas.width = off.width;
        canvas.height = off.height;
        canvas.style.width = `${res.cssWidth}px`;
        canvas.style.height = `${res.cssHeight}px`;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage?.(off, 0, 0);
        off.width = 0;
        off.height = 0;
      } catch { /* the pane stays as it was; printing still works */ }
      if (!cancelled) setPreviewing(false);
    })();
    return () => { cancelled = true; };
  }, [open, doc, plan, safeSheet, sheetCount, rotation]);

  // The magnifier follows the pointer over the sheet and shows that spot
  // enlarged, from the preview's own detailed pixels.
  const moveLens = (e) => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box || !canvas.width) return;
    const cr = canvas.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    const fx = (e.clientX - cr.left) / Math.max(1, cr.width);
    const fy = (e.clientY - cr.top) / Math.max(1, cr.height);
    if (fx < 0 || fy < 0 || fx > 1 || fy > 1) { setLens(null); return; }
    setLens({ x: e.clientX - br.left, y: e.clientY - br.top });
    const out = lensRef.current;
    const ctx = out?.getContext?.('2d');
    if (!ctx) return;
    // Source pixels per lens pixel: the canvas's detail over the zoom.
    const perCss = canvas.width / Math.max(1, cr.width);
    const sw = (LENS.width / LENS.zoom) * perCss;
    const sh = (LENS.height / LENS.zoom) * perCss;
    out.width = LENS.width;
    out.height = LENS.height;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, LENS.width, LENS.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, fx * canvas.width - sw / 2, fy * canvas.height - sh / 2, sw, sh, 0, 0, LENS.width, LENS.height);
  };

  if (!open) return null;

  const setOption = (patch) => {
    const next = normalizePrintOptions({ ...options, ...patch });
    setOptions(next);
    onChange({ ...settings, printOptions: next });
  };
  const chooseScope = (next) => {
    setScope(next);
    onChange({ ...settings, printScope: next });
  };
  const chooseOrientation = (next) => {
    setOrientation(next);
    onChange({ ...settings, printOrientation: next });
  };

  const noPrinter = direct && !printers.loading && !printer;
  const cannotPrint = invalid || !printedPages.length || busy;

  // Print prints at once, to the printer chosen here; no second print window.
  const submit = () => {
    if (cannotPrint) return;
    const job = { pages: printedPages, scope, orientation, options };
    if (direct) {
      if (!printer) return;
      onChange({ ...settings, printScope: scope, printPrinter: printer, printOrientation: orientation, printOptions: options });
      onPrint({ ...job, printer, copies: clampCopies(copies) });
      return;
    }
    onPrint(job);
  };

  const SCOPES = [
    { id: 'all', label: t('print.all'), hint: t('print.allHint', { n: numPages }) },
    { id: 'current', label: t('print.current'), hint: t('print.currentHint', { n: pageNumber }) },
    { id: 'custom', label: t('print.custom'), hint: t('print.customHint') },
  ];

  const landscape = !!plan?.landscape;
  const printerName = direct
    ? (printers.loading ? t('print.loadingPrinters') : (printer || t('print.noPrinters')))
    : t('print.browserPrinter');
  const message = invalid ? t(selection.error, { max: numPages })
    : emptySubset ? t('print.subsetEmpty')
      : noPrinter ? t('print.noPrinters')
        : (direct ? t('print.noteDirect') : t('print.note'));
  const isError = invalid || emptySubset || noPrinter;

  return (
    <Modal
      open
      windowName="print"
      fixedSize={windowSize}
      title={t('print.title')}
      icon={IconPrint}
      onClose={onClose}
      className="print-modal"
      closeLabel={t('common.cancel')}
      footer={(
        <>
          <span className="print-count" data-print-summary>
            {cannotPrint && !busy ? '' : t('print.summary', { pages: printedPages.length, sheets: sheetCount, copies: direct ? clampCopies(copies) : 1 })}
          </span>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button
            className="btn primary"
            onClick={() => submit()}
            disabled={cannotPrint || (direct && (printers.loading || noPrinter))}
            data-autofocus
            data-print-go
          >
            <IconPrint size={15} /> {busy ? t('print.working') : t('print.print')}
          </button>
        </>
      )}
    >
      <div className="print-layout">
        <div className="print-options">
          <div className="print-grid">
            <Field label={t('print.printer')} wide>
              {direct ? (
                <select
                  className="input"
                  value={printer}
                  onChange={(e) => setPrinter(e.target.value)}
                  disabled={printers.loading || !printers.printers.length}
                  data-print-printer
                >
                  {printers.loading ? <option value="">{t('print.loadingPrinters')}</option> : null}
                  {!printers.loading && !printers.printers.length ? <option value="">{t('print.noPrinters')}</option> : null}
                  {printers.printers.map((p) => (
                    <option key={p} value={p}>{p === printers.default ? `${p} ${t('print.defaultMark')}` : p}</option>
                  ))}
                </select>
              ) : (
                <select className="input" disabled value="" data-print-printer>
                  <option value="">{t('print.browserPrinter')}</option>
                </select>
              )}
            </Field>
            <Field label={t('print.copies')} group>
              <span title={direct ? undefined : t('print.copiesWebTip')}>
                <Stepper id="copies" label={t('print.copies')} value={copies} min={1} max={99} onValue={setCopies} disabled={!direct} />
              </span>
            </Field>
            <Field label={t('print.color')}>
              <select className="input" value={options.color} onChange={(e) => setOption({ color: e.target.value })} data-print-color>
                {COLOR_MODES.map((c) => <option key={c} value={c}>{t(`print.colors.${c}`)}</option>)}
              </select>
            </Field>
          </div>

          <fieldset className="print-section">
            <legend>{t('print.range')}</legend>
            <div className="print-scopes" role="radiogroup" aria-label={t('print.range')}>
              {SCOPES.map((opt) => (
                <label key={opt.id} className={`print-scope${scope === opt.id ? ' active' : ''}`} title={opt.hint}>
                  <input type="radio" name="print-scope" checked={scope === opt.id} onChange={() => chooseScope(opt.id)} />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
            <div className="print-grid">
              <Field label={t('print.rangeLabel')}>
                <input
                  className="input"
                  value={custom}
                  disabled={scope !== 'custom'}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                  placeholder={t('print.rangePlaceholder')}
                  title={t('print.rangePlaceholder')}
                  data-print-range
                />
              </Field>
              <Field label={t('print.subset')}>
                <select className="input" value={options.subset} onChange={(e) => setOption({ subset: e.target.value })} data-print-subset>
                  {SUBSETS.map((s) => <option key={s} value={s}>{t(`print.subsets.${s}`)}</option>)}
                </select>
              </Field>
            </div>
          </fieldset>

          <fieldset className="print-section">
            <legend>{t('print.pageSetup')}</legend>
            <div className="print-grid">
              <Field label={t('print.paper')}>
                <select className="input" value={options.paper} onChange={(e) => setOption({ paper: e.target.value })} data-print-paper>
                  {PAPER_IDS.map((p) => <option key={p} value={p}>{t(`print.papers.${p}`)}</option>)}
                </select>
              </Field>
              <Field label={t('print.orientation')}>
                <select className="input" value={orientation} onChange={(e) => chooseOrientation(e.target.value)} data-print-orientation>
                  {PRINT_ORIENTATIONS.map((o) => <option key={o} value={o}>{t(`print.orient.${o}`)}</option>)}
                </select>
              </Field>
              <Field label={t('print.margin')}>
                <select className="input" value={options.margin} onChange={(e) => setOption({ margin: e.target.value })} data-print-margin>
                  {MARGIN_IDS.map((m) => <option key={m} value={m}>{t(`print.margins.${m}`)}</option>)}
                </select>
              </Field>
              <Field label={t('print.perSheet')}>
                <select className="input" value={options.perSheet} onChange={(e) => setOption({ perSheet: Number(e.target.value) })} data-print-per-sheet>
                  {PAGES_PER_SHEET.map((n) => <option key={n} value={n}>{t('print.perSheetN', { n })}</option>)}
                </select>
              </Field>
              <Field label={t('print.scale')}>
                <select className="input" value={options.scaleMode} onChange={(e) => setOption({ scaleMode: e.target.value })} data-print-scale>
                  {SCALE_MODES.map((m) => <option key={m} value={m}>{t(`print.scales.${m}`)}</option>)}
                </select>
              </Field>
              <Field label={t('print.scalePercent')} group>
                <Stepper
                  id="percent"
                  label={t('print.scalePercent')}
                  value={options.scalePercent}
                  min={SCALE_MIN}
                  max={SCALE_MAX}
                  step={10}
                  disabled={options.scaleMode !== 'custom'}
                  onValue={(v) => setOption({ scalePercent: clampScalePercent(v) })}
                />
              </Field>
            </div>
          </fieldset>

          <p className={`print-message${isError ? ' error' : ''}`} role={isError ? 'alert' : undefined} data-print-message>{message}</p>
        </div>

        <aside className="print-preview" aria-label={t('print.preview')}>
          <div className="print-preview-head">
            <IconPrint size={15} />
            <span className="print-preview-printer" title={printerName} data-print-preview-printer>{printerName}</span>
            <span className="print-preview-paper" data-print-preview-paper>
              {t(`print.paperShort.${options.paper}`)} · {landscape ? t('print.landscapeShort') : t('print.portraitShort')}
            </span>
          </div>
          <div
            className={`print-preview-sheet${previewing ? ' busy' : ''}`}
            ref={boxRef}
            onPointerMove={moveLens}
            onPointerLeave={() => setLens(null)}
            title={sheetCount ? t('print.lensTip') : undefined}
          >
            {sheetCount ? (
              <canvas ref={canvasRef} className="print-preview-canvas" data-print-canvas />
            ) : (
              <p className="print-preview-empty">{t('print.previewEmpty')}</p>
            )}
            <canvas
              ref={lensRef}
              className="print-lens"
              aria-hidden="true"
              data-print-lens
              hidden={!lens}
              style={lens ? {
                left: Math.round(lens.x - LENS.width / 2),
                top: Math.round(lens.y - LENS.height / 2),
                width: LENS.width,
                height: LENS.height,
              } : undefined}
            />
          </div>
          <div className="print-preview-nav">
            <button className="icon-btn" type="button" disabled={!sheetCount || safeSheet <= 0} onClick={() => setSheetIndex(0)} title={t('print.firstSheet')} aria-label={t('print.firstSheet')}>
              <IconFirst size={16} />
            </button>
            <button className="icon-btn" type="button" disabled={!sheetCount || safeSheet <= 0} onClick={() => setSheetIndex((i) => clampPreviewIndex(i - 1, sheetCount))} title={t('print.prevSheet')} aria-label={t('print.prevSheet')}>
              <IconPrev size={16} />
            </button>
            <span className="print-preview-page" data-print-sheet>
              {sheetCount
                ? `${t('print.sheetOf', { index: safeSheet + 1, total: sheetCount })} · ${t('print.sheetPages', { pages: rangeText(sheets[safeSheet]) })}`
                : '—'}
            </span>
            <button className="icon-btn" type="button" disabled={!sheetCount || safeSheet >= sheetCount - 1} onClick={() => setSheetIndex((i) => clampPreviewIndex(i + 1, sheetCount))} title={t('print.nextSheet')} aria-label={t('print.nextSheet')}>
              <IconNext size={16} />
            </button>
            <button className="icon-btn" type="button" disabled={!sheetCount || safeSheet >= sheetCount - 1} onClick={() => setSheetIndex(sheetCount - 1)} title={t('print.lastSheet')} aria-label={t('print.lastSheet')}>
              <IconLast size={16} />
            </button>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
