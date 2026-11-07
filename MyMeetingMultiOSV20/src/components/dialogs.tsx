// Dialogs are windows of their own on the desktop: they can be moved anywhere, also outside the
// program. In the browser and for the screenshots they stay inside the page.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { host, isDesktop, type AppInfo } from '../host'
import { canPopOut, closePopout, fitPopout, openPopoutSoon, sizePopout, type Popout } from '../popout'
import type { MediaStorageChoice } from '../settings'
import { GripDots } from './controls'
import { Icon } from './Icons'

// The window a dialog is in, for what goes in its title bar.
const PopContext = createContext<Popout | null>(null)

/** The window the component is drawn in: a dialog's own, or the main one. */
export const usePopout = () => useContext(PopContext)

/** Starts moving the window a dialog is in, from a bar of its own (the guide, the tutorial card). */
export function dragPopout(pop: Popout | null, event: React.PointerEvent): boolean {
  if (!pop || event.button !== 0 || (event.target as Element).closest('button, input, select, textarea, a')) return false
  void host.popoutDrag(pop.label)
  return true
}

/** Close, and for a window that stands free also minimize, for a dialog with a bar of its own. */
export function WindowButtons({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const pop = useContext(PopContext)
  return (
    <div className="window-controls" data-window-buttons="">
      {pop?.standsFree && (
        <button type="button" data-command="window-minimize" aria-label={t('toolbar.minimize')} title={t('toolbar.minimize')} onClick={() => void host.popoutMinimize(pop.label)}><svg viewBox="0 0 10 10"><path d="M0 5h10" /></svg></button>
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
  /** A dialog that draws its own bar (the guide). */
  bare?: boolean
  /** Fills most of the window (inside the page). */
  large?: boolean
  grip?: ReactNode
}

function DialogPanel({ title, icon, onClose, children, footer, width, panel, bare, large, grip }: PanelProps) {
  const { t } = useTranslation()
  return (
    <div className={`dialog${large ? ' dialog-large' : ''}`} ref={panel} style={large ? undefined : { width }}>
      {!bare && (
        <header>
          <strong className="dialog-title" data-dialog-title=""><Icon name={icon} /><span>{title}</span></strong>
          <button type="button" className="mini dialog-close" aria-label={t('common.close')} title={t('common.close')} data-command="dialog-close" onClick={onClose}><Icon name="close" size={14} /></button>
        </header>
      )}
      <div className="dialog-body">{children}</div>
      {footer && <footer>{footer}</footer>}
      {grip}
    </div>
  )
}

type DialogProps = Omit<PanelProps, 'panel' | 'grip' | 'width'> & { id: string; width?: number }

/** The size a large dialog's window opens with: most of the screen. */
function largeSize(win: Window) {
  const screen = win.screen
  return {
    width: Math.round(Math.min(1320, (screen?.availWidth ?? 1400) - 80)),
    height: Math.round(Math.min(900, (screen?.availHeight ?? 960) - 80)),
  }
}

/** The dialog in a window of its own. */
function WindowDialog({ pop, onClose, id, width, ...rest }: Omit<DialogProps, 'width'> & { pop: Popout; width: number }) {
  const panel = useRef<HTMLDivElement>(null)
  const closing = useRef(onClose)
  closing.current = onClose

  // Sized to the dialog once it has laid out, then shown; later it follows the content. One that
  // stands free has the size it is given, and then the size the user gives it.
  useEffect(() => {
    if (pop.standsFree) {
      const first = setTimeout(() => void sizePopout(pop, largeSize(pop.win)), 60)
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
      void fitPopout(pop, panel.current).then(() => {
        panel.current?.querySelector<HTMLElement>('[autofocus], input, select, textarea, footer .primary')?.focus({ preventScroll: true })
      })
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
      if (event.key === 'Escape' && !event.defaultPrevented) closing.current()
    }
    pop.win.addEventListener('keydown', key)
    return () => pop.win.removeEventListener('keydown', key)
  }, [pop])

  // The title bar moves the window, or the bar of a dialog that has its title in it.
  const onDragDown = (event: React.PointerEvent) => {
    if ((event.target as Element).closest('.dialog > header, [data-window-drag]')) dragPopout(pop, event)
  }
  return createPortal(
    <div
      data-dialog={id}
      role="dialog"
      aria-modal="true"
      aria-label={rest.title}
      onPointerDown={onDragDown}
      onContextMenu={(event) => {
        if (!(event.target as Element).closest('input, textarea, [contenteditable="true"]')) event.preventDefault()
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

function InlineDialog({ id, onClose, width, ...rest }: Omit<DialogProps, 'width'> & { width: number }) {
  const closing = useRef(onClose)
  closing.current = onClose
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      // Only the dialog on top closes.
      const all = document.querySelectorAll('.overlay-dim')
      if (all[all.length - 1] !== panel.current?.parentElement) return
      event.preventDefault()
      closing.current()
    }
    window.addEventListener('keydown', key)
    panel.current?.querySelector<HTMLElement>('[autofocus], input, select, textarea, footer .primary')?.focus({ preventScroll: true })
    return () => window.removeEventListener('keydown', key)
  }, [])
  return (
    <div className="overlay-dim" role="dialog" aria-modal="true" aria-label={rest.title} data-dialog={id}>
      <DialogPanel {...rest} width={width} onClose={onClose} panel={panel} />
    </div>
  )
}

/**
 * The window a dialog lives in, while it is shown. undefined: being opened. null: no window, so
 * inside the page. The window's size and title are read when it opens.
 */
function usePopoutWindow(id: string, title: string, width: number, onClose: () => void, options: { standsFree?: boolean; tool?: boolean }) {
  const [pop, setPop] = useState<Popout | null | undefined>(canPopOut() ? undefined : null)
  const closing = useRef(onClose)
  closing.current = onClose
  useEffect(() => {
    if (!canPopOut()) return undefined
    let ours = true
    let opened: Popout | null = null
    let off = () => {}
    void openPopoutSoon(id, title, width, options).then((made) => {
      if (!ours) {
        if (made) {
          made.stop()
          closePopout(made.label)
        }
        return
      }
      opened = made
      setPop(made)
      if (!made) return
      // Alt+F4 or anything else closed the window: the dialog ends with it.
      off = host.on<string>('popout-closed', (label) => {
        if (ours && label === made.label) closing.current()
      })
    })
    return () => {
      ours = false
      off()
      if (opened) {
        opened.stop()
        closePopout(opened.label)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  useEffect(() => {
    if (pop) pop.win.document.title = title
  }, [pop, title])
  return pop
}

export function Dialog({ title, icon, onClose, children, footer, width = 460, id, bare = false, large = false }: DialogProps) {
  const pop = usePopoutWindow(id, title, large ? largeSize(window).width : width, onClose, { standsFree: large })
  const props = { title, icon, onClose, footer, width, id, bare, large }
  if (pop === undefined) return null
  if (pop === null) return <InlineDialog {...props}>{children}</InlineDialog>
  return <WindowDialog pop={pop} {...props}>{children}</WindowDialog>
}

/** A small window that floats over the main one while it goes on taking input (the tutorial card). */
export function ToolWindow({ id, title, onClose, children }: { id: string; title: string; onClose: () => void; children: ReactNode }) {
  const pop = usePopoutWindow(id, title, 420, onClose, { tool: true })
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pop) return undefined
    pop.root.classList.add('popout-tool')
    let shown = false
    let last = ''
    const key = () => {
      const box = panel.current?.firstElementChild?.getBoundingClientRect()
      return box ? `${Math.ceil(box.width)}x${Math.ceil(box.height)}` : ''
    }
    const fit = (resizeOnly: boolean) => {
      const element = panel.current?.firstElementChild
      if (element) void fitPopout(pop, element, { resizeOnly })
    }
    const first = setTimeout(() => {
      last = key()
      shown = true
      fit(false)
    }, 60)
    const Observer = (pop.win as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver ?? ResizeObserver
    const follow = new Observer(() => {
      if (!shown || key() === last) return
      last = key()
      fit(true)
    })
    const element = panel.current?.firstElementChild
    if (element) follow.observe(element)
    return () => {
      clearTimeout(first)
      follow.disconnect()
    }
  }, [pop])
  if (pop === undefined) return null
  if (pop === null) return <>{children}</>
  return createPortal(
    <div ref={panel} data-tool-window={id}>
      <PopContext.Provider value={pop}>{children}</PopContext.Provider>
    </div>,
    pop.root,
  )
}

/** Save / Don't Save / Cancel, before unsaved work would be lost. */
export function UnsavedDialog({ name, onSave, onDiscard, onCancel }: { name: string; onSave: () => void; onDiscard: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  return (
    <Dialog
      id="unsaved"
      title={t('unsaved.title')}
      icon="warning"
      onClose={onCancel}
      footer={(
        <>
          <button type="button" data-command="unsaved-cancel" onClick={onCancel}><Icon name="close" size={14} /> {t('common.cancel')}</button>
          <button type="button" data-command="unsaved-discard" onClick={onDiscard}><Icon name="delete" size={14} /> {t('unsaved.discard')}</button>
          <button type="button" className="primary" data-command="unsaved-save" onClick={onSave}><Icon name="save" size={14} /> {t('unsaved.save')}</button>
        </>
      )}
    >
      <p className="dialog-message">{t('unsaved.message', { name })}</p>
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
          <button type="button" data-command="confirm-no" onClick={onNo}><Icon name="close" size={14} /> {t('common.cancel')}</button>
          <button type="button" className="primary" data-command="confirm-yes" onClick={onYes}><Icon name="check" size={14} /> {yesLabel ?? t('common.ok')}</button>
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
    <Dialog id="message" title={title ?? t('appTitle')} icon="warning" onClose={onClose} footer={<button type="button" className="primary" data-command="message-ok" onClick={onClose}><Icon name="check" size={14} /> {t('common.ok')}</button>}>
      <p className="dialog-message" data-message="">{message}</p>
    </Dialog>
  )
}

export type ExportFormat = 'word' | 'html' | 'markdown' | 'text' | 'pdf'
export const EXPORT_FORMATS: { id: ExportFormat; icon: string; ext: string }[] = [
  { id: 'word', icon: 'word', ext: '.doc' },
  { id: 'html', icon: 'html', ext: '.html' },
  { id: 'markdown', icon: 'markdown', ext: '.md' },
  { id: 'text', icon: 'text', ext: '.txt' },
  { id: 'pdf', icon: 'pdf', ext: '.pdf' },
]

export function ExportDialog({ initial, onExport, onCancel }: { initial: ExportFormat; onExport: (format: ExportFormat) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const [format, setFormat] = useState<ExportFormat>(initial)
  return (
    <Dialog
      id="export"
      title={t('export.title')}
      icon="export"
      width={560}
      onClose={onCancel}
      footer={(
        <>
          <button type="button" data-command="export-cancel" onClick={onCancel}><Icon name="close" size={14} /> {t('common.cancel')}</button>
          <button type="button" className="primary" data-command="export-run" onClick={() => onExport(format)}><Icon name="export" size={14} /> {t('export.run')}</button>
        </>
      )}
    >
      <div className="export-choices" role="radiogroup" aria-label={t('export.format')}>
        {EXPORT_FORMATS.map((item) => (
          <button type="button" role="radio" key={item.id} aria-checked={format === item.id} className={format === item.id ? 'export-choice on' : 'export-choice'} data-export-format={item.id} onClick={() => setFormat(item.id)} onDoubleClick={() => onExport(item.id)}>
            <Icon name={item.icon} size={26} />
            <b>{t(`export.${item.id}`)}</b>
            <small>{item.ext}</small>
            <span>{t(`export.${item.id}Note`)}</span>
          </button>
        ))}
      </div>
    </Dialog>
  )
}

/** Where a picture, video or sound goes as it is put in. */
export function MediaStorageDialog({ saved, onPick, onCancel }: { saved: boolean; onPick: (storage: MediaStorageChoice) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  return (
    <Dialog
      id="media-storage"
      title={t('mediaStorage.title')}
      icon="image"
      width={560}
      onClose={onCancel}
      footer={<button type="button" data-command="media-storage-cancel" onClick={onCancel}><Icon name="close" size={14} /> {t('common.cancel')}</button>}
    >
      <div className="export-choices media-storage-choices">
        <button type="button" className="export-choice" data-media-storage="internal" onClick={() => onPick('internal')}>
          <Icon name="page" size={26} />
          <b>{t('mediaStorage.internal')}</b>
          <span>{t('mediaStorage.internalNote')}</span>
        </button>
        <button type="button" className="export-choice" data-media-storage="external" onClick={() => onPick('external')}>
          <Icon name="open" size={26} />
          <b>{t('mediaStorage.external')}</b>
          <span>{t(saved ? 'mediaStorage.externalNote' : 'mediaStorage.externalUnsaved')}</span>
        </button>
      </div>
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
    ['about.format', '.mtg'],
    ['about.runtime', isDesktop ? `Tauri ${info?.tauri ?? ''}, WebView ${info?.webview ?? ''}, React` : 'Web, React'],
    ['about.platform', info ? `${PLATFORM_NAMES[info.platform] ?? info.platform} (${info.arch})` : 'Web'],
    ['about.developer', 'SHKWON'],
    ['about.email', <a key="mail" href={`mailto:${AUTHOR_MAIL}`} onClick={(event) => { event.preventDefault(); void host.openExternal(`mailto:${AUTHOR_MAIL}`) }}>{AUTHOR_MAIL}</a>],
    ['about.copyright', 'Copyright © 2026 SHKWON'],
  ]
  return (
    <Dialog id="about" title={t('about.title')} icon="about" onClose={onClose} width={520} footer={<button type="button" className="primary" data-command="about-close" onClick={onClose}><Icon name="close" size={14} /> {t('common.close')}</button>}>
      <div className="about-body">
        <img className="about-icon" src="./icon.png" alt="" />
        <div className="about-copy">
          <p className="about-name"><strong>MyMeeting</strong><span>{__APP_VERSION__}</span></p>
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
