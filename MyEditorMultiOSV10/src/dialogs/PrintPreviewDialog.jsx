// Print preview: the HTML that will be sent to the printer (a rendered
// Markdown / HTML page, a picture, or a numbered listing) is shown on a
// paper-sized sheet. For a code listing the toolbar repeats the print
// options (settings › print) so they can be tried on the page. Print opens
// the system dialog; Cancel closes.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from '../components/Icons';
import { Dialog } from './Dialogs';
import { buildCodePrintHtml, isPagedPrint, printOptsOf } from '../lib/print';

const PAPER_W = 794;    // A4 width at 96 dpi
const PAPER_H = 1123;   // one A4 page — short documents still look like a page
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5];

export function PrintPreviewDialog({ html: html0, title, path, lang, text, lineHtml, code, settings, onPrintOpts, onResult }) {
  useLanguage();
  const stageRef = useRef(null);
  const frameRef = useRef(null);
  const [html, setHtml] = useState(html0);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [pageH, setPageH] = useState(PAPER_H);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const paged = isPagedPrint(html);
  const opts = printOptsOf(settings);

  useEffect(() => { setHtml(html0); }, [html0]);
  useEffect(() => {
    if (!code || text == null) return;
    setHtml(buildCodePrintHtml({ title, path, lang, text, lineHtml, opts: printOptsOf(settings) }));
  }, [code, text, title, path, lang, lineHtml, settings]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Fit the sheet to the stage (never larger than 100 %) until the user picks a zoom.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !fit) return undefined;
    const apply = () => setZoom(Math.max(0.25, Math.min(1, (el.clientWidth - 40) / PAPER_W)));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  // The iframe grows with its document so the sheet is as tall as the printout.
  const measure = () => {
    const doc = frameRef.current && frameRef.current.contentDocument;
    if (!doc) return;
    const h = Math.max(doc.documentElement.scrollHeight, (doc.body && doc.body.scrollHeight) || 0, PAPER_H);
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
      else if (e.key === 'Enter') { e.preventDefault(); onResult(true); }
    };
    doc.addEventListener('keydown', onKey);
  };

  const pickZoom = (z) => { setFit(false); setZoom(z); };
  const stepZoom = (dir, from = zoom) => {
    const i = ZOOMS.reduce((best, z, n) => (Math.abs(z - from) < Math.abs(ZOOMS[best] - from) ? n : best), 0);
    pickZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + dir))]);
  };
  const ok = () => onResult({ print: true, html });

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

  return (
    <Dialog title={t('print_preview')} icon="print" kind="info" className="print-preview" width={880} onClose={() => onResult(null)} onEnter={ok}
      footer={<><button className="btn" onClick={() => onResult(null)}>{t('cancel')}</button><button className="btn primary" data-autofocus onClick={ok}>{t('print')}</button></>}>
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
      <div className="print-pv-stage" ref={stageRef}>
        <div className="print-pv-scale" style={{ width: PAPER_W * zoom, height: pageH * zoom }}>
          <div className={`print-pv-sheet${paged ? ' paged' : ''}`} style={{ width: PAPER_W, height: pageH, transform: `scale(${zoom})` }}>
            <iframe ref={frameRef} title={title || t('print_preview')} sandbox="allow-same-origin" srcDoc={html} onLoad={onLoad} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export default PrintPreviewDialog;
