// The print dialog: the page setup on the left, the pages as they will come
// out of the printer on the right (a live preview), [Print] prints at once.
//
// The setup is turned into one document (printdoc.js buildPrintHtml: @page,
// sheets and pages of paper size), laid out into pages in the preview frame
// (paginate.js); that same finished document goes to the printer (desktop:
// print_html, silently, no second dialog), to a PDF (print_pdf) or to the
// browser's print dialog (web). The setup is remembered (settings.print).
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../lib/i18n';
import { Icon, CloseButton } from '../components/Chrome';
import { IconSelect, Stepper, Tabs, Toggle, Btn, BtnGroup } from '../views/common';
import { getSettings, patchSettings } from '../lib/settings';
import { chooseFile } from '../lib/prompt';
import { toast } from '../lib/ui';
import { pt } from './i18n';
import { PAPERS, PAPER_NAMES, MARGIN_PRESETS, NUP_CHOICES, FONT_RANGE, SCALE_RANGE, normalizeSetup, buildPrintHtml, pageGeometry, nupLayout, parsePageRanges, dateText } from './printdoc';
import { paginate, settle, serialize } from './paginate';
import { printInfo, printSilently, printPdf, printInBrowser } from './host';

const PX_PER_MM = 96 / 25.4;

function Row({ label, children, wide }) {
  return (
    <div className={`msp-row ${wide ? 'wide' : ''}`}>
      {label != null && <span className="msp-label">{label}</span>}
      <div className="msp-ctl">{children}</div>
    </div>
  );
}

