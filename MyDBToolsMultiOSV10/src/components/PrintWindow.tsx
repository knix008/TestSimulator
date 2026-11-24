// The print window: a window of its own. On the left the printer and every page
// setting; on the right a live preview of exactly what will be printed.
//
// What: the diagram, the schema report or the analysis report.
// Paper: A4 / A3 / A5 / B5 / Letter / Legal, or "Fit the ERD" — a page just the
// size of the diagram plus a small margin (the default for the diagram).
//
// The desktop shell on Windows prints straight to the chosen printer (WebView2
// Print, no second dialog) and saves a PDF through PrintToPdf. Without it (a
// browser, macOS, Linux) the document goes to the system print dialog.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DbSchema } from '../types';
import { invoke } from '@tauri-apps/api/core';
import { getDbDisplayName } from '../types';
import type { NormalizationLevel } from '../core/analysis/normalization';
import type { ReportPrefs } from '../core/export/reportOptions';
import { buildHtmlReport } from '../core/export/htmlReport';
import { buildAnalysisHtml } from '../core/export/analysisReport';
import { renderDiagramToCanvas } from '../core/export/diagramImage';
import { escapeHtml } from '../core/export/reportStyle';
import { getHost } from '../platform';
import { useT } from '../i18n';
import { getPalette, type ThemeId } from '../render/theme';
import { PopupWindow } from './PopupWindow';
import { Icons } from './Icons';

export type PrintTarget = 'diagram' | 'schema' | 'analysis';
export type PrintColor = 'paper' | 'theme';
export type PaperId = 'fit' | 'A4' | 'A3' | 'A5' | 'B5' | 'Letter' | 'Legal';
export type MarginId = 'none' | 'narrow' | 'normal' | 'wide';
export type ScaleId = 'fit' | 'width' | 'actual';

export const PAPERS: Record<Exclude<PaperId, 'fit'>, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A5: [148, 210],
  B5: [176, 250],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};
export const MARGINS: Record<MarginId, number> = { none: 0, narrow: 5, normal: 10, wide: 20 };
/** The margin around the ERD on a "Fit the ERD" page, in mm. */
export const FIT_MARGIN_MM = 6;
const PX_PER_MM = 96 / 25.4;

interface Props {
  schema: DbSchema;
  projectPath: string | null;
  theme: ThemeId;
  levels: NormalizationLevel[];
  report: ReportPrefs;
  onClose: () => void;
  onStatus: (message: string) => void;
}

interface PrinterInfo {
  name: string;
  isDefault: boolean;
  fileOutput: boolean;
}

