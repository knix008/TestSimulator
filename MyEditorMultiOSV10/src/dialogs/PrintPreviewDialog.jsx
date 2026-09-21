// Print preview: the HTML that will be sent to the printer (a rendered
// Markdown / HTML page, a picture, or a numbered listing) is shown as
// separate A4 sheets. For a code listing the toolbar repeats the print
// options (settings › print) so they can be tried on the page. On the
// desktop this dialog fills its own window; Print sends the page to the
// chosen printer. Cancel closes.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from '../components/Icons';
import { Dialog } from './Dialogs';
import { buildCodePrintHtmlAsync, isPagedPrint, printOptsOf, pageSizePx, PRINT_PAPERS } from '../lib/print';
import { withProgress } from '../lib/progress';
import { isElectron, listPrinters, printHtml } from '../lib/backend';

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5];

function printLabels() {
  return {
    print: t('print_title'),
    close: t('cancel'),
    destination: t('print_destination'),
    copies: t('print_copies'),
    color: t('print_color_mode'),
    colorColor: t('print_color_color'),
    colorMono: t('print_color_mono'),
    layout: t('print_layout'),
    portrait: t('print_portrait'),
    landscape: t('print_landscape'),
    noPrinters: t('print_no_printers'),
    printing: t('print_printing'),
    failed: t('print_failed'),
  };
}

