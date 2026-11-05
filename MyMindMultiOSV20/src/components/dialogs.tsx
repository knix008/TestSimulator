// Dialogs are windows of their own on the desktop: they can be moved anywhere, also outside the
// program. In the browser and in the GUI tests they stay inside the page.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import appIcon from '../../assets/icons/128x128.png'
import { host, isDesktop, type AppInfo } from '../host'
import { canPopOut, fitPopout, openPopout, sizePopout, type Popout } from '../popout'
import type { ExportFormat } from '../utils/exportImage'
import { GripDots } from './controls'
import { Icon } from './Icons'

// The window a dialog is in, for what goes in its title bar.
const PopContext = createContext<Popout | null>(null)

/** Minimize, a maximize that cannot be used, and close, for a dialog with a bar of its own. */
export function WindowButtons({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const pop = useContext(PopContext)
  return (
    <div className="window-controls" data-window-buttons="">
      {pop?.standsFree && (
        <>
          <button type="button" data-command="window-minimize" aria-label={t('toolbar.minimize')} title={t('toolbar.minimize')} onClick={() => void host.popoutMinimize(pop.label)}><svg viewBox="0 0 10 10"><path d="M0 5h10" /></svg></button>
          <button type="button" data-command="window-maximize" aria-label={t('toolbar.maximize')} title={t('toolbar.maximize')} disabled><svg viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" /></svg></button>
        </>
      )}
      <button type="button" className="close" data-command="window-close" aria-label={t('toolbar.close')} title={t('toolbar.close')} onClick={onClose}><svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" /></svg></button>
    </div>
  )
}

type PanelProps = {
  title: string
  icon: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width: number
  panel?: RefObject<HTMLDivElement | null>
  bare?: boolean
  grip?: ReactNode
}

function DialogPanel({ title, icon, onClose, children, footer, width, panel, bare, grip }: PanelProps) {
  return (
    <div className="dialog" ref={panel} style={{ width }}>
      {!bare && (
        <header>
          <strong className="dialog-title" data-dialog-title=""><Icon name={icon} /><span>{title}</span></strong>
          <button type="button" className="mini" aria-label="×" onClick={onClose}><Icon name="close" size={14} /></button>
        </header>
      )}
      <div className="dialog-body">{children}</div>
      {footer && <footer>{footer}</footer>}
      {grip}
    </div>
  )
}

type DialogProps = Omit<PanelProps, 'panel' | 'grip' | 'width'> & { id: string; width?: number; height?: number; standsFree?: boolean }

/** The dialog in a window of its own. */
function WindowDialog({ pop, onClose, id, height, width, ...rest }: Omit<DialogProps, 'standsFree' | 'width'> & { pop: Popout; width: number }) {
  const panel = useRef<HTMLDivElement>(null)
  const closing = useRef(onClose)
  closing.current = onClose

  // Sized to the dialog once it has laid out, then shown; later it follows the content. One that
  // stands free has the size it is given, and then the size the user gives it.
  useEffect(() => {
    if (pop.standsFree) {
      const first = setTimeout(() => void sizePopout(pop, { width, height: height ?? 600 }), 60)
      return () => clearTimeout(first)
    }
    let last = ''
    const key = () => {
      const box = panel.current?.getBoundingClientRect()
      return box ? `${Math.ceil(box.width)}x${Math.ceil(box.height)}` : ''
    }
    let shown = false
    const first = setTimeout(() => {
      if (!panel.current) return
      last = key()
      shown = true
      void fitPopout(pop, panel.current)
    }, 60)
    const Observer = (pop.win as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver ?? ResizeObserver
    const follow = new Observer(() => {
      if (!shown || !panel.current || key() === last) return
      last = key()
      void fitPopout(pop, panel.current, { resizeOnly: true })
    })
    if (panel.current) follow.observe(panel.current)
    return () => {
      clearTimeout(first)
      follow.disconnect()
    }
    // Its size is read once, when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pop])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closing.current()
    }
    pop.win.addEventListener('keydown', key)
    return () => pop.win.removeEventListener('keydown', key)
  }, [pop])

  // The title bar moves the window, or the bar of a dialog that has its title in it.
  const onDragDown = (event: React.PointerEvent) => {
    const target = event.target as Element
    if (event.button !== 0 || !target.closest('.dialog > header, [data-window-drag]')) return
    if (!target.closest('button, input, select, textarea, a')) void host.popoutDrag(pop.label)
  }
  return createPortal(
    <div
      data-dialog={id}
      role="dialog"
      aria-modal="true"
      aria-label={rest.title}
      onPointerDown={onDragDown}
      onContextMenu={(event) => {
        // The app's own right-click menu belongs to the main window.
        event.stopPropagation()
        if (!(event.target as Element).closest('input, textarea')) event.preventDefault()
      }}
    >
      <PopContext.Provider value={pop}>
        <DialogPanel
          {...rest}
          width={width}
          onClose={onClose}
          panel={panel}
          grip={pop.standsFree && (
            <button type="button" className="grip dialog-grip" aria-label="resize" onPointerDown={(event) => { event.preventDefault(); void host.popoutResize(pop.label) }}>
              <GripDots />
            </button>
          )}
        />
      </PopContext.Provider>
    </div>,
    pop.root,
  )
}

function InlineDialog({ id, onClose, width, ...rest }: Omit<DialogProps, 'standsFree' | 'width' | 'height'> & { width: number }) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="overlay-dim" role="dialog" aria-modal="true" aria-label={rest.title} data-dialog={id}>
      <DialogPanel {...rest} width={width} onClose={onClose} />
    </div>
  )
}