export interface PageSetup {
  paper: PaperId;
  landscape: boolean;
  margin: MarginId;
  scale: ScaleId;
  color: PrintColor;
  grayscale: boolean;
  header: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The sheet in mm for a setup and an ERD of the given size (mm). */
export function sheetSize(setup: PageSetup, erdMm: { w: number; h: number } | null, header: number): { w: number; h: number; margin: number } {
  if (setup.paper === 'fit') {
    const w = (erdMm?.w ?? 200) + FIT_MARGIN_MM * 2;
    const h = (erdMm?.h ?? 150) + FIT_MARGIN_MM * 2 + header;
    return { w: Math.ceil(w), h: Math.ceil(h), margin: FIT_MARGIN_MM };
  }
  const [a, b] = PAPERS[setup.paper];
  return setup.landscape ? { w: b, h: a, margin: MARGINS[setup.margin] } : { w: a, h: b, margin: MARGINS[setup.margin] };
}

/** The diagram on one sheet, with an optional one-line heading. */
export function buildDiagramPrintHtml(
  schema: DbSchema,
  image: { url: string; wMm: number; hMm: number } | null,
  setup: PageSetup,
  themeId: ThemeId,
  now = new Date(),
): { html: string; w: number; h: number; margin: number } {
  const headerMm = setup.header ? 9 : 0;
  const { w, h, margin } = sheetSize(setup, image ? { w: image.wMm, h: image.hMm } : null, headerMm);
  const palette = getPalette(setup.color === 'paper' ? 'light' : themeId);
  const background = setup.color === 'theme' ? palette.canvasBackground : '#ffffff';
  const text = setup.color === 'theme' ? palette.textPrimary : '#111827';
  const muted = setup.color === 'theme' ? palette.textSecondary : '#6b7280';
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const innerW = w - margin * 2;
  const innerH = h - margin * 2 - headerMm;
  const imgStyle =
    !image
      ? ''
      : setup.paper === 'fit' || setup.scale === 'actual'
        ? `width:${image.wMm}mm;height:${image.hMm}mm;`
        : setup.scale === 'width'
          ? `width:${innerW}mm;height:auto;`
          : `max-width:${innerW}mm;max-height:${innerH}mm;`;
  const body = image
    ? `<img src="${image.url}" alt="" style="${imgStyle}">`
    : `<p class="empty">${escapeHtml('—')}</p>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(schema.Name)}</title>
<style>
@page { size: ${w}mm ${h}mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { width: ${w}mm; font-family: "Malgun Gothic", "맑은 고딕", "Noto Sans KR", system-ui, sans-serif; color: ${text};
  -webkit-print-color-adjust: exact; print-color-adjust: exact; ${setup.grayscale ? 'filter: grayscale(1);' : ''} }
.sheet { width: ${w}mm; height: ${h}mm; padding: ${margin}mm; display: flex; flex-direction: column; background: ${background}; overflow: hidden; }
.head { height: ${headerMm}mm; display: flex; align-items: center; gap: 4mm; border-bottom: 0.3mm solid ${palette.border}; margin-bottom: 0; }
.head h1 { font-size: 12pt; margin: 0; }
.head span { font-size: 8.5pt; color: ${muted}; }
.head .spacer { flex: 1; }
.art { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.art img { display: block; }
.empty { color: ${muted}; }
</style></head><body><div class="sheet">
${setup.header ? `<div class="head"><h1>${escapeHtml(schema.Name)}</h1><span>${escapeHtml(getDbDisplayName(schema.TargetDb))} · ${schema.Tables.length} tables · ${schema.Relationships.length} relationships</span><span class="spacer"></span><span>${stamp}</span></div>` : ''}
<div class="art">${body}</div></div></body></html>`;
  return { html, w, h, margin };
}

/** A report gets the page rule for the chosen paper and margin, and grey if asked. */
function withPageRule(html: string, w: number, h: number, margin: number, grayscale: boolean): string {
  const rule = `<style>@page { size: ${w}mm ${h}mm; margin: ${margin}mm; } ${grayscale ? 'body { filter: grayscale(1); }' : ''}
@media screen { html { background: #ffffff; } body { margin: 0 auto; padding: ${margin}mm; max-width: ${w}mm; } }</style>`;
  return html.includes('</head>') ? html.replace('</head>', `${rule}</head>`) : rule + html;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="ps-field">
      <span className="ps-label">{label}</span>
      <span className="ps-control">{children}</span>
    </label>
  );
}

