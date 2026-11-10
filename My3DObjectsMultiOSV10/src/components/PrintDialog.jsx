import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal.jsx';
import { Check } from './Form.jsx';
import { IconPrint, IconPrev, IconNext } from './Icons.jsx';
import { NumberStepper } from './Stepper.jsx';
import {
  PRINT_LAYOUTS, PRINT_ORIENTATIONS, LAYOUT_VIEWS, shotsFor, composeSheets, resolveLandscape, choosePrinter, clampCopies,
} from '../lib/print.js';

// What to print and where (after V20's print dialog): the layout — the view
// as it is, four or six directions on one sheet, or a sheet per direction —
// the model's details, a white background, the grid and axes; on the
// desktop the printer, copies and orientation, and the job goes straight to
// that printer. A live preview of the sheets sits beside the options.
export default function PrintDialog({ open, settings, onChange, onPrint, onClose, busy, capture, info, listPrinters = null }) {
  const { t } = useTranslation();
  const direct = typeof listPrinters === 'function';
  const [printers, setPrinters] = useState({ printers: [], default: null, loading: direct });
  const [printer, setPrinter] = useState('');
  const [copies, setCopies] = useState(1);
  const [sheets, setSheets] = useState([]);
  const [index, setIndex] = useState(0);
  const [rendering, setRendering] = useState(false);
  const run = useRef(0);

  const layout = settings.printLayout;
  const landscape = resolveLandscape(settings.printOrientation, layout);
  const set = (patch) => onChange({ ...settings, ...patch });

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

  // The sheets, drawn again whenever an option changes.
  useEffect(() => {
    if (!open) return undefined;
    const my = ++run.current;
    setRendering(true);
    const id = setTimeout(async () => {
      try {
        const shots = shotsFor(layout, landscape).map((s) => ({
          dataUrl: capture({ ...s, white: settings.printWhite, helpers: settings.printHelpers }),
          label: s.direction ? t(`view.${s.direction}`) : '',
        }));
        const out = await composeSheets({
          shots, layout, landscape, info, includeInfo: settings.printInfo,
          footer: `My3DObjects · ${new Date().toLocaleString()}`,
        });
        if (my === run.current) {
          setSheets(out);
          setIndex((i) => Math.min(i, out.length - 1));
        }
      } catch {
        if (my === run.current) setSheets([]);
      }
      if (my === run.current) setRendering(false);
    }, 60);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, layout, landscape, settings.printInfo, settings.printWhite, settings.printHelpers, info?.title]);

  if (!open) return null;

  const noPrinter = direct && !printers.loading && !printer;
  const submit = (viaSystem = false) => {
    if (!sheets.length || busy || rendering) return;
    if (direct && !viaSystem) {
      if (!printer) return;
      set({ printPrinter: printer });
      onPrint({ pages: sheets, printer, copies: clampCopies(copies), landscape });
      return;
    }
    onPrint({ pages: sheets, viaSystem: true, landscape });
  };

  const LAYOUT_HINT = { view: 1, views4: 4, views6: 6, sheets: LAYOUT_VIEWS.sheets.length };

  return (
    <Modal
      open
      title={t('print.title')}
      icon={IconPrint}
      onClose={onClose}
      width={900}
      className="print-modal"
      closeLabel={t('common.cancel')}
      footer={(
        <>
          <span className="print-count">{t('print.willPrint', { n: sheets.length })}</span>
          <div className="spacer" />
          {direct ? (
            <button className="btn" onClick={() => submit(true)} disabled={!sheets.length || busy} title={t('print.viaSystemTip')}>
              {t('print.viaSystem')}
            </button>
          ) : null}
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button
            className="btn primary"
            onClick={() => submit(false)}
            disabled={!sheets.length || busy || rendering || (direct && (printers.loading || noPrinter))}
            data-autofocus
          >
            <IconPrint size={15} /> {busy ? t('print.working') : t('print.print')}
          </button>
        </>
      )}
    >
      <div className="print-layout">
        <div className="print-options">
          <div className="print-scopes" role="radiogroup" aria-label={t('print.layout')}>
            {PRINT_LAYOUTS.map((id) => (
              <label key={id} className={`print-scope${layout === id ? ' active' : ''}`}>
                <input type="radio" name="print-layout" checked={layout === id} onChange={() => set({ printLayout: id })} />
                <span className="print-scope-text">
                  <span className="print-scope-label">{t(`print.layouts.${id}`)}</span>
                  <span className="print-scope-hint">{t(`print.layoutHints.${id}`, { n: LAYOUT_HINT[id] })}</span>
                </span>
              </label>
            ))}
          </div>

          <Check label={t('print.info')} checked={settings.printInfo} onChange={(v) => set({ printInfo: v })} />
          <Check label={t('print.white')} checked={settings.printWhite} onChange={(v) => set({ printWhite: v })} />
          <Check label={t('print.helpers')} checked={settings.printHelpers} onChange={(v) => set({ printHelpers: v })} />

          <div className="print-device">
            {direct ? (
              <label className="field">
                <span className="field-label">{t('print.printer')}</span>
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
              </label>
            ) : null}
            <div className="print-device-row">
              {direct ? (
                <div className="field">
                  <span className="field-label">{t('print.copies')}</span>
                  <NumberStepper min={1} max={99} value={clampCopies(copies)} format={(n) => t('print.copiesValue', { n })} onChange={setCopies} label={t('print.copies')} />
                </div>
              ) : null}
              <label className="field">
                <span className="field-label">{t('print.orientation')}</span>
                <select className="input" value={settings.printOrientation} onChange={(e) => set({ printOrientation: e.target.value })} data-print-orientation>
                  {PRINT_ORIENTATIONS.map((o) => <option key={o} value={o}>{t(`print.orient.${o}`)}</option>)}
                </select>
              </label>
            </div>
            {noPrinter ? <p className="field-error">{t('print.noPrinters')}</p> : null}
          </div>

          <p className="capture-note">{direct ? t('print.noteDirect') : t('print.note')}</p>
        </div>

        <aside className="print-preview" aria-label={t('print.preview')}>
          <div className="print-preview-label">{t('print.preview')}</div>
          <div className={`print-preview-sheet${rendering ? ' busy' : ''}`}>
            {sheets[index] ? (
              <img className="print-preview-canvas" src={sheets[index]} alt={t('print.preview')} />
            ) : (
              <p className="print-preview-empty">{rendering ? t('print.rendering') : t('print.previewEmpty')}</p>
            )}
          </div>
          <div className="print-preview-nav">
            <button className="icon-btn" type="button" disabled={index <= 0} onClick={() => setIndex((i) => Math.max(0, i - 1))} title={t('print.prevSheet')} aria-label={t('print.prevSheet')}>
              <IconPrev size={16} />
            </button>
            <span className="print-preview-page">{sheets.length ? t('print.sheetOf', { index: index + 1, total: sheets.length }) : '—'}</span>
            <button className="icon-btn" type="button" disabled={index >= sheets.length - 1} onClick={() => setIndex((i) => Math.min(sheets.length - 1, i + 1))} title={t('print.nextSheet')} aria-label={t('print.nextSheet')}>
              <IconNext size={16} />
            </button>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