export function Dialog({ title, icon, onClose, children, footer, width = 460, id, bare = false, standsFree = false, height }: DialogProps) {
  // undefined: the window is being opened. null: no window, so inside the page.
  const [pop, setPop] = useState<Popout | null | undefined>(canPopOut() ? undefined : null)
  const closing = useRef(onClose)
  closing.current = onClose
  useEffect(() => {
    if (!canPopOut()) return undefined
    const opened = openPopout(id, title, width, { standsFree })
    if (!opened) {
      setPop(null)
      return undefined
    }
    setPop(opened)
    let ours = true
    // Alt+F4 or anything else closed the window: the dialog ends with it.
    const off = host.on<string>('popout-closed', (label) => {
      if (ours && label === opened.label) closing.current()
    })
    return () => {
      ours = false
      off()
      opened.stop()
      void host.popoutClose(opened.label).catch(() => {})
    }
    // The window lives as long as the dialog; its size and title are read when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  useEffect(() => {
    if (pop) pop.win.document.title = title
  }, [pop, title])
  const props = { title, icon, onClose, footer, width, id, bare }
  if (pop === undefined) return null
  if (pop === null) return <InlineDialog {...props}>{children}</InlineDialog>
  return <WindowDialog pop={pop} height={height} {...props}>{children}</WindowDialog>
}

