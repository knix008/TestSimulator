// Print: page setup on the left, the real pages on the right. What the preview shows is what the
// printer gets, because both are made from the same measured pages.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DocStyle } from '../document'
import { host } from '../host'
import { paginate, printSheets, sheetsHtml, type PrintPages } from '../print/paginate'
import { DEFAULT_PAGE_SETUP, MARGIN_MAX, PAPERS, SCALE_MAX, SCALE_MIN, parsePageRange, type HeadingLine, type Margins, type PageSetup } from '../print/pageSetup'
import { Stepper, Toggle } from './controls'
import { Dialog } from './dialogs'
import { Icon } from './Icons'

type Range = 'all' | 'current' | 'custom'
const ZOOMS = [50, 75, 100, 125, 150]
const MM_TO_PX = 96 / 25.4
/** "Save as PDF" in the printer list. Windows' own PDF printer would ask with a dialog: this replaces it. */
const SAVE_PDF = '::pdf'
const WINDOWS_PDF = 'Microsoft Print to PDF'

type Props = {
  bodyHtml: string
  title: string
  setup: PageSetup
  style: DocStyle
  /** The printer last used, and telling it the one now chosen. */
  printer: string
  onPrinter: (printer: string) => void
  /** Opened to make a PDF: starts on "Save as PDF", which is then not remembered. */
  asPdf: boolean
  onSetup: (patch: Partial<PageSetup>) => void
  onClose: () => void
  onError: (message: string) => void
}

function HeadingFields({ id, label, line, onChange }: { id: string; label: string; line: HeadingLine; onChange: (line: HeadingLine) => void }) {
  const { t } = useTranslation()
  return (
    <>
      <span>{label}</span>
      <div className="heading-fields">
        {(['left', 'center', 'right'] as const).map((side) => (
          <input key={side} className="text-input" data-field={`${id}-${side}`} value={line[side]} placeholder={t(`print.${side}`)} aria-label={`${label} ${t(`print.${side}`)}`} onChange={(e) => onChange({ ...line, [side]: e.target.value })} />
        ))}
      </div>
    </>
  )
}

