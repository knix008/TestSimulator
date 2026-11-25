// The print window: printer, copies, detailed page setup (paper, custom size, orientation,
// margins, layout and its options, header and footer) on the left; the preview of the page on
// the right. Desktop: a frameless window of its own; it prints straight to the chosen printer
// (WebView2, Windows), through the system dialog, or into a PDF. Web: a frame in the main page
// that prints with the browser's dialog. The design comes from localStorage (myicomaker.print),
// written by the main window; the window follows the main window's theme.
//
// The same window prints the user's guide ("document mode", job.kind === 'guide', written by the
// guide window): the guide is cut into pages of the chosen paper (lib/docPages.js), the preview
// shows every page, and the options that only mean something for an icon (layout, size names,
// checkerboard) give way to the text size.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { setLanguage, t } from '../i18n.js';
import { loadSettings, saveSettings, PRINT_KEY } from '../lib/settings.js';
import { applyTheme } from '../lib/themes.js';
import { chooseSavePath, invoke, isDesktop, windowControl } from '../lib/platform.js';
import { Btn, Card, Icon, IconSelect, Segmented, Slider, Stepper, Toggle } from '../components/controls.jsx';
import { APP_NAME, dragProps, useListen } from '../components/Chrome.jsx';
import { contentBox, layoutItems, MARGIN_PRESETS, normalizePrint, PAPERS, pageSize, PX_PER_MM } from '../lib/printLayout.js';
import { guideContent, guideFile, paginate } from '../lib/docPages.js';

function readJob() {
  try { return JSON.parse(localStorage.getItem(PRINT_KEY) ?? 'null'); } catch { return null; }
}