/** spec: see index.js (openPrintDialog). done(result) closes the dialog. */
export function PrintDialog({ spec, done }) {
  useLanguage();
  const kind = spec.kind || 'text';
  const textual = kind === 'text' || kind === 'code';
  const [setup, setSetup] = useState(() => normalizeSetup({ ...(getSettings().print || {}), ...(spec.setup || {}) }));
  const set = (patch) => setSetup((s) => normalizeSetup({ ...s, ...patch }));
  const [tab, setTab] = useState('page');
  const [rangeMode, setRangeMode] = useState('all');
  const [rangeText, setRangeText] = useState('');
  const [info, setInfo] = useState({ printers: [], silent: false, pdf: false, loaded: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [layout, setLayout] = useState({ pages: 0, printed: 0, sheets: 0, loading: true });
  const [frameH, setFrameH] = useState(400);
  const [zoomMode, setZoomMode] = useState('width');
  const [zoomPct, setZoomPct] = useState(60);
  const frameRef = useRef(null);
  const paneRef = useRef(null);
  const finalRef = useRef('');
  const dateRef = useRef(spec.date || dateText(new Date()));

  useEffect(() => {
    printInfo().then((r) => {
      setInfo({ ...r, loaded: true });
      const names = (r.printers || []).map((p) => p.name);
      setSetup((s) => (names.length && !names.includes(s.printer) ? normalizeSetup({ ...s, printer: ((r.printers || []).find((p) => p.isDefault) || r.printers[0]).name }) : s));
    });
  }, []);

  // -- Preview: build, lay out into pages, measure --
  const flowHtml = useMemo(() => buildPrintHtml({ ...spec, kind }, setup), [spec, kind, setup]);
  const ranges = rangeMode === 'range' ? rangeText : '';
  const seqRef = useRef(0);
  useEffect(() => {
    setLayout((l) => ({ ...l, loading: true }));
    const my = ++seqRef.current;
    const timer = setTimeout(() => {
      const f = frameRef.current;
      if (!f) return;
      f.onload = async () => {
        if (my !== seqRef.current) return;
        const doc = f.contentDocument;
        if (!doc) return;
        try {
          await settle(doc);
          if (my !== seqRef.current) return;
          const r = paginate(doc, setup, { title: spec.title || '', date: dateRef.current, pageRanges: ranges || null });
          finalRef.current = serialize(doc);
          setFrameH(Math.ceil(doc.documentElement.scrollHeight) + 4);
          setLayout({ ...r, loading: false });
          setError('');
        } catch (e) {
          setLayout((l) => ({ ...l, loading: false }));
          setError(String((e && e.message) || e));
        }
      };
      f.srcdoc = flowHtml;
    }, 180);
    return () => clearTimeout(timer);
  }, [flowHtml, ranges]); // eslint-disable-line react-hooks/exhaustive-deps

  const L = nupLayout(setup);
  const g = pageGeometry(setup);
  const sheetPx = [L.sheetW * PX_PER_MM, L.sheetH * PX_PER_MM];
  const [pane, setPane] = useState({ w: 600, h: 500 });
  useLayoutEffect(() => {
    const el = paneRef.current;
    if (!el) return undefined;
    const measure = () => setPane({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fitW = Math.max(0.05, (pane.w - 36) / sheetPx[0]);
  const fitP = Math.max(0.05, Math.min(fitW, (pane.h - 28) / sheetPx[1]));
  const zoom = zoomMode === 'width' ? fitW : zoomMode === 'page' ? fitP : zoomPct / 100;
  const frameW = Math.ceil(sheetPx[0]) + 2;

  // -- Print --
  const rangeBad = rangeMode === 'range' && (!rangeText.trim() || (layout.pages > 0 && !parsePageRanges(rangeText, layout.pages)));
  const remember = () => { const { printer, ...rest } = setup; patchSettings({ print: { ...rest, printer } }); };
  const job = () => ({ html: finalRef.current, widthMm: L.sheetW, heightMm: L.sheetH, printer: setup.printer, copies: setup.copies, color: setup.color, duplex: setup.duplex, collate: setup.collate });
  const canGo = !busy && !rangeBad && !layout.loading && layout.printed > 0;
  // A file printer (PDF / XPS writer, OneNote, fax): no silent job, whose driver would open the
  // OS "save print output as" dialog; the pages are saved as a PDF through the app's save dialog.
  const chosen = info.printers.find((p) => p.name === setup.printer);
  const fileOut = !!(info.silent && chosen && chosen.fileOutput);
  const doPrint = useCallback(async () => {
    if (!canGo) return;
    if (fileOut) { savePdf(); return; }
    setBusy(true);
    setError('');
    remember();
    try {
      if (info.silent) {
        await printSilently(job());
        toast(pt('sent', { printer: setup.printer || pt('printer_default') }), 'ok', 3500);
      } else {
        await printInBrowser(finalRef.current);
      }
      done({ ok: true });
    } catch (e) {
      const msg = String((e && e.message) || e);
      setError(pt('error', { error: msg === 'printer-unavailable' ? pt('unavailable') : msg === 'file-printer' ? pt('file_printer') : msg }));
      setBusy(false);
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const savePdf = async () => {
    if (!canGo) return;
    const name = `${String(spec.title || 'print').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_') || 'print'}.pdf`;
    const path = await chooseFile({ mode: 'save', title: pt('save_pdf'), name, exts: ['.pdf'], filterName: 'PDF' });
    if (!path) return;
    setBusy(true);
    setError('');
    remember();
    try {
      const r = await printPdf({ ...job(), output: path });
      toast(pt('pdf_saved', { path: r.path || path, n: r.pages }), 'ok', 5000);
    } catch (e) { setError(pt('error', { error: String((e && e.message) || e) })); }
    setBusy(false);
  };
  const cancel = () => { if (!busy) done({ ok: false, cancelled: true }); };
  const doPrintRef = useRef(doPrint);
  doPrintRef.current = doPrint;
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelRef.current(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); e.stopPropagation(); doPrintRef.current(); }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);

  // -- Options --
  const printerOptions = info.printers.map((p) => ({ value: p.name, label: p.isDefault ? `${p.name} (${pt('printer_default')})` : p.name, icon: 'print' }));
  const paperOptions = PAPER_NAMES.map((n) => ({ value: n, icon: 'file', label: n === 'custom' ? pt('paper_custom') : `${n}  ${PAPERS[n][0]} × ${PAPERS[n][1]} mm` }));
  const marginOptions = [...Object.keys(MARGIN_PRESETS).map((k) => ({ value: k, icon: 'layout', label: `${pt(`margin_${k}`)} (${MARGIN_PRESETS[k]} mm)` })), { value: 'custom', icon: 'edit', label: pt('margin_custom') }];
  const nupOptions = NUP_CHOICES.map((n) => ({ value: n, icon: n === 1 ? 'file' : 'grid', label: pt('nup_n', { n }) }));
  const scaleOptions = [{ value: 'fit', icon: 'unfold', label: pt('scale_fit') }, { value: 'custom', icon: 'scale', label: pt('scale_custom') }];
  const duplexOptions = ['none', 'long', 'short'].map((d) => ({ value: d, icon: d === 'none' ? 'file' : 'copy', label: pt(`duplex_${d}`) }));
  const margin = (side) => (
    <Stepper value={setup.margins[side]} min={0} max={100} step={1} width={46} unit="mm" ariaLabel={pt(side)} label={pt(side)}
      onChange={(v) => set({ margin: 'custom', margins: { ...setup.margins, [side]: v } })} />
  );

  const tabs = [
    { id: 'page', icon: 'file', label: pt('tab_page') },
    { id: 'content', icon: 'edit', label: pt('tab_content') },
    { id: 'hf', icon: 'panelBottom', label: pt('tab_hf') },
  ];

  return (
    <div className="msp-back" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div className="msp-dlg" role="dialog" aria-label={pt('title')} aria-modal="true">
        <div className="msp-titlebar">
          <strong><Icon name="print" size={16} />{pt('title')}</strong>
          <span className="msp-doc ellipsis" title={spec.title || ''}>{spec.title || ''}</span>
          <CloseButton onClick={cancel} aria-label={pt('close')} title={pt('close')} size={14} />
        </div>
        <div className="msp-main">
          <div className="msp-form">
            <Row label={pt('printer')}>
              {info.silent && printerOptions.length
                ? <IconSelect value={setup.printer} options={printerOptions} onChange={(v) => set({ printer: v })} ariaLabel={pt('printer')} width="100%" />
                : <span className="msp-note"><Icon name="info" size={14} />{pt('printer_browser')}</span>}
            </Row>
            {info.silent && (
              <Row label={pt('copies')}>
                <Stepper value={setup.copies} min={1} max={999} width={46} ariaLabel={pt('copies')} onChange={(v) => set({ copies: v })} />
                <Toggle checked={setup.collate} onChange={(v) => set({ collate: v })} label={pt('collate')} icon="copy" />
              </Row>
            )}
            <Row label={pt('pages')}>
              <BtnGroup>
                <Btn icon="file" label={pt('pages_all')} active={rangeMode === 'all'} onClick={() => setRangeMode('all')} />
                <Btn icon="filter" label={pt('pages_range')} active={rangeMode === 'range'} onClick={() => setRangeMode('range')} />
              </BtnGroup>
              <input className={`msp-input ${rangeBad && rangeMode === 'range' ? 'invalid' : ''}`} value={rangeText} placeholder={pt('pages_hint')} aria-label={pt('pages_range')}
                title={rangeBad ? pt('pages_bad') : pt('pages_hint')} onFocus={() => setRangeMode('range')} onChange={(e) => { setRangeText(e.target.value); setRangeMode('range'); }} />
            </Row>
            <Tabs tabs={tabs} value={tab} onChange={setTab} />
            <div className="msp-tab">
              {tab === 'page' && <>
                <Row label={pt('paper')}><IconSelect value={setup.paper} options={paperOptions} onChange={(v) => set({ paper: v })} ariaLabel={pt('paper')} width="100%" /></Row>
                {setup.paper === 'custom' && (
                  <Row label="">
                    <Stepper value={setup.customW} min={50} max={1200} width={50} unit="mm" label={pt('width')} ariaLabel={pt('width')} onChange={(v) => set({ customW: v })} />
                    <Stepper value={setup.customH} min={50} max={1200} width={50} unit="mm" label={pt('height')} ariaLabel={pt('height')} onChange={(v) => set({ customH: v })} />
                  </Row>
                )}
                <Row label={pt('orient')}>
                  <BtnGroup>
                    <Btn icon="file" label={pt('portrait')} active={!setup.landscape} onClick={() => set({ landscape: false })} />
                    <Btn icon="image" label={pt('landscape')} active={setup.landscape} onClick={() => set({ landscape: true })} />
                  </BtnGroup>
                </Row>
                <Row label={pt('margins')}><IconSelect value={setup.margin} options={marginOptions} onChange={(v) => set({ margin: v })} ariaLabel={pt('margins')} width="100%" /></Row>
                {setup.margin === 'custom' && <>
                  <Row label="">{margin('top')}{margin('bottom')}</Row>
                  <Row label="">{margin('left')}{margin('right')}</Row>
                </>}
                <Row label={pt('scale')}>
                  <IconSelect value={setup.scaleMode} options={scaleOptions} onChange={(v) => set({ scaleMode: v })} ariaLabel={pt('scale')} width={150} />
                  <Stepper value={setup.scale} min={SCALE_RANGE[0]} max={SCALE_RANGE[1]} step={5} width={46} unit="%" ariaLabel={pt('scale')} disabled={setup.scaleMode !== 'custom'} onChange={(v) => set({ scale: v, scaleMode: 'custom' })} />
                </Row>
                <Row label={pt('nup')}><IconSelect value={setup.nup} options={nupOptions} onChange={(v) => set({ nup: v })} ariaLabel={pt('nup')} width="100%" /></Row>
              </>}
              {tab === 'content' && <>
                {(textual || kind === 'html') && (
                  <Row label={pt('font')}><Stepper value={setup.fontSize} min={FONT_RANGE[0]} max={FONT_RANGE[1]} width={46} unit="pt" ariaLabel={pt('font')} onChange={(v) => set({ fontSize: v })} /></Row>
                )}
                {textual && (
                  <Row label="" wide>
                    <div className="toggle-row">
                      {kind === 'code' && <Toggle checked={setup.lineNumbers} onChange={(v) => set({ lineNumbers: v })} label={pt('line_numbers')} icon="hash" />}
                      <Toggle checked={setup.wrap} onChange={(v) => set({ wrap: v })} label={pt('wrap')} icon="flow" />
                      {kind === 'code' && spec.runs && <Toggle checked={setup.syntax} onChange={(v) => set({ syntax: v })} label={pt('syntax')} icon="palette" />}
                    </div>
                  </Row>
                )}
                {kind === 'image' && spec.lightenable && (
                  <Row label="" wide><span title={pt('lighten_tip')}><Toggle checked={setup.lighten} onChange={(v) => set({ lighten: v })} label={pt('lighten')} icon="sun" /></span></Row>
                )}
                <Row label={pt('color_mode')}>
                  <BtnGroup>
                    <Btn icon="palette" label={pt('color')} active={setup.color} onClick={() => set({ color: true })} />
                    <Btn icon="drop" label={pt('gray')} active={!setup.color} onClick={() => set({ color: false })} />
                  </BtnGroup>
                </Row>
                <Row label=""><Toggle checked={setup.backgrounds} onChange={(v) => set({ backgrounds: v })} label={pt('backgrounds')} icon="image" /></Row>
                {info.silent && <Row label={pt('duplex')}><IconSelect value={setup.duplex} options={duplexOptions} onChange={(v) => set({ duplex: v })} ariaLabel={pt('duplex')} width="100%" /></Row>}
              </>}
              {tab === 'hf' && <>
                <Row label={pt('header')}><Toggle checked={setup.header} onChange={(v) => set({ header: v })} label={pt('header')} icon="panelBottom" /></Row>
                <Row label={pt('header_text')}>
                  <input className="msp-input grow" value={setup.headerText} placeholder={spec.title || pt('header_text_hint')} disabled={!setup.header} aria-label={pt('header_text')}
                    onChange={(e) => set({ headerText: e.target.value })} />
                </Row>
                <Row label=""><Toggle checked={setup.date} onChange={(v) => set({ date: v })} label={`${pt('date')} (${dateRef.current})`} icon="calendar" /></Row>
                <Row label=""><Toggle checked={setup.pageNumbers} onChange={(v) => set({ pageNumbers: v })} label={`${pt('page_numbers')} (1 / N)`} icon="hash" /></Row>
              </>}
            </div>
            <div className="msp-area small">{pt('area', { w: Math.round(g.cw), h: Math.round(g.ch) })}</div>
          </div>
          <div className="msp-preview">
            <div className="msp-pv-bar">
              <Icon name="eye" size={14} /><span className="msp-pv-title">{pt('preview')}</span>
              <span className="spacer" />
              <Stepper value={Math.round(zoom * 100)} min={10} max={400} step={10} width={44} unit="%" ariaLabel={pt('zoom')} onChange={(v) => { setZoomMode('pct'); setZoomPct(v); }} />
              <Btn icon="unfold" label={pt('fit_width')} active={zoomMode === 'width'} onClick={() => setZoomMode('width')} />
              <Btn icon="file" label={pt('fit_page')} active={zoomMode === 'page'} onClick={() => setZoomMode('page')} />
            </div>
            <div className="msp-pv-scroll" ref={paneRef}>
              <div className="msp-pv-box" style={{ width: frameW * zoom, height: frameH * zoom }}>
                <iframe ref={frameRef} title={pt('preview')} className="msp-pv-frame" tabIndex={-1}
                  style={{ width: frameW, height: frameH, transform: `scale(${zoom})`, opacity: layout.loading ? 0.35 : 1 }} />
              </div>
              {layout.loading && <div className="msp-pv-loading"><Icon name="spinner" size={16} className="spin" />{pt('loading')}</div>}
            </div>
          </div>
        </div>
        <div className="msp-footer">
          {error
            ? <span className="msp-error"><Icon name="alert" size={14} />{error}</span>
            : <span className="msp-hint small" title={fileOut ? pt('file_hint') : info.silent ? pt('desktop_hint') : pt('web_hint')}><Icon name="info" size={14} />{fileOut ? pt('file_hint') : info.silent ? pt('desktop_hint') : pt('web_hint')}</span>}
          <span className="spacer" />
          <span className="msp-count">{layout.loading ? '' : (layout.printed === layout.pages && L.n === 1 ? pt('pages_count', { n: layout.pages }) : pt('sheets_count', layout))}</span>
          <BtnGroup>
            {info.pdf && !fileOut && <Btn icon="download" label={pt('save_pdf')} disabled={!canGo} onClick={savePdf} />}
            <Btn icon="close" label={pt('cancel')} disabled={busy} onClick={cancel} />
            <Btn icon={busy ? 'spinner' : fileOut ? 'download' : 'print'} label={busy ? pt('printing') : fileOut ? pt('save_pdf') : pt('print')} primary disabled={!canGo} onClick={doPrint}
              title={`${fileOut ? pt('save_pdf') : pt('print')} (Ctrl+P)`} />
          </BtnGroup>
        </div>
      </div>
    </div>
  );
}

export default PrintDialog;
