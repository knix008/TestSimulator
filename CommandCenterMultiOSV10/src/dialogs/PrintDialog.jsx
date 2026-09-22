// Print dialog (Ctrl+P): the page setup on the left, the document as it will
// come out of the printer on the right.
//
// The setup — printer, paper, orientation, margins, scale, font size, header,
// colour, copies, page range — is turned into the print document by
// lib/print.js (buildPrintHtml: @page + zoom), so the same document feeds the
// preview and the printer. On the desktop the preview is a real PDF of that
// document (electron printToPDF, drawn by Chromium's PDF viewer) and Print
// sends it silently to the chosen printer; in the browser the preview is the
// document laid out at paper width with the page breaks marked (the browser
// cannot paginate for us), and Print opens the browser's print dialog with
// the same setup. The setup is remembered in the session (printSetup).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { DialogFrame } from './Dialogs';
import { Icon } from '../components/Icons';
import { call, isElectron } from '../lib/backend';
import { buildPrintHtml, printDocument, printPreviewPdf, listPrinters, PAPERS, MARGIN_PRESETS, PRINT_SETUP_DEFAULTS, normalizeSetup, contentSizeMm, parsePageRanges } from '../lib/print';

const PX_PER_MM = 96 / 25.4;
// The last setup used in this window (the session has it for the next start).
let lastSetup = null;

function Num({ value, onChange, min = 1, max = 999, step = 1, width = 60, unit }) {
  const clamp = (n) => Math.min(max, Math.max(min, n));
  const n = Number(value) || min;
  return (
    <div className="row num-field">
      <button type="button" className="num-btn" tabIndex={-1} disabled={n <= min} aria-label="−" onClick={() => onChange(clamp(n - step))}>−</button>
      <input value={value} inputMode="numeric" style={{ width }} onChange={(e) => onChange(clamp(parseInt(e.target.value.replace(/[^\d]/g, ''), 10) || min))} />
      <button type="button" className="num-btn" tabIndex={-1} disabled={n >= max} aria-label="+" onClick={() => onChange(clamp(n + step))}>+</button>
      {unit && <span className="muted">{unit}</span>}
    </div>
  );
}