export function PrintDialog({ bodyHtml, title, setup, style, printer, onPrinter, asPdf, onSetup, onClose, onError }: Props) {
  const { t } = useTranslation()
  const [result, setResult] = useState<PrintPages | null>(null)
  const [busy, setBusy] = useState(true)
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const [range, setRange] = useState<Range>('all')
  const [rangeText, setRangeText] = useState('')
  const [current, setCurrent] = useState(1)
  const [fitZoom, setFitZoom] = useState(60)
  const preview = useRef<HTMLDivElement>(null)
  // The printers; null where this system can only print through its own dialog.
  const [printers, setPrinters] = useState<string[] | null>(null)
  const [asked, setAsked] = useState(false)
  const [target, setTarget] = useState('')
  const [copies, setCopies] = useState(1)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void host.printers().catch(() => ({ direct: false, printers: [] as string[], default: null })).then((found) => {
      if (!alive) return
      setAsked(true)
      if (!found.direct) return
      // A fax is not paper: pages sent straight to one would go off to wherever its wizard is told.
      const names = found.printers.filter((name) => name !== WINDOWS_PDF && !/\bfax\b/i.test(name))
      setPrinters(names)
      // A printer that is gone falls back to the default; with no default among them, to the PDF,
      // which asks where to save: never to some other printer that would put out paper.
      const wanted = [printer, found.default ?? ''].find((name) => name && names.includes(name)) ?? SAVE_PDF
      setTarget(asPdf || printer === SAVE_PDF ? SAVE_PDF : wanted)
    })
    return () => {
      alive = false
    }
    // Asked once, when the window opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let alive = true
    setBusy(true)
    const timer = window.setTimeout(() => {
      void paginate(bodyHtml, setup, style)
        .then((next) => {
          if (!alive) return
          setResult(next)
          setCurrent((page) => Math.min(page, next.pages.length))
        })
        .catch((error: unknown) => alive && onError(String(error)))
        .finally(() => alive && setBusy(false))
    }, 120)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [bodyHtml, setup, style, onError])

  // "Fit" shows a whole page across the preview's width.
  useEffect(() => {
    const element = preview.current
    if (!element || !result) return undefined
    const fit = () => setFitZoom(Math.max(20, Math.min(150, Math.floor(((element.clientWidth - 48) / (result.width * MM_TO_PX)) * 100))))
    fit()
    const Observer = (element.ownerDocument.defaultView as unknown as { ResizeObserver?: typeof ResizeObserver } | null)?.ResizeObserver ?? ResizeObserver
    const observer = new Observer(fit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [result])

  const shownZoom = zoom === 'fit' ? fitZoom : zoom
  const pages = result?.pages.length ?? 0
  const selected = range === 'all' ? null : range === 'current' ? [current] : parsePageRange(rangeText, pages)
  const rangeBad = range === 'custom' && !selected
  const html = useMemo(() => (result ? sheetsHtml(result, setup, style, title) : ''), [result, setup, style, title])

  // The page in the middle of the preview is the current one.
  const onScroll = () => {
    const element = preview.current
    if (!element) return
    const middle = element.getBoundingClientRect().top + element.clientHeight / 2
    const sheets = element.querySelectorAll<HTMLElement>('.print-page')
    for (const sheet of sheets) {
      const box = sheet.getBoundingClientRect()
      if (box.top <= middle && box.bottom >= middle) {
        setCurrent(Number(sheet.dataset.page))
        break
      }
    }
  }
  const goTo = (page: number) => {
    const target = preview.current?.querySelector(`.print-page[data-page="${page}"]`)
    target?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    setCurrent(page)
  }

  const direct = printers !== null
  const toPdf = target === SAVE_PDF
  const print = async () => {
    if (!result || rangeBad || sending) return
    setSent(null)
    const pdfPath = toPdf ? await host.pickPdf(`${title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'minutes'}.pdf`) : undefined
    if (toPdf && !pdfPath) return
    setSending(true)
    try {
      await printSheets(sheetsHtml(result, setup, style, title, selected ?? undefined), result.width, result.height, { printer: toPdf ? undefined : target || undefined, pdfPath: pdfPath ?? undefined, copies })
      if (direct) setSent(toPdf ? t('print.savedPdf') : t('print.sent', { printer: target }))
    } catch (error) {
      onError(String(error) === 'printer-unavailable' ? t('print.unavailable', { printer: target }) : t('print.failed', { reason: String(error) }))
    } finally {
      setSending(false)
    }
  }

  const margin = (side: keyof Margins) => (value: number) => onSetup({ margins: { ...setup.margins, [side]: value } })

  return (
    <Dialog
      id="print"
      title={t('print.title')}
      icon="print"
      large
      onClose={onClose}
      footer={(
        <>
          <span className="print-pages-note" data-print-count="">{busy ? t('print.measuring') : t('print.pageCount', { count: pages })}</span>
          {(sending || sent) && <span className="print-pages-note" data-print-sent="">{sending ? t('print.sending') : sent}</span>}
          <span className="grow" />
          <button type="button" data-command="print-close" onClick={onClose}><Icon name="close" size={14} /> {t('common.close')}</button>
          <button type="button" className="primary" data-command="print-run" disabled={!result || rangeBad || sending || !asked} onClick={() => void print()}><Icon name={toPdf ? 'pdf' : 'print'} size={14} /> {toPdf ? t('print.savePdf') : t('print.print')}</button>
        </>
      )}
    >
      <div className="print-layout">
        <aside className="print-settings">
          {printers && (
            <section>
              <h4><Icon name="print" size={14} /> {t('print.printer')}</h4>
              <div className="form-grid">
                <span>{t('print.printer')}</span>
                <select
                  className="text-input"
                  data-field="printPrinter"
                  value={target}
                  onChange={(e) => {
                    setTarget(e.target.value)
                    setSent(null)
                    onPrinter(e.target.value)
                  }}
                >
                  {printers.map((name) => <option key={name} value={name}>{name}</option>)}
                  <option value={SAVE_PDF}>{t('print.savePdf')}</option>
                </select>
                <span>{t('print.copies')}</span>
                <Stepper id="printCopies" min={1} max={99} value={copies} disabled={toPdf} onChange={setCopies} />
              </div>
            </section>
          )}
          <section>
            <h4><Icon name="page" size={14} /> {t('print.paper')}</h4>
            <div className="form-grid">
              <span>{t('print.size')}</span>
              <select className="text-input" data-field="printPaper" value={setup.paper} onChange={(e) => onSetup({ paper: e.target.value })}>
                {Object.entries(PAPERS).map(([name, [w, h]]) => <option key={name} value={name}>{name} ({w} × {h} mm)</option>)}
              </select>
              <span>{t('print.orientation')}</span>
              <span className="segmented" data-field="printOrientation" role="radiogroup" aria-label={t('print.orientation')}>
                {(['portrait', 'landscape'] as const).map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={setup.orientation === value} className={`segment${setup.orientation === value ? ' is-on' : ''}`} data-value={value} onClick={() => onSetup({ orientation: value })}>
                    <span className={`orient-glyph is-${value}`} aria-hidden="true" />{t(`print.${value}`)}
                  </button>
                ))}
              </span>
              <span>{t('print.scale')}</span>
              <Stepper id="printScale" unit="%" min={SCALE_MIN} max={SCALE_MAX} step={5} value={setup.scale} onChange={(scale) => onSetup({ scale })} />
            </div>
          </section>
          <section>
            <h4><Icon name="ruler" size={14} /> {t('print.margins')} (mm)</h4>
            <div className="margin-box">
              <span className="margin-top" data-field="printMargin-top"><Stepper min={0} max={MARGIN_MAX} value={setup.margins.top} onChange={margin('top')} labels={{ minus: `${t('print.top')} −`, plus: `${t('print.top')} +` }} /><small>{t('print.top')}</small></span>
              <span className="margin-left" data-field="printMargin-left"><Stepper min={0} max={MARGIN_MAX} value={setup.margins.left} onChange={margin('left')} labels={{ minus: `${t('print.leftMargin')} −`, plus: `${t('print.leftMargin')} +` }} /><small>{t('print.leftMargin')}</small></span>
              <span className="margin-sheet" aria-hidden="true"><i style={{ top: `${setup.margins.top / 2}%`, bottom: `${setup.margins.bottom / 2}%`, left: `${setup.margins.left / 1.5}%`, right: `${setup.margins.right / 1.5}%` }} /></span>
              <span className="margin-right" data-field="printMargin-right"><Stepper min={0} max={MARGIN_MAX} value={setup.margins.right} onChange={margin('right')} labels={{ minus: `${t('print.rightMargin')} −`, plus: `${t('print.rightMargin')} +` }} /><small>{t('print.rightMargin')}</small></span>
              <span className="margin-bottom" data-field="printMargin-bottom"><Stepper min={0} max={MARGIN_MAX} value={setup.margins.bottom} onChange={margin('bottom')} labels={{ minus: `${t('print.bottom')} −`, plus: `${t('print.bottom')} +` }} /><small>{t('print.bottom')}</small></span>
            </div>
          </section>
          <section>
            <h4><Icon name="label" size={14} /> {t('print.headerFooter')}</h4>
            <div className="form-grid">
              <HeadingFields id="printHeader" label={t('print.header')} line={setup.header} onChange={(header) => onSetup({ header })} />
              <HeadingFields id="printFooter" label={t('print.footer')} line={setup.footer} onChange={(footer) => onSetup({ footer })} />
              <span>{t('print.headingSize')}</span>
              <Stepper id="printHeadingSize" unit="pt" min={6} max={24} value={setup.headingSize} onChange={(headingSize) => onSetup({ headingSize })} />
              <span>{t('print.skipFirst')}</span>
              <Toggle id="printSkipFirst" checked={setup.skipFirst} onChange={(skipFirst) => onSetup({ skipFirst })} />
            </div>
            <p className="dialog-note">{t('print.tokens')}</p>
          </section>
          <section>
            <h4><Icon name="list" size={14} /> {t('print.range')}</h4>
            <div className="print-range" role="radiogroup">
              {(['all', 'current', 'custom'] as const).map((value) => (
                <label key={value} className="radio-line">
                  <input type="radio" name="print-range" data-field={`printRange-${value}`} checked={range === value} onChange={() => setRange(value)} />
                  <span>{value === 'current' ? t('print.rangeCurrent', { page: current }) : t(`print.range-${value}`)}</span>
                </label>
              ))}
              <input className={`text-input${rangeBad ? ' is-invalid' : ''}`} data-field="printRangeText" value={rangeText} placeholder="1-3, 5" disabled={range !== 'custom'} onChange={(e) => setRangeText(e.target.value)} />
            </div>
            <p className="dialog-note">{t('print.pdfHint')}</p>
          </section>
          <div className="pref-row pref-reset">
            <button type="button" data-command="print-defaults" onClick={() => onSetup({ ...DEFAULT_PAGE_SETUP })}><Icon name="undo" size={14} /> {t('print.defaults')}</button>
          </div>
        </aside>
        <div className="print-preview-pane">
          <div className="print-preview-bar">
            <button type="button" className="icon-button" data-command="print-prev-page" aria-label={t('print.prevPage')} disabled={current <= 1} onClick={() => goTo(current - 1)}><Icon name="up" /></button>
            <span className="print-page-of" data-print-page="">{t('print.pageOf', { page: current, pages })}</span>
            <button type="button" className="icon-button" data-command="print-next-page" aria-label={t('print.nextPage')} disabled={current >= pages} onClick={() => goTo(current + 1)}><Icon name="down" /></button>
            <span className="grow" />
            <button type="button" className="icon-button" data-command="print-zoom-out" aria-label={t('print.zoomOut')} onClick={() => setZoom(ZOOMS.slice().reverse().find((z) => z < shownZoom) ?? ZOOMS[0])}><Icon name="zoomOut" /></button>
            <select className="text-input print-zoom" data-field="printZoom" aria-label={t('print.zoom')} value={zoom} onChange={(e) => setZoom(e.target.value === 'fit' ? 'fit' : Number(e.target.value))}>
              <option value="fit">{t('print.fit')} ({fitZoom}%)</option>
              {ZOOMS.map((z) => <option key={z} value={z}>{z}%</option>)}
            </select>
            <button type="button" className="icon-button" data-command="print-zoom-in" aria-label={t('print.zoomIn')} onClick={() => setZoom(ZOOMS.find((z) => z > shownZoom) ?? ZOOMS[ZOOMS.length - 1])}><Icon name="zoomIn" /></button>
          </div>
          <div className={`print-preview${busy ? ' is-busy' : ''}`} ref={preview} onScroll={onScroll} data-print-preview="">
            <div className="print-preview-pages" style={{ zoom: shownZoom / 100 }} dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      </div>
    </Dialog>
  )
}
