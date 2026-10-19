// Print preview (Ctrl+P): the pages as they will print (an iframe of the
// print HTML, src/lib/print.js), the options beside them — printer, paper,
// orientation, margin, one page or tiles, header / footer, colour, copies.
// Desktop: the job goes to the chosen printer through the desktop service;
// web: the browser's own print dialog.
import React, { useEffect, useMemo, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { Dialog } from './Dialogs';
import { Icon } from '../components/Icons';
import { isDesktop, listPrinters, printHtml } from '../lib/backend';
import { printDocument, PRINT_PAPERS } from '../lib/print';
import { mapPicture } from '../lib/exportimg';
import { mapTitle } from '../lib/model';

const MM = 3.7795;   // CSS px per mm

export function PrintPreviewDialog({ map, settings, onSettings, onClose, onDone }) {
  useLanguage();
  const lang = getLanguage();
  const [printers, setPrinters] = useState([]);
  const [printer, setPrinter] = useState('');
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [zoom, setZoom] = useState(0.5);
  const o = {
    paper: settings.printPaper || 'a4', landscape: !!settings.printLandscape, margin: settings.printMargin ?? 10,
    header: settings.printHeader !== false, footer: settings.printFooter !== false, pages: settings.printPages || 1, color: settings.printColor !== false,
  };
  const pic = useMemo(() => mapPicture(map, { lang, settings, padding: 16 }), [map, lang, settings.mapFont, settings.mapFontSize]);   // eslint-disable-line react-hooks/exhaustive-deps
  const doc = useMemo(() => printDocument(pic, { ...o, title: mapTitle(map), lang }), [pic, o.paper, o.landscape, o.margin, o.header, o.footer, o.pages, o.color]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isDesktop) return;
    listPrinters().then((list) => { setPrinters(list || []); const d = (list || []).find((p) => p.isDefault); if (d) setPrinter(d.name); }).catch(() => {});
  }, []);
  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await printHtml(doc.html, mapTitle(map), { deviceName: printer, pageSize: o.paper, landscape: o.landscape, copies, color: o.color });
      if (r && r.success === false) { setErr(r.failureReason === 'no-browser' ? t('print_no_browser') : r.failureReason === 'popup-blocked' ? t('print_popup_blocked') : r.failureReason || t('print_failed')); setBusy(false); return; }
      setBusy(false);
      onDone();
    } catch (e) { setErr(e.message || String(e)); setBusy(false); }
  };
  const pw = doc.size.w * MM, ph = doc.size.h * MM;
  return (
    <Dialog title={t('print_title')} icon="print" kind="info" className="print-preview" width={1100} onClose={onClose}
      footer={<>{err && <span className="danger small">{err}</span>}<span className="spacer" /><button className="btn" onClick={onClose}>{t('cancel')}</button><button className="btn primary" disabled={busy} onClick={go}>{busy ? t('print_busy') : t('print_go')}</button></>}>
      <div className="print-pv-main">
        <div className="print-pv-stage">
          <div className="print-pv-bar">
            <span className="muted small">{t('print_page_count', { n: doc.pages })}</span>
            <span className="spacer" />
            <button type="button" className="icon-btn" onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))}><Icon name="zoomOut" size={15} /></button>
            <span className="print-pv-zoom small">{Math.round(zoom * 100)}%</span>
            <button type="button" className="icon-btn" onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}><Icon name="zoomIn" size={15} /></button>
          </div>
          <div className="print-pv-scroll">
            <div className="print-pv-scale" style={{ width: pw * zoom, height: (ph + 8 * MM) * doc.pages * zoom }}>
              <iframe title="print preview" srcDoc={doc.html} style={{ width: pw, height: (ph + 8 * MM) * doc.pages, transform: `scale(${zoom})` }} />
            </div>
          </div>
        </div>
        <div className="print-pv-side">
          {isDesktop && (<>
            <label>{t('print_printer')}</label>
            <select value={printer} onChange={(e) => setPrinter(e.target.value)}>
              {!printers.length && <option value="">{t('print_default_printer')}</option>}
              {printers.map((p) => <option key={p.name} value={p.name}>{p.displayName}{p.isDefault ? ` (${t('print_default')})` : ''}</option>)}
            </select>
            <label>{t('print_copies')}</label>
            <input type="number" min={1} max={99} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} />
          </>)}
          <label>{t('print_paper')}</label>
          <select value={o.paper} onChange={(e) => onSettings({ printPaper: e.target.value })}>
            {PRINT_PAPERS.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
          </select>
          <label>{t('print_orientation')}</label>
          <select value={o.landscape ? 'landscape' : 'portrait'} onChange={(e) => onSettings({ printLandscape: e.target.value === 'landscape' })}>
            <option value="portrait">{t('print_portrait')}</option>
            <option value="landscape">{t('print_landscape')}</option>
          </select>
          <label>{t('print_pages')}</label>
          <select value={o.pages} onChange={(e) => onSettings({ printPages: Number(e.target.value) })}>
            {[1, 2, 4, 6, 9].map((n) => <option key={n} value={n}>{n === 1 ? t('print_fit_one') : t('print_tiles', { n })}</option>)}
          </select>
          <label>{t('print_margin')}</label>
          <input type="number" min={0} max={40} value={o.margin} onChange={(e) => onSettings({ printMargin: Math.max(0, Math.min(40, Number(e.target.value) || 0)) })} />
          <div className="print-pv-checks">
            <label className="check"><input type="checkbox" checked={o.header} onChange={(e) => onSettings({ printHeader: e.target.checked })} /><span>{t('print_header')}</span></label>
            <label className="check"><input type="checkbox" checked={o.footer} onChange={(e) => onSettings({ printFooter: e.target.checked })} /><span>{t('print_footer')}</span></label>
            <label className="check"><input type="checkbox" checked={o.color} onChange={(e) => onSettings({ printColor: e.target.checked })} /><span>{t('print_color')}</span></label>
          </div>
          {!isDesktop && <p className="muted small">{t('print_web_note')}</p>}
        </div>
      </div>
    </Dialog>
  );
}

export default PrintPreviewDialog;
