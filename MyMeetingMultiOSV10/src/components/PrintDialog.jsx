import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconPrinter, IconX } from './Icons';
import PrintPreview from './PrintPreview';

// Parse a page-range expression ("1,3,5-8") into a sorted, de-duplicated list of
// 1-based page numbers, clamped to `total`. Returns [] when nothing is valid, so
// the caller can keep the Print button disabled on a malformed range.
export function parsePageRange(text, total) {
  const out = new Set();
  for (const part of String(text || '').split(/[,\s]+/)) {
    if (!part) continue;
    const m = part.match(/^(\d+)(?:\s*[-~]\s*(\d+))?$/);
    if (!m) return [];
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    if (!from || !to || from > to) return [];
    for (let n = from; n <= to; n++) if (!total || n <= total) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

const PER_SHEET = [1, 2, 4, 6, 9, 16];

export const DEFAULT_PRINT_OPTIONS = {
  deviceName: '',        // '' = the system default printer
  copies: 1,
  collate: true,
  color: true,
  duplexMode: 'simplex', // simplex | longEdge | shortEdge
  landscape: false,
  scaleFactor: 100,
  pagesPerSheet: 1,
  silent: false,         // false = show the system print dialog first
};

// Print dialog: WHAT to print (the whole document, the page the cursor is on, or
// a typed page range) and HOW to print it (printer, copies, colour, duplex,
// orientation, scale, N-up). The page count comes from a real pagination pass,
// so the numbers shown here are the numbers that will be printed.
export default function PrintDialog({
  open, busy, pages, currentPage, html, printers = [], options, onOptions, onPrint, onClose,
}) {
  const { t } = useTranslation();
  const [scope, setScope] = useState('all'); // all | current | range
  const [range, setRange] = useState('');
  const [view, setView] = useState(1);
  const rangeRef = useRef(null);

  const o = { ...DEFAULT_PRINT_OPTIONS, ...(options || {}) };
  const set = (patch) => onOptions({ ...o, ...patch });

  // Reset the page selection every time the dialog is opened. The preview
  // starts on page 1; choosing "current page" jumps to that page afterwards.
  useEffect(() => {
    if (!open) return;
    setScope('all');
    setView(1);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setRange(currentPage ? String(currentPage) : '1');
  }, [open, currentPage]);

  useEffect(() => {
    if (open && scope === 'current' && currentPage) setView(currentPage);
  }, [open, scope, currentPage]);

  useEffect(() => {
    if (open && scope === 'range') rangeRef.current?.focus();
  }, [open, scope]);

  const selected = useMemo(() => {
    if (scope === 'all') return null;
    if (scope === 'current') return currentPage ? [currentPage] : [];
    return parsePageRange(range, pages);
  }, [scope, range, pages, currentPage]);

  if (!open) return null;

  const invalid = scope === 'range' && range.trim() !== '' && selected.length === 0;
  const count = selected === null ? pages : selected.length;
  const canPrint = !busy && (selected === null || selected.length > 0);

  const submit = () => { if (canPrint) onPrint(selected, o); };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal print-modal" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}>
        <div className="modal-head">
          <div className="modal-title">
            <span className="mh-icon"><IconPrinter size={18} /></span>
            <h2>{t('print.title')}</h2>
          </div>
          <button className="iconbtn" onClick={onClose} disabled={busy} title={t('about.close')}><IconX /></button>
        </div>

        <div className="print-layout">
        <PrintPreview
          html={html || ''}
          view={view}
          onView={setView}
          included={selected}
          landscape={o.landscape}
          scaleFactor={o.scaleFactor}
          color={o.color}
          pagesPerSheet={o.pagesPerSheet}
        />
        <div className="modal-body print-body">
          {/* ── Printer ──────────────────────────────────── */}
          {printers.length > 0 && (
            <div className="print-sec">
              <div className="print-lab"><label htmlFor="pr-device">{t('print.printer')}</label></div>
              <select id="pr-device" className="print-input" value={o.deviceName}
                onChange={(e) => set({ deviceName: e.target.value })}>
                <option value="">{t('print.defaultPrinter')}</option>
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName}{p.isDefault ? ` (${t('print.isDefault')})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ── What to print ────────────────────────────── */}
          <div className="print-sec">
            <div className="print-lab">
              <span>{t('print.scopeLabel')}</span>
              <span className="print-total">
                {pages ? t('print.total', { count: pages })
                  : (busy ? t('print.measuring') : t('print.totalUnknown'))}
              </span>
            </div>

            <div className="print-scopes">
              <label className="print-scope">
                <input type="radio" name="print-scope" checked={scope === 'all'}
                  onChange={() => setScope('all')} />
                <span>
                  <b>{t('print.all')}</b>
                  <em>{pages ? t('print.allHint', { count: pages }) : t('print.allHintUnknown')}</em>
                </span>
              </label>

              <label className={`print-scope${!currentPage ? ' disabled' : ''}`}>
                <input type="radio" name="print-scope" checked={scope === 'current'} disabled={!currentPage}
                  onChange={() => setScope('current')} />
                <span>
                  <b>{t('print.current')}</b>
                  <em>{currentPage ? t('print.currentHint', { page: currentPage }) : t('print.currentUnavailable')}</em>
                </span>
              </label>

              <label className={`print-scope${!pages ? ' disabled' : ''}`}>
                <input type="radio" name="print-scope" checked={scope === 'range'} disabled={!pages}
                  onChange={() => setScope('range')} />
                <span>
                  <b>{t('print.range')}</b>
                  <em>{t('print.rangeHint')}</em>
                </span>
              </label>

              <input
                ref={rangeRef}
                type="text"
                className={`print-input print-range${invalid ? ' invalid' : ''}`}
                value={range}
                disabled={scope !== 'range'}
                placeholder={t('print.rangePh')}
                onChange={(e) => setRange(e.target.value)}
                onFocus={() => { if (pages) setScope('range'); }}
              />
              {invalid && <span className="field-error">{t('print.rangeInvalid')}</span>}
            </div>
          </div>

          {/* ── How to print ─────────────────────────────── */}
          <div className="print-sec">
            <div className="print-lab"><span>{t('print.optionsLabel')}</span></div>
            <div className="print-grid">
              <label htmlFor="pr-copies">{t('print.copies')}</label>
              <input id="pr-copies" type="number" min="1" max="99" className="print-input print-num"
                value={o.copies} onChange={(e) => set({ copies: Number(e.target.value) || 1 })} />

              <label htmlFor="pr-color">{t('print.color')}</label>
              <select id="pr-color" className="print-input" value={o.color ? 'color' : 'mono'}
                onChange={(e) => set({ color: e.target.value === 'color' })}>
                <option value="color">{t('print.colorOn')}</option>
                <option value="mono">{t('print.colorOff')}</option>
              </select>

              <label htmlFor="pr-duplex">{t('print.duplex')}</label>
              <select id="pr-duplex" className="print-input" value={o.duplexMode}
                onChange={(e) => set({ duplexMode: e.target.value })}>
                <option value="simplex">{t('print.duplexOff')}</option>
                <option value="longEdge">{t('print.duplexLong')}</option>
                <option value="shortEdge">{t('print.duplexShort')}</option>
              </select>

              <label htmlFor="pr-orient">{t('print.orientation')}</label>
              <select id="pr-orient" className="print-input" value={o.landscape ? 'landscape' : 'portrait'}
                onChange={(e) => set({ landscape: e.target.value === 'landscape' })}>
                <option value="portrait">{t('print.portrait')}</option>
                <option value="landscape">{t('print.landscape')}</option>
              </select>

              <label htmlFor="pr-scale">{t('print.scale')}</label>
              <input id="pr-scale" type="number" min="10" max="200" step="5" className="print-input print-num"
                value={o.scaleFactor} onChange={(e) => set({ scaleFactor: Number(e.target.value) || 100 })} />

              <label htmlFor="pr-nup">{t('print.perSheet')}</label>
              <select id="pr-nup" className="print-input" value={o.pagesPerSheet}
                onChange={(e) => set({ pagesPerSheet: Number(e.target.value) })}>
                {PER_SHEET.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <label className={`print-check${o.copies < 2 ? ' disabled' : ''}`}>
              <input type="checkbox" checked={o.collate} disabled={o.copies < 2}
                onChange={(e) => set({ collate: e.target.checked })} />
              <span>{t('print.collate')}</span>
            </label>
            <label className="print-check">
              <input type="checkbox" checked={!o.silent}
                onChange={(e) => set({ silent: !e.target.checked })} />
              <span>
                {t('print.showDialog')}
                <em>{t('print.showDialogHint')}</em>
              </span>
            </label>
          </div>
        </div>
        </div>

        <div className="modal-foot">
          <span className="print-count muted">
            {selected !== null && !invalid ? t('print.willPrint', { count }) : ''}
          </span>
          <button className="btn" onClick={onClose} disabled={busy}>{t('print.cancel')}</button>
          <button className="btn primary" onClick={submit} disabled={!canPrint}>
            <IconPrinter size={16} /> {busy ? t('print.working') : t('print.go')}
          </button>
        </div>
      </div>
    </div>
  );
}