export function PrintWindow({ schema, projectPath, theme, levels, report, onClose, onStatus }: Props) {
  const t = useT();
  const host = getHost();
  const [target, setTarget] = useState<PrintTarget>('diagram');
  const [setup, setSetup] = useState<PageSetup>({
    paper: 'fit',
    landscape: true,
    margin: 'normal',
    scale: 'fit',
    color: 'paper',
    grayscale: false,
    header: true,
  });
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [silent, setSilent] = useState(false);
  const [printer, setPrinter] = useState('');
  const [copies, setCopies] = useState(1);
  const [collate, setCollate] = useState(true);
  const [duplex, setDuplex] = useState<'none' | 'long' | 'short'>('none');
  const [allPages, setAllPages] = useState(true);
  const [ranges, setRanges] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const frameRef = useRef<HTMLIFrameElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState({ w: 800, h: 600 });
  const set = (patch: Partial<PageSetup>) => setSetup((s) => ({ ...s, ...patch }));

  // The printers, once (silent printing is WebView2's, so Windows desktop only).
  useEffect(() => {
    if (host.kind !== 'desktop') return;
    let cancelled = false;
    void (async () => {
      try {
        const info = await invoke<{ printers: PrinterInfo[]; silent: boolean }>('print_info');
        if (cancelled) return;
        setPrinters(info.printers);
        setSilent(info.silent);
        setPrinter(info.printers.find((p) => p.isDefault)?.name ?? info.printers[0]?.name ?? '');
      } catch {
        /* the system dialog prints instead */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [host.kind]);

  // A report flows over several pages of real paper; the diagram defaults to its own size.
  useEffect(() => {
    setSetup((s) => (target === 'diagram' ? { ...s, paper: 'fit', landscape: true } : { ...s, paper: s.paper === 'fit' ? 'A4' : s.paper, landscape: false }));
  }, [target]);

  // The ERD, cropped to its content with a small margin, in mm at its natural size.
  const image = useMemo(() => {
    try {
      const canvas = renderDiagramToCanvas(schema, { theme: setup.color === 'paper' ? 'light' : theme, scale: 2, transparent: false });
      return { url: canvas.toDataURL('image/png'), wMm: canvas.width / 2 / PX_PER_MM, hMm: canvas.height / 2 / PX_PER_MM };
    } catch {
      return null;
    }
  }, [schema, theme, setup.color]);

  const doc = useMemo(() => {
    if (target === 'diagram') return buildDiagramPrintHtml(schema, image, setup, theme);
    const paper = setup.paper === 'fit' ? 'A4' : setup.paper;
    const { w, h, margin } = sheetSize({ ...setup, paper }, null, 0);
    const html =
      target === 'schema'
        ? buildHtmlReport(schema, { projectPath, erdImageDataUrl: image?.url ?? null, report })
        : buildAnalysisHtml(schema, { projectPath, levels, erdImageDataUrl: image?.url ?? null, report });
    return { html: withPageRule(html, w, h, margin, setup.grayscale), w, h, margin };
  }, [target, schema, image, setup, theme, projectPath, report, levels]);

  // The preview scrolls with the wheel but shows no scroll bars; the printed HTML is unchanged.
  const previewHtml = useMemo(() => {
    const style = '<style>html{overflow-x:hidden;scrollbar-width:none}html::-webkit-scrollbar{display:none}</style>';
    return doc.html.includes('</head>') ? doc.html.replace('</head>', `${style}</head>`) : style + doc.html;
  }, [doc.html]);

  // The preview pane's size, to scale the sheet into it.
  useLayoutEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const win = el.ownerDocument.defaultView ?? window;
    const measure = () => setPane({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new win.ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sheetPx = { w: doc.w * PX_PER_MM, h: doc.h * PX_PER_MM };
  const fixed = target === 'diagram';
  const scale = fixed
    ? Math.min((pane.w - 40) / sheetPx.w, (pane.h - 40) / sheetPx.h, 2)
    : Math.min((pane.w - 40) / sheetPx.w, 1.2);

  const job = () => ({
    html: doc.html,
    widthMm: doc.w,
    heightMm: doc.h,
    // The diagram lays out its own margin; a report gets it from the print settings.
    marginMm: target === 'diagram' ? 0 : doc.margin,
    color: !setup.grayscale,
    duplex: duplex === 'none' ? null : duplex,
    collate,
    pageRanges: allPages ? null : ranges,
  });

  const systemPrint = useCallback(() => {
    frameRef.current?.contentWindow?.focus();
    frameRef.current?.contentWindow?.print();
  }, []);

  const savePdf = useCallback(async () => {
    if (host.kind !== 'desktop') return systemPrint();
    setBusy(true);
    try {
      const output = await invoke<string | null>('files_pick_save', {
        name: `${schema.Name || 'schema'}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (!output) return;
      const result = await invoke<{ pages: number }>('print_pdf', { job: { ...job(), output } });
      const done = t('PrintPdfDone', output, result.pages);
      setMessage(done);
      onStatus(done);
    } catch (error) {
      setMessage(t('PrintFailed', String(error)));
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host.kind, systemPrint, schema.Name, doc, setup, duplex, collate, allPages, ranges, t, onStatus]);

  const print = useCallback(async () => {
    if (host.kind !== 'desktop' || !silent) return systemPrint();
    setBusy(true);
    setMessage(t('PrintSending'));
    try {
      await invoke('print_html', { job: { ...job(), printer: printer || null, copies } });
      const done = t('PrintSent', printer || t('PrintDefaultPrinter'));
      setMessage(done);
      onStatus(done);
    } catch (error) {
      if (String(error) === 'file-printer') {
        // That "printer" only writes a file; its driver's save dialog would pop
        // up from nowhere. The app's own save dialog asks instead.
        setBusy(false);
        await savePdf();
        return;
      }
      setMessage(t('PrintFailed', String(error)));
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host.kind, silent, systemPrint, doc, setup, duplex, collate, allPages, ranges, printer, copies, t, onStatus, savePdf]);

  // Ctrl+P inside the window prints.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const d = rootRef.current?.ownerDocument;
    if (!d) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        void print();
      }
    };
    d.addEventListener('keydown', onKey);
    return () => d.removeEventListener('keydown', onKey);
  }, [print]);

  const title = `${t('PrintWindowTitle')} — ${schema.Name}`;
  const paperLabel = (id: PaperId) => (id === 'fit' ? t('PrintPaperFit') : id);

  return (
    <PopupWindow title={title} width={1260} height={960} kind="print" onClose={onClose} onBlocked={onClose}>
      <div className="print-window" ref={rootRef}>
        <div className="print-split">
          <aside className="print-settings">
            {/* No title bar: the title sits at the top of the settings and moves the window. */}
            <div className="ps-head">
              <span className="dialog-title-icon">
                <Icons.Print />
              </span>
              <span className="ps-head-text">{title}</span>
              <button type="button" className="dialog-close" data-action="print-close" title={t('BtnClose')} aria-label={t('BtnClose')} onClick={onClose}>
                <Icons.Close />
              </button>
            </div>
            <section className="ps-section">
              <h3>
                <Icons.Print />
                {t('PrintPrinter')}
              </h3>
              {silent && printers.length > 0 ? (
                <>
                  <Field label={t('PrintPrinter')}>
                    <select value={printer} data-field="printer" onChange={(e) => setPrinter(e.target.value)}>
                      {printers.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                          {p.isDefault ? ` (${t('PrintDefaultPrinter')})` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('PrintCopies')}>
                    <span className="ps-stepper">
                      <button type="button" aria-label="−" onClick={() => setCopies((c) => Math.max(1, c - 1))}>
                        <Icons.Minus />
                      </button>
                      <output>{copies}</output>
                      <button type="button" aria-label="+" onClick={() => setCopies((c) => Math.min(99, c + 1))}>
                        <Icons.Plus />
                      </button>
                    </span>
                  </Field>
                  <Field label={t('PrintCollate')}>
                    <input type="checkbox" checked={collate} onChange={(e) => setCollate(e.target.checked)} />
                  </Field>
                  <Field label={t('PrintDuplex')}>
                    <select value={duplex} onChange={(e) => setDuplex(e.target.value as typeof duplex)}>
                      <option value="none">{t('PrintDuplexNone')}</option>
                      <option value="long">{t('PrintDuplexLong')}</option>
                      <option value="short">{t('PrintDuplexShort')}</option>
                    </select>
                  </Field>
                </>
              ) : (
                <p className="hint">{t('PrintReadySystem')}</p>
              )}
            </section>

            <section className="ps-section">
              <h3>
                <Icons.Doc />
                {t('PrintTarget')}
              </h3>
              <div className="ps-choices">
                {(
                  [
                    ['diagram', <Icons.Image key="i" />, t('PrintTargetDiagram')],
                    ['schema', <Icons.Doc key="d" />, t('PrintTargetSchema')],
                    ['analysis', <Icons.Analyze key="a" />, t('PrintTargetAnalysis')],
                  ] as const
                ).map(([id, icon, label]) => (
                  <button key={id} type="button" data-print-target={id} className={`btn ${target === id ? 'active' : ''}`} onClick={() => setTarget(id)}>
                    {icon}
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="ps-section">
              <h3>
                <Icons.Portrait />
                {t('PrintPageSetup')}
              </h3>
              <Field label={t('PrintPaperSize')}>
                <select value={setup.paper} data-field="paper" onChange={(e) => set({ paper: e.target.value as PaperId })}>
                  {(target === 'diagram' ? (['fit', 'A4', 'A3', 'A5', 'B5', 'Letter', 'Legal'] as PaperId[]) : (['A4', 'A3', 'A5', 'B5', 'Letter', 'Legal'] as PaperId[])).map((id) => (
                    <option key={id} value={id}>
                      {paperLabel(id)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('PrintOrientation')}>
                <span className="segmented">
                  <button type="button" className={`btn ${!setup.landscape ? 'active' : ''}`} disabled={setup.paper === 'fit'} onClick={() => set({ landscape: false })}>
                    <Icons.Portrait />
                    <span>{t('PrintPortrait')}</span>
                  </button>
                  <button type="button" className={`btn ${setup.landscape ? 'active' : ''}`} disabled={setup.paper === 'fit'} onClick={() => set({ landscape: true })}>
                    <Icons.Landscape />
                    <span>{t('PrintLandscape')}</span>
                  </button>
                </span>
              </Field>
              <Field label={t('PrintMargins')}>
                <select value={setup.margin} disabled={setup.paper === 'fit'} onChange={(e) => set({ margin: e.target.value as MarginId })}>
                  {(Object.keys(MARGINS) as MarginId[]).map((id) => (
                    <option key={id} value={id}>
                      {t(`PrintMargin_${id}`)} ({MARGINS[id]} mm)
                    </option>
                  ))}
                </select>
              </Field>
              {target === 'diagram' && (
                <Field label={t('PrintScale')}>
                  <select value={setup.scale} disabled={setup.paper === 'fit'} onChange={(e) => set({ scale: e.target.value as ScaleId })}>
                    <option value="fit">{t('PrintScaleFit')}</option>
                    <option value="width">{t('PrintScaleWidth')}</option>
                    <option value="actual">{t('PrintScaleActual')}</option>
                  </select>
                </Field>
              )}
              <Field label={t('PrintPages')}>
                <span className="ps-pages">
                  <select value={allPages ? 'all' : 'custom'} onChange={(e) => setAllPages(e.target.value === 'all')}>
                    <option value="all">{t('PrintPagesAll')}</option>
                    <option value="custom">{t('PrintPagesCustom')}</option>
                  </select>
                  {!allPages && <input type="text" placeholder="1-3, 5" value={ranges} onChange={(e) => setRanges(e.target.value)} />}
                </span>
              </Field>
            </section>

            <section className="ps-section">
              <h3>
                <Icons.Palette />
                {t('PrintColor')}
              </h3>
              {target === 'diagram' && (
                <Field label={t('PrintDiagramColors')}>
                  <select value={setup.color} onChange={(e) => set({ color: e.target.value as PrintColor })}>
                    <option value="paper">{t('PrintColorPaper')}</option>
                    <option value="theme">{t('PrintColorTheme')}</option>
                  </select>
                </Field>
              )}
              <Field label={t('PrintGrayscale')}>
                <input type="checkbox" checked={setup.grayscale} onChange={(e) => set({ grayscale: e.target.checked })} />
              </Field>
              {target === 'diagram' && (
                <Field label={t('PrintHeader')}>
                  <input type="checkbox" checked={setup.header} onChange={(e) => set({ header: e.target.checked })} />
                </Field>
              )}
            </section>

            <div className="ps-actions">
              <button type="button" className="btn btn-primary" data-action="print-now" disabled={busy} onClick={() => void print()}>
                <Icons.Print />
                <span>{t('PrintNow')}</span>
              </button>
              <button type="button" className="btn" data-action="print-pdf" disabled={busy} onClick={() => void savePdf()}>
                <Icons.Report />
                <span>{t('PrintSavePdf')}</span>
              </button>
              <button type="button" className="btn ps-close" onClick={onClose}>
                <Icons.Close />
                <span>{t('BtnClose')}</span>
              </button>
            </div>
          </aside>

          <section className="print-preview" ref={paneRef} aria-label={t('PrintPreview')}>
            <div
              className={`print-sheet ${fixed ? 'fixed' : 'flow'}`}
              style={{
                width: sheetPx.w * scale,
                height: fixed ? sheetPx.h * scale : Math.max(200, pane.h - 40),
              }}
            >
              <iframe
                ref={frameRef}
                title={t('PrintPreview')}
                srcDoc={previewHtml}
                style={{
                  width: sheetPx.w,
                  height: fixed ? sheetPx.h : Math.max(200, pane.h - 40) / scale,
                  transform: `scale(${scale})`,
                  transformOrigin: '0 0',
                }}
              />
            </div>
          </section>
        </div>

        <div className="print-status">
          <span>
            {t('PrintSheetInfo', paperLabel(setup.paper), Math.round(doc.w), Math.round(doc.h))}
          </span>
          <span className="spacer" />
          <span>{message || (silent ? t('PrintReadySilent') : t('PrintReadySystem'))}</span>
        </div>
      </div>
    </PopupWindow>
  );
}