/** Save / Don't Save / Cancel, before unsaved work would be lost. */
export function UnsavedDialog({ name, onSave, onDiscard, onCancel }: { name: string; onSave: () => void; onDiscard: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  return (
    <Dialog
      id="unsaved"
      title={t('closePrompt.title')}
      icon="warning"
      onClose={onCancel}
      footer={(
        <>
          <button type="button" data-command="unsaved-cancel" onClick={onCancel}><Icon name="close" size={14} /> {t('closePrompt.cancel')}</button>
          <button type="button" data-command="unsaved-discard" onClick={onDiscard}><Icon name="delete" size={14} /> {t('closePrompt.discard')}</button>
          <button type="button" className="primary" data-command="unsaved-save" onClick={onSave}><Icon name="save" size={14} /> {t('closePrompt.save')}</button>
        </>
      )}
    >
      <p className="dialog-message">{t('closePrompt.message', { name })}</p>
    </Dialog>
  )
}

export function ConfirmDialog({ title, message, yesLabel, onYes, onNo }: { title?: string; message: string; yesLabel?: string; onYes: () => void; onNo: () => void }) {
  const { t } = useTranslation()
  return (
    <Dialog
      id="confirm"
      title={title ?? t('appTitle')}
      icon="warning"
      onClose={onNo}
      footer={(
        <>
          <button type="button" data-command="confirm-no" onClick={onNo}><Icon name="close" size={14} /> {t('closePrompt.cancel')}</button>
          <button type="button" className="primary" data-command="confirm-yes" onClick={onYes}><Icon name="check" size={14} /> {yesLabel ?? t('dialog.ok')}</button>
        </>
      )}
    >
      <p className="dialog-message">{message}</p>
    </Dialog>
  )
}

export function MessageDialog({ title, message, onClose }: { title?: string; message: string; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Dialog id="message" title={title ?? t('appTitle')} icon="warning" onClose={onClose} footer={<button type="button" className="primary" data-command="message-ok" onClick={onClose}><Icon name="check" size={14} /> {t('dialog.ok')}</button>}>
      <p className="dialog-message" data-message="">{message}</p>
    </Dialog>
  )
}

/** One line of text, for what used to be window.prompt. */
export function InputDialog({ title, label, initial, onOk, onCancel }: { title: string; label: string; initial: string; onOk: (text: string) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState(initial)
  const submit = () => {
    if (text.trim()) onOk(text.trim())
  }
  return (
    <Dialog
      id="input"
      title={title}
      icon="label"
      onClose={onCancel}
      footer={(
        <>
          <button type="button" data-command="input-cancel" onClick={onCancel}><Icon name="close" size={14} /> {t('closePrompt.cancel')}</button>
          <button type="button" className="primary" data-command="input-ok" disabled={!text.trim()} onClick={submit}><Icon name="check" size={14} /> {t('dialog.ok')}</button>
        </>
      )}
    >
      <div className="form-grid">
        <span>{label}</span>
        <input className="text-input" data-field="inputText" autoFocus value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submit()} />
      </div>
    </Dialog>
  )
}

const FORMATS: ExportFormat[] = ['png', 'jpeg', 'webp', 'svg']

/** Choose an image format and whether the background is transparent. */
export function ExportDialog({ onExport, onCancel }: { onExport: (format: ExportFormat, transparent: boolean) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const [format, setFormat] = useState<ExportFormat>('png')
  const [transparent, setTransparent] = useState(false)
  // JPEG has no alpha channel, so transparency is unavailable.
  const noAlpha = format === 'jpeg'
  return (
    <Dialog
      id="export"
      title={t('export.title')}
      icon="export"
      onClose={onCancel}
      footer={(
        <>
          <button type="button" data-command="export-cancel" onClick={onCancel}><Icon name="close" size={14} /> {t('export.cancel')}</button>
          <button type="button" className="primary" data-command="export-run" onClick={() => onExport(format, transparent && !noAlpha)}><Icon name="export" size={14} /> {t('export.export')}</button>
        </>
      )}
    >
      <div className="form-grid">
        <span>{t('export.format')}</span>
        <div className="export-formats">
          {FORMATS.map((item) => (
            <button type="button" key={item} data-export-format={item} className={format === item ? 'format-on' : undefined} aria-pressed={format === item} onClick={() => setFormat(item)}>
              <Icon name="image" size={14} /> {item.toUpperCase()}
            </button>
          ))}
        </div>
        <span>{t('export.transparent')}</span>
        <button type="button" role="switch" data-field="exportTransparent" aria-checked={transparent && !noAlpha} aria-label={t('export.transparent')} disabled={noAlpha} className={transparent && !noAlpha ? 'toggle on' : 'toggle'} onClick={() => setTransparent(!transparent)}><i /></button>
      </div>
      {noAlpha && <p className="dialog-note export-note">{t('export.jpegHint')}</p>}
    </Dialog>
  )
}

const PLATFORM_NAMES: Record<string, string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux' }
const AUTHOR_MAIL = 'knix008@naver.com'

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    void host.appInfo().then(setInfo).catch(() => {})
  }, [])
  const build = `${__BUILD_INFO__.date}${__BUILD_INFO__.commit ? ` (${__BUILD_INFO__.commit})` : ''}`
  const rows: [string, ReactNode][] = [
    ['about.version', info?.version ?? __APP_VERSION__],
    ['about.buildDate', build],
    ['about.format', '.mmap'],
    ['about.runtime', isDesktop ? `Tauri ${info?.tauri ?? ''}, WebView ${info?.webview ?? ''}, React` : 'Web, React'],
    ['about.platform', info ? `${PLATFORM_NAMES[info.platform] ?? info.platform} (${info.arch})` : 'Web'],
    ['about.developer', 'SHKWON'],
    ['about.email', <a key="mail" href={`mailto:${AUTHOR_MAIL}`} onClick={(event) => { event.preventDefault(); void host.openExternal(`mailto:${AUTHOR_MAIL}`) }}>{AUTHOR_MAIL}</a>],
    ['about.copyright', 'Copyright © 2026 SHKWON'],
  ]
  return (
    <Dialog id="about" title={t('about.title')} icon="about" onClose={onClose} width={520} footer={<button type="button" className="primary" data-command="about-close" onClick={onClose}><Icon name="close" size={14} /> {t('about.close')}</button>}>
      <div className="about-body">
        <img className="about-icon" src={appIcon} alt="" />
        <div className="about-copy">
          <p className="about-name"><strong>MyMind</strong><span>{__APP_VERSION__}</span></p>
          <p>{t('about.description')}</p>
        </div>
        <dl className="about-meta">
          {rows.map(([key, value]) => (
            <div key={key} style={{ display: 'contents' }} data-about={key}>
              <dt>{t(key)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Dialog>
  )
}