export default function PrintWindow({ framed = false, onClose }) {
  const [settings, setSettingsState] = useState(() => loadSettings());
  const [job, setJob] = useState(readJob);
  const [scale, setScale] = useState(0);
  const [printers, setPrinters] = useState({ printers: [], defaultPrinter: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pane, setPane] = useState({ w: 700, h: 700 });
  const [doc, setDoc] = useState(null); // document mode: { key, title, pages: [html] }
  const measure = useRef(null);
  const opts = normalizePrint(settings.print);
  const docMode = job?.kind === 'guide';
  const direct = isDesktop() && !framed;
  setLanguage(settings.language);

  useEffect(() => { applyTheme(settings.theme, undefined, settings.customTheme); }, [settings.theme, settings.customTheme]);
  useEffect(() => {
    document.title = `${t('print.title')} — ${APP_NAME}`;
    if (direct) requestAnimationFrame(() => invoke('window_ready').catch(() => {}));
  }, [direct, settings.language]);
  const loadPrinters = useCallback(() => {
    if (direct) invoke('list_printers').then(setPrinters).catch(() => {});
  }, [direct]);
  useEffect(loadPrinters, [loadPrinters]);
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === PRINT_KEY) setJob(readJob());
      if (e.key === 'myicomaker.settings') setSettingsState(loadSettings());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  useListen('popup-refresh', () => { setJob(readJob()); setSettingsState(loadSettings()); });

  const setOpts = useCallback((patch) => {
    setSettingsState((prev) => {
      const next = { ...loadSettings(), print: { ...prev.print, ...patch } };
      saveSettings(next);
      return next;
    });
  }, []);
  const setMargin = (side, v) => setOpts({ margins: { ...opts.margins, [side]: v } });

  const [pw, ph] = pageSize(opts);
  const box = contentBox(opts);
  const items = useMemo(() => layoutItems(opts, job?.sizes?.length ? job.sizes : [16, 32, 48, 256]), [opts, job]);
  // Document mode: the guide laid out at the text area of the page, cut into pages.
  const docKey = docMode ? [job.lang, job.time, box.w, box.h, opts.docFont].join('|') : '';
  useEffect(() => {
    if (!docMode) { setDoc(null); return undefined; }
    let live = true;
    (async () => {
      try {
        const file = new URL(guideFile(job.lang), location.href);
        const response = await fetch(file);
        if (!response.ok) throw new Error(`${response.status} ${file.pathname}`);
        const content = guideContent(await response.text(), file.href);
        const host = measure.current;
        if (!live || !host) return;
        const pages = await paginate(host, content.html, { widthMm: box.w, heightMm: box.h });
        if (live) setDoc({ key: docKey, title: content.title, pages });
      } catch (err) {
        if (live) { setDoc({ key: docKey, title: job.name ?? '', pages: [] }); setMessage(`${t('error.title')}: ${err?.message ?? err}`); }
      }
    })();
    return () => { live = false; };
  }, [docKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const docReady = docMode && doc?.key === docKey;
  const pageCount = docMode ? (docReady ? doc.pages.length : 0) : 1;
  const ready = docMode ? docReady && pageCount > 0 : Boolean(job);
  const jobName = docMode ? (doc?.title || job?.name || '') : job?.name ?? '';
  const url = job && !docMode ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(job.svg)}` : '';
  // The preview fits the page into the pane when the scale is "fit" (0).
  const paneRef = useCallback((el) => {
    if (!el) return;
    const observer = new ResizeObserver(() => setPane({ w: el.clientWidth - 48, h: el.clientHeight - 48 }));
    observer.observe(el);
  }, []);
  // A document fits the page width; an icon page fits whole.
  const fit = Math.max(0.1, docMode ? pane.w / (pw * PX_PER_MM) : Math.min(pane.w / (pw * PX_PER_MM), pane.h / (ph * PX_PER_MM)));
  const zoom = scale ? scale / 100 : fit;
  const printerName = opts.printer || printers.defaultPrinter;
  const printJob = { printer: printerName, copies: opts.copies, widthMm: pw, heightMm: ph };

  const run = async (what) => {
    setBusy(true);
    setMessage('');
    try {
      if (what === 'direct') {
        await invoke('print_direct', { job: printJob });
        setMessage(t('print.sent', { printer: printerName || t('print.default') }));
      } else if (what === 'pdf') {
        const path = await chooseSavePath(`${(jobName || 'icon').replace(/[<>:"/\\|?*]/g, '_')}.pdf`, 'PDF', ['pdf']);
        if (path) { await invoke('print_pages_to_pdf', { job: printJob, path }); setMessage(t('print.pdfSaved', { path })); }
      } else if (direct) {
        await invoke('print_window');
      } else {
        window.print();
      }
    } catch (err) {
      setMessage(`${t('error.title')}: ${err?.message ?? err}`);
    } finally { setBusy(false); }
  };
  // Desktop: the window closes itself; web: the browser window opened for printing closes.
  const close = () => (framed ? onClose?.() : isDesktop() ? windowControl('close') : window.close());

  const printerOptions = printers.printers.length
    ? printers.printers.map((p) => ({ value: p, label: p === printers.defaultPrinter ? `${p} (${t('print.default')})` : p, icon: 'print' }))
    : [{ value: printerName, label: direct ? t('print.noPrinters') : t('print.browserPrinter'), icon: 'print' }];
  const row = (key, label, control) => <div className="kv-row" key={key}><span className="ctrl-label"><span>{label}</span></span>{control}</div>;

  return (
    <div className={`print-window ${framed ? 'framed' : ''}`} data-testid="print-window">
      <style>{`@page { size: ${pw}mm ${ph}mm; margin: 0; }`}</style>
      {!framed && (
        <header className="titlebar print-titlebar" {...dragProps}>
          <Icon name="print" size={18} />
          <span className="app-name">{t('print.title')}</span>
          <span className="doc-name">{jobName}</span>
          <span className="grow" />
          {isDesktop() && (
            <div className="win-buttons">
              <button type="button" className="win-btn" title={t('win.minimize')} onClick={() => windowControl('minimize')}><Icon name="minimize" size={16} /></button>
              <button type="button" className="win-btn" title={t('win.maximize')} onClick={() => windowControl('maximize')}><Icon name="maximize" size={16} /></button>
              <button type="button" className="win-btn close" title={t('win.close')} onClick={close}><Icon name="close" size={16} /></button>
            </div>
          )}
        </header>
      )}
      <div className="print-body">
        <aside className="print-options side-scroll">
          <Card icon="print" title={t('print.printer')} testId="printer-card">
            <div className="printer-line">
              <IconSelect label={t('print.printer')} value={printerName} options={printerOptions} onChange={(v) => setOpts({ printer: v })} testId="printer-select" />
              {direct && <Btn icon="refresh" title={t('print.refreshPrinters')} onClick={loadPrinters} className="icon-only" />}
            </div>
            {row('copies', t('print.copies'), <Stepper label={t('print.copies')} value={opts.copies} min={1} max={999} onChange={(v) => setOpts({ copies: v })} />)}
          </Card>
          <Card icon="page" title={t('print.paper')} testId="paper-card">
            <IconSelect label={t('print.paper')} value={opts.paper} onChange={(v) => setOpts({ paper: v })} testId="print-paper"
              options={[...Object.keys(PAPERS).map((p) => ({ value: p, label: `${p} (${PAPERS[p][0]}×${PAPERS[p][1]} mm)`, icon: 'page' })), { value: 'Custom', label: t('print.custom'), icon: 'size' }]} />
            {opts.paper === 'Custom' && row('w', t('props.width'), <Stepper label={t('props.width')} value={opts.width} min={50} max={1000} unit="mm" onChange={(v) => setOpts({ width: v })} />)}
            {opts.paper === 'Custom' && row('h', t('props.height'), <Stepper label={t('props.height')} value={opts.height} min={50} max={1000} unit="mm" onChange={(v) => setOpts({ height: v })} />)}
            <Segmented label={t('print.orientation')} value={opts.orientation} onChange={(v) => setOpts({ orientation: v })} options={[
              { value: 'portrait', icon: 'portrait', label: t('print.portrait') },
              { value: 'landscape', icon: 'landscape', label: t('print.landscape') },
            ]} />
          </Card>
          <Card icon="fit" title={t('print.margins')} testId="margins-card">
            <div className="btn-grid two">
              {Object.entries(MARGIN_PRESETS).map(([id, mm]) => (
                <Btn key={id} icon="fit" label={`${t(`print.margin.${id}`)} ${mm}`} className="small" data-margin={id}
                  active={['top', 'right', 'bottom', 'left'].every((s) => opts.margins[s] === mm)} onClick={() => setOpts({ margins: { top: mm, right: mm, bottom: mm, left: mm } })} />
              ))}
            </div>
            {['top', 'bottom', 'left', 'right'].map((side) => row(side, t(`print.margin.${side}`), <Stepper label={t(`print.margin.${side}`)} value={opts.margins[side]} min={0} max={60} unit="mm" onChange={(v) => setMargin(side, v)} />))}
          </Card>
          {!docMode && <Card icon="arrange" title={t('print.layout')}>
            <div className="btn-grid one">
              {[['sizes', 'sizes'], ['large', 'fit'], ['sheet', 'template']].map(([id, icon]) => (
                <Btn key={id} icon={icon} label={t(`print.layout.${id}`)} title={t(`print.layout.${id}.tip`)} active={opts.layout === id} onClick={() => setOpts({ layout: id })} data-layout={id} />
              ))}
            </div>
            {opts.layout === 'sizes' && row('mag', t('print.magnify'), <Stepper label={t('print.magnify')} value={opts.magnify} min={2} max={10} unit="×" onChange={(v) => setOpts({ magnify: v })} />)}
            {opts.layout === 'large' && <Slider icon="size" label={t('print.largePercent')} value={opts.largePercent} min={10} max={100} step={5} unit="%" onChange={(v) => setOpts({ largePercent: v })} />}
            {opts.layout === 'sheet' && row('ss', t('print.sheetSize'), <Stepper label={t('print.sheetSize')} value={opts.sheetSize} min={8} max={150} unit="mm" onChange={(v) => setOpts({ sheetSize: v })} />)}
            {opts.layout === 'sheet' && row('sg', t('print.sheetGap'), <Stepper label={t('print.sheetGap')} value={opts.sheetGap} min={0} max={40} unit="mm" onChange={(v) => setOpts({ sheetGap: v })} />)}
            {opts.layout === 'sheet' && <Toggle icon="dash" label={t('print.cutLines')} checked={opts.cutLines} onChange={(v) => setOpts({ cutLines: v })} />}
          </Card>}
          <Card icon="label" title={t('print.options')}>
            {docMode && row('font', t('print.docFont'), <Stepper label={t('print.docFont')} value={opts.docFont} min={7} max={16} unit="pt" onChange={(v) => setOpts({ docFont: v })} />)}
            {!docMode && <Toggle icon="label" label={t('print.labels')} checked={opts.labels} onChange={(v) => setOpts({ labels: v })} />}
            {!docMode && <Toggle icon="checker" label={t('print.checker')} checked={opts.checker} onChange={(v) => setOpts({ checker: v })} />}
            <Toggle icon="title" label={t('print.header')} checked={opts.title} onChange={(v) => setOpts({ title: v })} />
            <Toggle icon="calendar" label={t('print.footer')} checked={opts.footer} onChange={(v) => setOpts({ footer: v })} />
          </Card>
        </aside>
        <main className="print-main">
          <div className="print-preview-bar">
            <Icon name="eye" size={16} /><b>{t('print.preview')}</b>
            <span className="muted">{`${Math.round(pw * 10) / 10} × ${Math.round(ph * 10) / 10} mm · ${docMode ? (docReady ? t('print.pageCount', { n: pageCount }) : t('print.paging')) : t('print.itemCount', { n: items.length })}`}</span>
            <span className="grow" />
            <Btn icon="fit" label={t('view.fit')} active={!scale} onClick={() => setScale(0)} className="small" />
            <Btn icon="zoomOut" title={t('view.zoomOut')} className="small icon-only" onClick={() => setScale(Math.max(20, Math.round((scale || zoom * 100) - 10)))} />
            <span className="zoom-value">{Math.round(zoom * 100)}%</span>
            <Btn icon="zoomIn" title={t('view.zoomIn')} className="small icon-only" onClick={() => setScale(Math.min(200, Math.round((scale || zoom * 100) + 10)))} />
          </div>
          <div className={`print-preview ${docMode ? 'doc' : ''}`} ref={paneRef}>
            {!job && <div className="empty-note"><Icon name="info" size={18} />{t('print.noJob')}</div>}
            {docMode && !docReady && <div className="empty-note"><Icon name="guide" size={18} />{t('print.paging')}</div>}
            {docReady && doc.pages.map((html, i) => (
              <div key={i} className="page-holder" style={{ width: pw * PX_PER_MM * zoom, height: ph * PX_PER_MM * zoom }}>
                <div className="page doc-page" data-testid="print-page" style={{ width: `${pw}mm`, height: `${ph}mm`, transform: `scale(${zoom})` }}>
                  <div className="margin-box" style={{ left: `${opts.margins.left}mm`, top: `${opts.margins.top}mm`, right: `${opts.margins.right}mm`, bottom: `${opts.margins.bottom}mm` }} />
                  {opts.title && (
                    <div className="page-header" style={{ left: `${box.x}mm`, top: `${opts.margins.top}mm`, width: `${box.w}mm` }}>
                      <b>{jobName}</b><span>{APP_NAME}</span>
                    </div>
                  )}
                  <div className="doc-body" style={{ left: `${box.x}mm`, top: `${box.y}mm`, width: `${box.w}mm`, height: `${box.h}mm`, fontSize: `${opts.docFont}pt` }} dangerouslySetInnerHTML={{ __html: html }} />
                  <div className="page-footer" style={{ left: `${box.x}mm`, bottom: `${opts.margins.bottom}mm`, width: `${box.w}mm` }}>
                    <span>{opts.footer ? new Date(job.time ?? Date.now()).toLocaleDateString() : ''}</span><span>{`${i + 1} / ${pageCount}`}</span>
                  </div>
                </div>
              </div>
            ))}
            {job && !docMode && (
              <div className="page-holder" style={{ width: pw * PX_PER_MM * zoom, height: ph * PX_PER_MM * zoom }}>
                <div className="page" data-testid="print-page" style={{ width: `${pw}mm`, height: `${ph}mm`, transform: `scale(${zoom})` }}>
                  <div className="margin-box" style={{ left: `${opts.margins.left}mm`, top: `${opts.margins.top}mm`, right: `${opts.margins.right}mm`, bottom: `${opts.margins.bottom}mm` }} />
                  {opts.title && (
                    <div className="page-header" style={{ left: `${box.x}mm`, top: `${opts.margins.top}mm`, width: `${box.w}mm` }}>
                      <b>{job.name}</b><span>{APP_NAME}</span>
                    </div>
                  )}
                  {items.map((it, i) => (
                    <figure key={i} className={`page-item ${opts.checker ? 'checker' : ''} ${opts.layout === 'sheet' && opts.cutLines ? 'cut' : ''}`} style={{ left: `${it.x}mm`, top: `${it.y}mm`, width: `${it.size}mm` }}>
                      <img src={url} alt="" style={{ width: `${it.size}mm`, height: `${it.size}mm` }} />
                      {opts.labels && it.label && <figcaption>{it.label}</figcaption>}
                    </figure>
                  ))}
                  {opts.footer && (
                    <div className="page-footer" style={{ left: `${box.x}mm`, bottom: `${opts.margins.bottom}mm`, width: `${box.w}mm` }}>
                      <span>{new Date(job.time ?? Date.now()).toLocaleString()}</span><span>1 / 1</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <footer className="print-actions">
            <span className="print-message" role="status">{message}</span>
            <span className="grow" />
            {direct && <Btn icon="exportSvg" label={t('print.savePdf')} onClick={() => run('pdf')} disabled={!ready || busy} data-testid="print-pdf" />}
            <Btn icon="external" label={t('print.systemDialog')} onClick={() => run('dialog')} disabled={!ready || busy} />
            <Btn icon="print" label={t('print.print')} primary onClick={() => run(direct ? 'direct' : 'dialog')} disabled={!ready || busy} data-testid="print-now" />
            <Btn icon="close" label={t('common.close')} onClick={close} />
          </footer>
        </main>
      </div>
      <div ref={measure} className="doc-body doc-measure" aria-hidden="true" style={{ fontSize: `${opts.docFont}pt` }} />
    </div>
  );
}
