/**
 * The shared print window (print.html, Tauri window "print"). Everything that prints opens
 * this window with its HTML (open_print_window); it is a window of its own, so it can be
 * moved outside the main window. Left: printer, copies, paper, orientation, margins, scale,
 * colour. Right: the pages as they will print. Print sends them straight to the printer
 * (printing.rs, no system dialog); printers that write files (Print to PDF) ask for a file
 * name first. The theme follows the main window at once (shared localStorage → storage event).
 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { translate, type Locale, type MessageKey } from '../i18n/messages'
import { WindowControls } from '../layout/TitleBar'
import { applyTheme, loadThemeId } from '../theme/themes'
import { Icons } from '../Toolbar'

type Doc = { title: string; html: string; lang: string }
type Printers = { printers: string[]; defaultPrinter: string; filePrinters: string[]; direct: boolean }

const PAPERS: { id: string; w: number; h: number }[] = [
  { id: 'A4', w: 210, h: 297 },
  { id: 'A3', w: 297, h: 420 },
  { id: 'A5', w: 148, h: 210 },
  { id: 'B5', w: 182, h: 257 },
  { id: 'Letter', w: 215.9, h: 279.4 },
  { id: 'Legal', w: 215.9, h: 355.6 },
]
const MARGINS: { id: string; mm: number }[] = [
  { id: 'none', mm: 0 },
  { id: 'narrow', mm: 6.35 },
  { id: 'normal', mm: 12.7 },
  { id: 'wide', mm: 25.4 },
]
const PX_PER_MM = 96 / 25.4
const SETTINGS_KEY = 'isomaker.printSettings'

type Settings = { printer: string; copies: number; paper: string; landscape: boolean; margin: string; scale: number; gray: boolean; zoom: number }

function loadSettings(): Partial<Settings> {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

function locale(): Locale {
  try {
    return localStorage.getItem('isomaker.locale') === 'en' ? 'en' : 'ko'
  } catch {
    return 'ko'
  }
}

export function PrintApp() {
  const [lang, setLang] = useState<Locale>(locale)
  const t = useCallback((k: MessageKey, ...a: string[]) => translate(lang, k, ...a), [lang])
  const [doc, setDoc] = useState<Doc>({ title: '', html: '', lang: 'ko' })
  const [printers, setPrinters] = useState<Printers | null>(null)
  const saved = useMemo(loadSettings, [])
  const [s, setS] = useState<Settings>({
    printer: saved.printer ?? '',
    copies: saved.copies ?? 1,
    paper: saved.paper ?? 'A4',
    landscape: saved.landscape ?? false,
    margin: saved.margin ?? 'normal',
    scale: saved.scale ?? 100,
    gray: saved.gray ?? false,
    zoom: saved.zoom ?? 0,
  })
  const [status, setStatus] = useState<{ kind: 'info' | 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<Settings>) =>
    setS((cur) => {
      const next = { ...cur, ...patch }
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      } catch {
        /* no storage */
      }
      return next
    })

  // Theme and language follow the main window as soon as they change there.
  useEffect(() => {
    applyTheme(loadThemeId())
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith('isomaker.theme') || e.key === 'isomaker.customTheme') applyTheme(loadThemeId())
      if (!e.key || e.key === 'isomaker.locale') setLang(locale())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    const load = () => void invoke<Doc>('print_content').then((d) => d && setDoc(d))
    load()
    const off = listen('print-content', load)
    void invoke<Printers>('list_printers').then(
      (p) => setPrinters(p),
      () => setPrinters({ printers: [], defaultPrinter: '', filePrinters: [], direct: false }),
    )
    return () => void off.then((f) => f())
  }, [])

  useEffect(() => {
    document.title = `${t('printTitle')} — ${doc.title}`
    void getCurrentWindow().setTitle(document.title).catch(() => {})
  }, [doc.title, t])

  const paper = PAPERS.find((p) => p.id === s.paper) ?? PAPERS[0]!
  const margin = MARGINS.find((m) => m.id === s.margin)?.mm ?? 12.7
  const pageW = s.landscape ? paper.h : paper.w
  const pageH = s.landscape ? paper.w : paper.h
  const printer = s.printer || printers?.defaultPrinter || ''
  const isFilePrinter = Boolean(printers?.filePrinters.includes(printer))

  // ── Preview: the document laid out at the printable width, cut into pages ──
  const measure = useRef<HTMLDivElement>(null)
  const [contentH, setContentH] = useState(0)
  const contentWpx = (pageW - margin * 2) * PX_PER_MM * (100 / s.scale)
  const pageContentHpx = (pageH - margin * 2) * PX_PER_MM * (100 / s.scale)
  useLayoutEffect(() => {
    const el = measure.current
    if (!el) return
    const update = () => setContentH(el.scrollHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [doc.html, contentWpx])
  const pages = Math.max(1, Math.ceil(contentH / Math.max(1, pageContentHpx)))
  const previewBox = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(800)
  useLayoutEffect(() => {
    const el = previewBox.current
    if (!el) return
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth))
    ro.observe(el)
    setBoxW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const fitZoom = Math.max(0.2, Math.min(1.5, (boxW - 48) / (pageW * PX_PER_MM)))
  const zoom = s.zoom > 0 ? s.zoom / 100 : fitZoom

  const job = () => ({ printer, copies: s.copies, widthMm: pageW, heightMm: pageH, gray: s.gray, marginMm: margin, scale: s.scale })

  async function doPrint() {
    setBusy(true)
    setStatus({ kind: 'info', text: t('printSending') })
    try {
      if (!printers?.direct) {
        window.print()
        setStatus({ kind: 'ok', text: t('printSystemDialog') })
        return
      }
      if (isFilePrinter) {
        const path = await invoke<string | null>('pick', {
          options: { kind: 'save', title: t('printSavePdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }], hintPath: null, fileName: `${doc.title || 'document'}.pdf` },
        })
        if (!path) {
          setStatus(null)
          return
        }
        await invoke('print_pdf', { label: 'print', job: job(), path })
        setStatus({ kind: 'ok', text: t('printSaved', path) })
        return
      }
      await invoke('print_direct', { label: 'print', job: job() })
      setStatus({ kind: 'ok', text: t('printDone', printer || t('printDefault')) })
    } catch (err) {
      setStatus({ kind: 'error', text: t('printFailed', String(err)) })
    } finally {
      setBusy(false)
    }
  }

  async function savePdf() {
    const path = await invoke<string | null>('pick', {
      options: { kind: 'save', title: t('printSavePdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }], hintPath: null, fileName: `${doc.title || 'document'}.pdf` },
    }).catch(() => null)
    if (!path) return
    setBusy(true)
    try {
      await invoke('print_pdf', { label: 'print', job: job(), path })
      setStatus({ kind: 'ok', text: t('printSaved', path) })
    } catch (err) {
      setStatus({ kind: 'error', text: t('printFailed', String(err)) })
    } finally {
      setBusy(false)
    }
  }

  const close = () => void getCurrentWindow().close()

  const docStyle = { width: `${contentWpx}px` }
  const docClass = `print-doc help-doc${s.gray ? ' gray' : ''}`

  return (
    <div className="print-app" style={{ ['--print-margin' as string]: `${margin}mm` }}>
      <div className="titlebar" data-tauri-drag-region>
        <div className="title-brand" data-tauri-drag-region>
          <span className="title-icon-svg" aria-hidden="true">
            {Icons.print}
          </span>
          <span className="title-name" data-tauri-drag-region>
            {t('printTitle')}
          </span>
          <span className="title-version" data-tauri-drag-region>
            {doc.title}
          </span>
        </div>
        <span className="titlebar-drag" data-tauri-drag-region />
        <WindowControls t={t} />
      </div>

      <div className="print-body">
        <aside className="print-settings">
          <label className="print-field">
            <span>{t('printPrinter')}</span>
            <select value={printer} onChange={(e) => set({ printer: e.target.value })} disabled={!printers?.direct}>
              {(printers?.printers.length ? printers.printers : [printer || t('printDefault')]).map((p) => (
                <option key={p} value={p}>
                  {p}
                  {p === printers?.defaultPrinter ? ` (${t('printDefault')})` : ''}
                </option>
              ))}
            </select>
          </label>
          {isFilePrinter ? <p className="print-note">{t('printFileNote')}</p> : null}
          <label className="print-field">
            <span>{t('printCopies')}</span>
            <div className="num-step">
              <button type="button" onClick={() => set({ copies: Math.max(1, s.copies - 1) })}>−</button>
              <input value={s.copies} onChange={(e) => set({ copies: Math.max(1, Math.min(999, Number(e.target.value) || 1)) })} />
              <button type="button" onClick={() => set({ copies: Math.min(999, s.copies + 1) })}>+</button>
            </div>
          </label>
          <label className="print-field">
            <span>{t('printPaper')}</span>
            <select value={s.paper} onChange={(e) => set({ paper: e.target.value })}>
              {PAPERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} ({p.w} × {p.h} mm)
                </option>
              ))}
            </select>
          </label>
          <div className="print-field">
            <span>{t('printOrientation')}</span>
            <div className="settings-seg">
              <button type="button" className={`settings-seg-btn${!s.landscape ? ' on' : ''}`} onClick={() => set({ landscape: false })}>
                {t('printPortrait')}
              </button>
              <button type="button" className={`settings-seg-btn${s.landscape ? ' on' : ''}`} onClick={() => set({ landscape: true })}>
                {t('printLandscape')}
              </button>
            </div>
          </div>
          <label className="print-field">
            <span>{t('printMargins')}</span>
            <select value={s.margin} onChange={(e) => set({ margin: e.target.value })}>
              {MARGINS.map((m) => (
                <option key={m.id} value={m.id}>
                  {t(`printMargin_${m.id}` as MessageKey)} ({m.mm} mm)
                </option>
              ))}
            </select>
          </label>
          <label className="print-field">
            <span>{t('printScale')}</span>
            <div className="num-step">
              <button type="button" onClick={() => set({ scale: Math.max(50, s.scale - 10) })}>−</button>
              <input value={`${s.scale}%`} onChange={(e) => set({ scale: Math.max(50, Math.min(200, parseInt(e.target.value, 10) || 100)) })} />
              <button type="button" onClick={() => set({ scale: Math.min(200, s.scale + 10) })}>+</button>
            </div>
          </label>
          <div className="print-field">
            <span>{t('printColor')}</span>
            <div className="settings-seg">
              <button type="button" className={`settings-seg-btn${!s.gray ? ' on' : ''}`} onClick={() => set({ gray: false })}>
                {t('printColorColor')}
              </button>
              <button type="button" className={`settings-seg-btn${s.gray ? ' on' : ''}`} onClick={() => set({ gray: true })}>
                {t('printColorGray')}
              </button>
            </div>
          </div>
          <div className="print-summary">
            {t('printPages', String(pages))} · {pageW} × {pageH} mm
          </div>
          <div className="print-actions">
            <button type="button" className="dialog-btn primary" data-print-go="" disabled={busy || !doc.html} onClick={() => void doPrint()}>
              {Icons.print}
              <span>{t('helpPrint')}</span>
            </button>
            <button type="button" className="dialog-btn" disabled={busy || !doc.html || !printers?.direct} onClick={() => void savePdf()}>
              {Icons.download}
              <span>{t('printSavePdf')}</span>
            </button>
            <button type="button" className="dialog-btn" onClick={close}>
              {Icons.close}
              <span>{t('dialogClose')}</span>
            </button>
          </div>
          {status ? <p className={`print-status ${status.kind}`}>{status.text}</p> : null}
        </aside>

        <section className="print-preview-wrap">
          <div className="print-preview-tools">
            <span>{t('printPreview')}</span>
            <span className="grow" />
            <button type="button" className="dock-btn" title="−" onClick={() => set({ zoom: Math.max(20, Math.round(zoom * 100) - 10) })}>
              −
            </button>
            <span className="print-zoom">{Math.round(zoom * 100)}%</span>
            <button type="button" className="dock-btn" title="+" onClick={() => set({ zoom: Math.min(200, Math.round(zoom * 100) + 10) })}>
              +
            </button>
            <button type="button" className="dialog-btn" onClick={() => set({ zoom: 0 })}>
              {t('printFit')}
            </button>
          </div>
          <div className="print-preview" ref={previewBox}>
            {Array.from({ length: pages }, (_, i) => (
              <div key={i} className="print-sheet-outer" style={{ width: pageW * PX_PER_MM * zoom, height: pageH * PX_PER_MM * zoom }}>
                <div className="print-sheet" style={{ width: pageW * PX_PER_MM, height: pageH * PX_PER_MM, transform: `scale(${zoom})` }}>
                  <div className="print-sheet-area" style={{ inset: `${margin * PX_PER_MM}px` }}>
                    <div style={{ transform: `scale(${s.scale / 100})`, transformOrigin: '0 0' }}>
                      <div
                        className={docClass}
                        style={{ ...docStyle, marginTop: -i * pageContentHpx }}
                        dangerouslySetInnerHTML={{ __html: doc.html }}
                      />
                    </div>
                  </div>
                  <span className="print-page-no">
                    {i + 1} / {pages}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* What the printer gets (only this is visible in print) and the measuring copy. */}
      <div className="print-out" aria-hidden="true">
        <div className={docClass} dangerouslySetInnerHTML={{ __html: doc.html }} />
      </div>
      <div className="print-measure" aria-hidden="true">
        <div ref={measure} className={docClass} style={docStyle} dangerouslySetInnerHTML={{ __html: doc.html }} />
      </div>
    </div>
  )
}
