import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { DialogFrame } from './DialogFrame.jsx';
import { Icon } from '../components/Icons.jsx';
import { Check, NumberInput } from '../components/common.jsx';
import { platform } from '../lib/platform.js';
import { PAPERS, DEFAULT_PRINT_SETTINGS, docsInScope, layoutPages } from '../lib/printLayout.js';

const STORE_KEY = 'capturemaster.print';
const PDF = '\u0000pdf';
const PX_PER_MM = 96 / 25.4;

function loadStored() {
  try { return { ...DEFAULT_PRINT_SETTINGS, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; } catch { return { ...DEFAULT_PRINT_SETTINGS }; }
}

const mm = (v) => `${v}mm`;

/** One sheet in millimetres; the preview scales it with `zoom`, printing uses it as is. */
function Sheet({ layout, page, total, gray }) {
  const { sheet, content, margin, header } = layout;
  return (
    <div className={`print-sheet${gray ? ' gray' : ''}`} style={{ width: mm(sheet.w), height: mm(sheet.h) }}>
      {header ? (
        <div className="print-header" style={{ left: mm(margin), right: mm(margin), top: mm(margin), height: mm(header) }}>
          <span>{page.doc.name}</span><span>{page.index + 1} / {total}</span>
        </div>
      ) : null}
      <div className="print-content" style={{ left: mm(content.x), top: mm(content.y), width: mm(content.w), height: mm(content.h) }}>
        <div className="print-box" style={{ left: mm(page.box.x), top: mm(page.box.y), width: mm(page.box.w), height: mm(page.box.h) }}>
          {page.doc.src ? <img src={page.doc.src} alt="" draggable={false} style={{ left: mm(page.img.x), top: mm(page.img.y), width: mm(page.img.w), height: mm(page.img.h) }} /> : null}
        </div>
      </div>
    </div>
  );
}

// ── Print: settings on the left, the pages as they will print on the right ──
export function PrintDialog({ payload, onSubmit, onClose, standalone }) {
  const { t } = useTranslation();
  const p = payload || {};
  const docs = useMemo(() => p.docs || [], [p.docs]);
  const direct = !!p.direct;

  const [s, setS] = useState(loadStored);
  const set = (patch) => setS((prev) => ({ ...prev, ...patch }));
  useEffect(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* storage is optional */ } }, [s]);

  const [scope, setScope] = useState(docs.length > 1 ? 'all' : 'current');
  const [picked, setPicked] = useState(() => new Set(p.currentId ? [p.currentId] : []));
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [printers, setPrinters] = useState({ printers: [], default: '' });
  const [pageIndex, setPageIndex] = useState(0);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!direct) return;
    platform.printer.list().then(setPrinters).catch(() => {});
  }, [direct]);

  const chosen = useMemo(() => docsInScope(docs, scope, p.currentId, picked), [docs, scope, p.currentId, picked]);
  const useSelection = selectionOnly && scope !== 'all' && !!p.hasSelection;
  const layout = useMemo(() => layoutPages(chosen, s, { selectionOnly: useSelection, currentId: p.currentId }), [chosen, s, useSelection, p.currentId]);
  const total = layout.pages.length;
  const index = Math.min(pageIndex, Math.max(0, total - 1));
  const gray = s.color === 'gray';

  // The saved printer may be gone; fall back to the default.
  const printerList = printers.printers || [];
  const printer = s.printer === PDF || (s.printer && printerList.includes(s.printer)) ? s.printer : (printers.default || '');

  // Preview: the current sheet zoomed to fit the pane.
  const paneRef = useRef(null);
  const [zoom, setZoom] = useState(0.5);
  useLayoutEffect(() => {
    const el = paneRef.current;
    if (!el) return undefined;
    const fit = () => {
      const z = Math.min((el.clientWidth - 40) / (layout.sheet.w * PX_PER_MM), (el.clientHeight - 40) / (layout.sheet.h * PX_PER_MM));
      setZoom(Math.max(0.05, z));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout.sheet.w, layout.sheet.h]);

  const toggle = (id) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const doPrint = async () => {
    if (!total) return;
    if (!direct) {
      onSubmit({ docIds: chosen.map((d) => d.id), selectionOnly: useSelection, landscape: layout.sheet.landscape, fit: s.layout === 'fit' });
      return;
    }
    setError('');
    let pdfPath = null;
    if (printer === PDF) {
      const base = (chosen.length === 1 ? chosen[0].name : 'CaptureMaster').replace(/[\\/:*?"<>|]/g, '_');
      pdfPath = await platform.pickSavePath({ defaultName: `${base}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }], title: t('print.savePdf') });
      if (!pdfPath) return;
      if (!/\.pdf$/i.test(pdfPath)) pdfPath += '.pdf';
    }
    setBusy(pdfPath ? 'pdf' : 'print');
    try {
      await Promise.all([...document.querySelectorAll('.print-output img')].map((im) => (im.complete ? null : im.decode().catch(() => null))));
      await platform.printer.printPage({
        printer: printer === PDF ? '' : printer,
        copies: s.copies,
        widthMm: layout.sheet.w,
        heightMm: layout.sheet.h,
        grayscale: gray,
        duplex: s.duplex,
        pdfPath,
      });
      onSubmit({ printed: true, pages: total, pdf: pdfPath });
    } catch (err) {
      const message = String((err && err.message) || err);
      if (message === 'unsupported') {
        // No direct printing on this system: the system print dialog prints the same page.
        window.print();
        onSubmit({ printed: true, pages: total });
        return;
      }
      setError(t('print.failed', { message }));
      setBusy(null);
    }
  };

  const orientationLabel = layout.sheet.landscape ? t('print.landscape') : t('print.portrait');
  const page = layout.pages[index];

  return (
    <DialogFrame title={t('print.title')} standalone={standalone} onClose={onClose} className="print-dlg"
      footer={<>
        <span className={`left${error ? ' print-error' : ''}`}>{error || (busy ? t(busy === 'pdf' ? 'print.savingPdf' : 'print.printing') : (total ? t('print.pages', { n: total }) : t('print.none')))}</span>
        <button className="btn" onClick={onClose} disabled={!!busy}>{t('common.cancel')}</button>
        <button className="btn primary" disabled={!total || !!busy} onClick={doPrint}>
          <Icon name="print" />{printer === PDF ? t('print.save') : t('print.print')}
        </button>
      </>}
    >
      <div className="print-layout">
        <div className="print-settings">
          {direct ? (
            <>
              <div className="section-title">{t('print.output')}</div>
              <div className="print-row">
                <label>{t('print.printer')}</label>
                <select value={printer} onChange={(e) => set({ printer: e.target.value })}>
                  {printerList.length ? null : <option value="">{t('print.defaultPrinter')}</option>}
                  {printerList.map((n) => <option key={n} value={n}>{n === printers.default ? `${n} ${t('print.isDefault')}` : n}</option>)}
                  <option value={PDF}>{t('print.savePdf')}</option>
                </select>
              </div>
              <div className="print-row">
                <label>{t('print.copies')}</label>
                <NumberInput min={1} max={99} value={s.copies} disabled={printer === PDF} onChange={(v) => set({ copies: v })} ariaLabel={t('print.copies')} />
              </div>
              <div className="print-row">
                <label>{t('print.color')}</label>
                <select value={s.color} onChange={(e) => set({ color: e.target.value })}>
                  <option value="color">{t('print.colorColor')}</option>
                  <option value="gray">{t('print.colorGray')}</option>
                </select>
              </div>
              <div className="print-row">
                <label>{t('print.duplex')}</label>
                <select value={s.duplex} disabled={printer === PDF} onChange={(e) => set({ duplex: e.target.value })}>
                  <option value="one">{t('print.duplexOne')}</option>
                  <option value="long">{t('print.duplexLong')}</option>
                  <option value="short">{t('print.duplexShort')}</option>
                </select>
              </div>
            </>
          ) : null}

          <div className="section-title">{t('print.documents')}</div>
          <label className="check"><input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} /><span>{t('print.all', { n: docs.length })}</span></label>
          <label className="check"><input type="radio" checked={scope === 'current'} disabled={!p.currentId} onChange={() => setScope('current')} /><span>{t('print.current')}</span></label>
          <label className="check"><input type="radio" checked={scope === 'custom'} onChange={() => setScope('custom')} /><span>{t('print.custom')}</span></label>
          {scope === 'custom' ? (
            <div className="doc-list" style={{ margin: '4px 0 6px 24px' }}>
              {docs.map((d) => (
                <label key={d.id}>
                  <input type="checkbox" checked={picked.has(d.id)} onChange={() => toggle(d.id)} />
                  <Icon name={d.kind === 'video' ? 'video' : 'image'} size={14} />
                  <span>{d.name}</span>
                </label>
              ))}
            </div>
          ) : null}
          {scope !== 'all' ? (
            <div style={{ marginLeft: 24 }}>
              <Check label={`${t('print.selectionOnly')} ${p.hasSelection ? '' : t('print.noSelection')}`} checked={selectionOnly} disabled={!p.hasSelection} onChange={setSelectionOnly} />
            </div>
          ) : null}

          <div className="section-title">{t('print.pageSetup')}</div>
          <div className="print-row">
            <label>{t('print.paper')}</label>
            <select value={s.paper} onChange={(e) => set({ paper: e.target.value })}>
              {PAPERS.map((x) => <option key={x.id} value={x.id}>{x.label} ({x.w} × {x.h} mm)</option>)}
            </select>
          </div>
          <div className="print-row">
            <label>{t('print.orientation')}</label>
            <select value={s.orientation} onChange={(e) => set({ orientation: e.target.value })}>
              <option value="auto">{t('print.auto')}</option>
              <option value="portrait">{t('print.portrait')}</option>
              <option value="landscape">{t('print.landscape')}</option>
            </select>
          </div>
          <div className="print-row">
            <label>{t('print.layout')}</label>
            <select value={s.layout} onChange={(e) => set({ layout: e.target.value })}>
              <option value="fit">{t('print.layoutFit')}</option>
              <option value="fill">{t('print.layoutFill')}</option>
              <option value="actual">{t('print.layoutActual')}</option>
              <option value="custom">{t('print.layoutCustom')}</option>
            </select>
          </div>
          {s.layout === 'custom' ? (
            <div className="print-row">
              <label>{t('print.scale')}</label>
              <NumberInput min={10} max={400} step={5} value={s.scale} onChange={(v) => set({ scale: v })} ariaLabel={t('print.scale')} unit="%" />
            </div>
          ) : null}
          <div className="print-row">
            <label>{t('print.margins')}</label>
            <select value={s.margin} onChange={(e) => set({ margin: e.target.value })}>
              <option value="none">{t('print.marginNone')}</option>
              <option value="narrow">{t('print.marginNarrow')}</option>
              <option value="normal">{t('print.marginNormal')}</option>
              <option value="wide">{t('print.marginWide')}</option>
            </select>
          </div>
          <Check label={t('print.header')} checked={s.header} onChange={(v) => set({ header: v })} />
        </div>

        <div className="print-preview">
          <div className="print-pane" ref={paneRef}>
            {page ? (
              <div style={{ zoom }}>
                <Sheet layout={layout} page={page} total={total} gray={gray} />
              </div>
            ) : <div className="print-empty">{t('print.none')}</div>}
          </div>
          <div className="print-nav">
            <button className="btn icon" aria-label={t('print.prevPage')} disabled={index <= 0} onClick={() => setPageIndex(index - 1)}><Icon name="chevronLeft" /></button>
            <span>{total ? t('print.pageOf', { i: index + 1, n: total }) : ''}</span>
            <button className="btn icon" aria-label={t('print.nextPage')} disabled={index >= total - 1} onClick={() => setPageIndex(index + 1)}><Icon name="chevronRight" /></button>
            <span className="dim">{t('print.sheetInfo', { paper: layout.sheet.paper.label, orientation: orientationLabel, w: Math.round(layout.sheet.w), h: Math.round(layout.sheet.h) })}</span>
          </div>
        </div>
      </div>

      {direct ? createPortal(
        <div className="print-output">
          <style>{`@page { size: ${layout.sheet.w}mm ${layout.sheet.h}mm; margin: 0; }`}</style>
          {layout.pages.map((pg) => <Sheet key={pg.doc.id} layout={layout} page={pg} total={total} gray={gray} />)}
        </div>,
        document.body,
      ) : null}
    </DialogFrame>
  );
}