export function PrintPreviewDialog({ html: html0, title, path, lang, text, lineHtml, code, settings, onPrintOpts, onResult, embedded = false }) {
  useLanguage();
  const stageRef = useRef(null);
  const frameRef = useRef(null);
  const [html, setHtml] = useState(html0);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [pageH, setPageH] = useState(() => pageSizePx(printOptsOf(settings)).h);
  const [printers, setPrinters] = useState([]);
  const [deviceName, setDeviceName] = useState('');
  const [copies, setCopies] = useState(1);
  const [color, setColor] = useState(true);
  const [landscape, setLandscape] = useState(!!settings.printLandscape);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const paged = isPagedPrint(html);
  const opts = printOptsOf(settings);
  const sheet = pageSizePx(opts);
  useEffect(() => { setLandscape(!!opts.printLandscape); }, [opts.printLandscape]);
  const skipFirst = useRef(true);

  useEffect(() => { setHtml(html0); skipFirst.current = true; }, [html0]);
  useEffect(() => {
    let alive = true;
    listPrinters().then((list) => {
      if (!alive) return;
      const rows = Array.isArray(list) ? list : [];
      setPrinters(rows);
      const def = rows.find((p) => p && p.isDefault) || rows[0];
      if (def && def.name) setDeviceName(def.name);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!code || text == null) return undefined;
    if (skipFirst.current) { skipFirst.current = false; return undefined; }   // printDoc already built html0
    let alive = true;
    const nextOpts = printOptsOf(settings);
    const big = String(text).length > 80000 || String(text).split('\n').length > 1500;
    withProgress({ title: t('prog_print'), message: t('prog_print_pages'), detail: title, delay: big ? 0 : 220 }, async ({ report }) => {
      const next = await buildCodePrintHtmlAsync({ title, path, lang, text, lineHtml, opts: nextOpts }, (v) => report({ value: v }));
      if (alive) setHtml(next);
    }).catch(() => {});
    return () => { alive = false; };
  }, [code, text, title, path, lang, lineHtml, settings]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Fit the sheet to the stage (never larger than 100 %) until the user picks a zoom.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !fit) return undefined;
    const apply = () => setZoom(Math.max(0.25, Math.min(1, (el.clientWidth - 40) / sheet.w)));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, landscape, sheet.w]);

  // The iframe grows with its document so the sheet is as tall as the printout.
  const measure = () => {
    const doc = frameRef.current && frameRef.current.contentDocument;
    if (!doc) return;
    const h = Math.max(doc.documentElement.scrollHeight, (doc.body && doc.body.scrollHeight) || 0, sheet.h);
    setPageH(h);
  };
  const onLoad = () => {
    measure();
    const doc = frameRef.current && frameRef.current.contentDocument;
    if (!doc) return;
    for (const img of doc.images) {
      if (!img.complete) img.addEventListener('load', measure);
    }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onResult(null); }
      else if (e.key === 'Enter') { e.preventDefault(); go(); }
    };
    doc.addEventListener('keydown', onKey);
  };

  const pickZoom = (z) => { setFit(false); setZoom(z); };
  const stepZoom = (dir, from = zoom) => {
    const i = ZOOMS.reduce((best, z, n) => (Math.abs(z - from) < Math.abs(ZOOMS[best] - from) ? n : best), 0);
    pickZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + dir))]);
  };
  const printOpts = () => ({ deviceName, copies, color, landscape, pageSize: opts.printPaper });
  const go = async () => {
    if (busy) return;
    if (embedded && isElectron) {
      setBusy(true);
      setErr('');
      try {
        const r = await printHtml(html, t('print_title'), printLabels(), { silent: true, ...printOpts() });
        if (r && r.success === false) { setErr(r.failureReason || t('print_failed')); setBusy(false); return; }
        onResult(null);
      } catch {
        setErr(t('print_failed'));
        setBusy(false);
      }
      return;
    }
    onResult({ print: true, html, ...printOpts() });
  };

  // Ctrl+wheel zooms the sheet (same as the rest of the app).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      stepZoom(e.deltaY < 0 ? 1 : -1, zoomRef.current);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => { if (onPrintOpts) onPrintOpts({ [id]: !opts[id] }); };
  const sheetW = sheet.w;

  return (
    <Dialog title={t('print_title')} icon="print" kind="info" className="print-preview" width={1100} embedded={embedded} onClose={() => onResult(null)} onEnter={go}
      footer={<><button className="btn" disabled={busy} onClick={() => onResult(null)}>{t('cancel')}</button><button className="btn primary" data-autofocus disabled={busy} onClick={go}>{busy ? t('print_printing') : t('print')}</button></>}>
      <div className="print-pv-bar">
        <span className="ellipsis muted small print-pv-name" title={title}>{title}</span>
        <button className="btn small" title={t('print_zoom_out')} disabled={zoom <= ZOOMS[0] && !fit} onClick={() => stepZoom(-1)}><Icon name="zoomOut" size={14} /></button>
        <span className="muted small print-pv-zoom">{t('print_zoom', { n: Math.round(zoom * 100) })}</span>
        <button className="btn small" title={t('print_zoom_in')} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} onClick={() => stepZoom(1)}><Icon name="zoomIn" size={14} /></button>
        <button className={`btn small ${fit ? 'on' : ''}`} title={t('print_fit')} onClick={() => setFit(true)}>{t('print_fit')}</button>
      </div>
      {code && onPrintOpts && (
        <div className="print-pv-opts">
          <label className="check"><input type="checkbox" checked={opts.printHeader} onChange={() => toggle('printHeader')} /><span>{t('set_print_header')}</span></label>
          <label className="check"><input type="checkbox" checked={opts.printLineNumbers} onChange={() => toggle('printLineNumbers')} /><span>{t('set_print_linenos')}</span></label>
          <label className="check"><input type="checkbox" checked={opts.printBorder} onChange={() => toggle('printBorder')} /><span>{t('set_print_border')}</span></label>
          <label className="check"><input type="checkbox" checked={opts.printPageNumbers} onChange={() => toggle('printPageNumbers')} /><span>{t('set_print_pages')}</span></label>
          <label className="check"><input type="checkbox" checked={opts.printDate} onChange={() => toggle('printDate')} /><span>{t('set_print_date')}</span></label>
          <span className="print-pv-sep" />
          <label className="check"><input type="checkbox" checked={opts.printSyntax} onChange={() => toggle('printSyntax')} /><span>{t('set_print_syntax_s')}</span></label>
          <label className="check"><input type="checkbox" checked={opts.printColor} onChange={() => toggle('printColor')} /><span>{t('set_print_color_s')}</span></label>
          <label className="check"><input type="checkbox" checked={opts.printZebra} onChange={() => toggle('printZebra')} /><span>{t('set_print_zebra_s')}</span></label>
          <label className="check"><input type="checkbox" checked={opts.printGutter} onChange={() => toggle('printGutter')} /><span>{t('set_print_gutter_s')}</span></label>
          <label className="check"><input type="checkbox" checked={opts.printWrap} onChange={() => toggle('printWrap')} /><span>{t('set_print_wrap_s')}</span></label>
        </div>
      )}
      <div className="print-pv-main">
        <div className="print-pv-stage" ref={stageRef}>
          <div className="print-pv-scale" style={{ width: sheetW * zoom, height: pageH * zoom }}>
            <div className={`print-pv-sheet${paged ? ' paged' : ''}${landscape ? ' landscape' : ''}`} style={{ width: sheetW, height: pageH, transform: `scale(${zoom})` }}>
              <iframe ref={frameRef} title={title || t('print_preview')} sandbox="allow-same-origin" srcDoc={html} onLoad={onLoad} />
            </div>
          </div>
        </div>
        <aside className="print-pv-side">
          <label htmlFor="med-printer">{t('print_destination')}</label>
          <select id="med-printer" value={deviceName} onChange={(e) => setDeviceName(e.target.value)}>
            {printers.length === 0 && <option value="">{t('print_no_printers')}</option>}
            {printers.map((p) => <option key={p.name} value={p.name}>{p.displayName || p.name}</option>)}
          </select>
          <label htmlFor="med-copies">{t('print_copies')}</label>
          <input id="med-copies" type="number" min="1" max="99" value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} />
          <label htmlFor="med-paper">{t('set_print_paper')}</label>
          <select id="med-paper" value={opts.printPaper} onChange={(e) => onPrintOpts && onPrintOpts({ printPaper: e.target.value })}>
            {Object.keys(PRINT_PAPERS).map((id) => <option key={id} value={id}>{t(`set_print_paper_${id}`)}</option>)}
          </select>
          <label htmlFor="med-layout">{t('print_layout')}</label>
          <select id="med-layout" value={landscape ? 'landscape' : 'portrait'} onChange={(e) => {
            const next = e.target.value === 'landscape';
            setLandscape(next);
            if (onPrintOpts) onPrintOpts({ printLandscape: next });
          }}>
            <option value="portrait">{t('print_portrait')}</option>
            <option value="landscape">{t('print_landscape')}</option>
          </select>
          <label htmlFor="med-color">{t('print_color_mode')}</label>
          <select id="med-color" value={color ? 'color' : 'mono'} onChange={(e) => setColor(e.target.value !== 'mono')}>
            <option value="color">{t('print_color_color')}</option>
            <option value="mono">{t('print_color_mono')}</option>
          </select>
          {err && <p className="print-pv-err">{err}</p>}
        </aside>
      </div>
    </Dialog>
  );
}

export default PrintPreviewDialog;