// spec: { doc: { title, kind, text, mime, base64, wrap, fontSize, tabSize, meta }, setup?, onStatus?, onError? }
// done: { ok: true } printed, { ok: false, cancelled: true } backed out.
export function PrintDialog({ spec, done }) {
  useLanguage();
  const doc = spec.doc || {};
  const isText = doc.kind !== 'image';
  const [setup, setSetup] = useState(() => normalizeSetup(lastSetup || spec.setup || PRINT_SETUP_DEFAULTS));
  const [fontSize, setFontSize] = useState(Math.max(6, Math.min(24, Number(doc.fontSize) || 10)));
  const [wrap, setWrap] = useState(doc.wrap !== false);
  const [copies, setCopies] = useState(1);
  const [rangeMode, setRangeMode] = useState('all');
  const [ranges, setRanges] = useState('');
  const [printers, setPrinters] = useState([]);
  const [printer, setPrinter] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState({ url: null, pages: 0, loading: true, error: null, approx: false });
  const set = (k, v) => setSetup((s) => normalizeSetup({ ...s, [k]: v }));

  useEffect(() => { listPrinters().then((list) => { setPrinters(list); const d = list.find((p) => p.isDefault) || list[0]; if (d) setPrinter(d.name); }); }, []);

  // The document for the current setup — the preview and the printer both get exactly this.
  const html = useMemo(() => buildPrintHtml({ ...doc, fontSize, wrap, setup }), [doc, fontSize, wrap, setup]);
  const options = useMemo(() => ({ landscape: setup.landscape, paper: setup.paper, color: setup.color }), [setup]);

  // ── Preview: a PDF of the document on the desktop, the document at paper width in the browser ──
  const frameRef = useRef(null);
  const urlRef = useRef(null);
  const [cw, ch, pw, ph] = contentSizeMm(setup);
  useEffect(() => {
    let live = true;
    setPreview((p) => ({ ...p, loading: true, error: null }));
    const timer = setTimeout(async () => {
      try {
        const r = isElectron ? await printPreviewPdf({ html, title: doc.title, options }) : null;
        if (!live) return;
        if (r && r.pdf) {
          const blob = new Blob([Uint8Array.from(atob(r.pdf), (c) => c.charCodeAt(0))], { type: 'application/pdf' });
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          urlRef.current = URL.createObjectURL(blob);
          setPreview({ url: `${urlRef.current}#toolbar=0&navpanes=0&view=FitH`, pages: r.pages, loading: false, error: null, approx: false });
        } else {
          setPreview({ url: null, pages: 0, loading: false, error: null, approx: true });
        }
      } catch (err) {
        if (live) setPreview({ url: null, pages: 0, loading: false, error: err && err.message ? err.message : String(err), approx: true });
      }
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [html, options, doc.title]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  // Browser (or a failed PDF): the document in a frame as wide as the printable area; page breaks are
  // drawn over it every printable-height, which is where the browser will break it too (give or take a line).
  const [approxHeight, setApproxHeight] = useState(0);
  const onApproxLoad = () => {
    const f = frameRef.current;
    if (!f || !f.contentDocument) return;
    const h = f.contentDocument.documentElement.scrollHeight;
    setApproxHeight(h);
    setPreview((p) => ({ ...p, pages: Math.max(1, Math.ceil(h / (ch * PX_PER_MM))) }));
  };
  const approxHtml = useMemo(() => html.replace('</head>', `<style>html { overflow: hidden; } body { width: ${cw}mm; }</style></head>`), [html, cw]);
  // The page is shown scaled down to the width of the preview pane (never up).
  const scrollRef = useRef(null);
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const measure = () => setFit(Math.min(1, (el.clientWidth - 40) / (pw * PX_PER_MM)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pw, preview.approx]);

  // ── Print ──
  const pageRanges = rangeMode === 'range' ? parsePageRanges(ranges, preview.pages) : null;
  const rangeBad = rangeMode === 'range' && !pageRanges;
  const print = async (systemDialog = false) => {
    if (busy || rangeBad) return;
    setBusy(true);
    lastSetup = setup;
    call('session.save', { patch: { printSetup: setup, printFontSize: fontSize } }).catch(() => {});
    try {
      const r = await printDocument({ html, title: doc.title, options: { ...options, deviceName: systemDialog ? undefined : printer || undefined, copies, pageRanges: pageRanges || undefined } });
      done(r && r.cancelled ? { ok: false, cancelled: true } : { ok: true });
    } catch (err) {
      setBusy(false);
      if (spec.onError) spec.onError(err); else done({ ok: false, error: err });
    }
  };
  const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); print(); } };

  const paperLabel = (name) => `${name} (${PAPERS[name][0]} × ${PAPERS[name][1]} mm)`;
  return (
    <DialogFrame title={t('print')} icon="print" width={1000} className="print-dlg" onClose={() => done({ ok: false, cancelled: true })}
      footer={<>
        <span className="muted small print-count">{preview.loading ? t('pr_preview_loading') : preview.pages ? t('pr_page_count', { n: preview.pages }) : ''}</span>
        {isElectron && <button className="btn" onClick={() => print(true)} disabled={busy}>{t('pr_system_dialog')}</button>}
        <button className="btn" onClick={() => done({ ok: false, cancelled: true })} disabled={busy}>{t('cancel')}</button>
        <button className="btn primary" onClick={() => print()} disabled={busy || rangeBad || preview.loading}><Icon name="print" size={14} /> {t('pr_print')}</button>
      </>}>
      <div className="print-body" onKeyDown={onKey}>
        <form className="print-form form-grid" onSubmit={(e) => { e.preventDefault(); print(); }}>
          {printers.length > 0 && <>
            <label>{t('pr_printer')}</label>
            <select value={printer} onChange={(e) => setPrinter(e.target.value)}>
              {printers.map((p) => <option key={p.name} value={p.name}>{p.displayName}{p.isDefault ? ` — ${t('pr_default')}` : ''}</option>)}
            </select>
          </>}
          <label>{t('pr_paper')}</label>
          <select value={setup.paper} onChange={(e) => set('paper', e.target.value)}>
            {Object.keys(PAPERS).map((name) => <option key={name} value={name}>{paperLabel(name)}</option>)}
          </select>
          <label>{t('pr_orient')}</label>
          <div className="row print-orient">
            <label className="check"><input type="radio" name="orient" checked={!setup.landscape} onChange={() => set('landscape', false)} /><Icon name="portrait" size={14} /> {t('pr_portrait')}</label>
            <label className="check"><input type="radio" name="orient" checked={setup.landscape} onChange={() => set('landscape', true)} /><Icon name="landscape" size={14} /> {t('pr_landscape')}</label>
          </div>
          <label>{t('pr_margins')}</label>
          <div className="row">
            <select value={setup.margin} onChange={(e) => set('margin', e.target.value)}>
              {Object.keys(MARGIN_PRESETS).map((k) => <option key={k} value={k}>{t(`pr_margin_${k}`, { mm: MARGIN_PRESETS[k] })}</option>)}
              <option value="custom">{t('pr_margin_custom')}</option>
            </select>
            {setup.margin === 'custom' && <Num value={setup.marginMm} min={0} max={50} onChange={(v) => set('marginMm', v)} unit="mm" />}
          </div>
          <label>{t('pr_scale')}</label>
          <Num value={setup.scale} min={25} max={200} step={5} onChange={(v) => set('scale', v)} unit="%" />
          {isText && <>
            <label>{t('pr_font')}</label>
            <Num value={fontSize} min={6} max={24} onChange={setFontSize} unit="pt" />
            <span />
            <label className="check"><input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} /> {t('pr_wrap')}</label>
          </>}
          <span />
          <label className="check"><input type="checkbox" checked={setup.header} onChange={(e) => set('header', e.target.checked)} /> {t('pr_header')}</label>
          <span />
          <label className="check"><input type="checkbox" checked={!setup.color} onChange={(e) => set('color', !e.target.checked)} /> {t('pr_gray')}</label>
          {isElectron && <>
            <label>{t('pr_copies')}</label>
            <Num value={copies} min={1} max={99} onChange={setCopies} />
            <label>{t('pr_pages')}</label>
            <div className="row print-pages">
              <label className="check"><input type="radio" name="pages" checked={rangeMode === 'all'} onChange={() => setRangeMode('all')} /> {t('pr_pages_all')}</label>
              <label className="check"><input type="radio" name="pages" checked={rangeMode === 'range'} onChange={() => setRangeMode('range')} /> {t('pr_pages_range')}</label>
              <input value={ranges} placeholder={t('pr_pages_hint')} disabled={rangeMode !== 'range'} className={rangeBad ? 'invalid' : ''} style={{ width: 90 }}
                onFocus={() => setRangeMode('range')} onChange={(e) => setRanges(e.target.value)} title={rangeBad ? t('pr_pages_bad') : undefined} />
            </div>
          </>}
          <span />
          <div className="muted small">{t('pr_area', { w: Math.round(cw), h: Math.round(ch), pw: Math.round(pw), ph: Math.round(ph) })}</div>
        </form>
        <div className="print-preview">
          {preview.url && <iframe className="print-pdf" title={t('pr_preview')} src={preview.url} />}
          {!preview.url && preview.approx && (
            <div className="print-approx-scroll" ref={scrollRef}>
              {/* the page at paper size, scaled down (transform — a frame's document ignores an ancestor's zoom) inside a box of the scaled size */}
              <div className="print-approx-box" style={{ width: pw * PX_PER_MM * fit, height: ((approxHeight || 200) + 2 * setup.marginMm * PX_PER_MM) * fit }}>
              <div className="print-approx" style={{ width: `${cw}mm`, padding: `${setup.marginMm}mm`, boxSizing: 'content-box', transform: `scale(${fit})`, transformOrigin: 'top left' }}>
                <iframe ref={frameRef} title={t('pr_preview')} srcDoc={approxHtml} onLoad={onApproxLoad} style={{ width: `${cw}mm`, height: approxHeight || 200, border: 0, display: 'block', background: '#fff' }} />
                {/* one break per printable height (the top of every page but the first) */}
                {Array.from({ length: Math.max(0, preview.pages - 1) }, (_, i) => (
                  <div key={i} className="print-break" style={{ top: `calc(${setup.marginMm}mm + ${(i + 1) * ch}mm)` }}><span>{i + 2}</span></div>
                ))}
              </div>
              </div>
              <div className="muted small print-approx-note">{t('pr_preview_approx')}</div>
            </div>
          )}
          {preview.loading && <div className="print-loading">{t('pr_preview_loading')}</div>}
          {preview.error && <div className="print-loading">{preview.error}</div>}
        </div>
      </div>
    </DialogFrame>
  );
}

export default PrintDialog;
