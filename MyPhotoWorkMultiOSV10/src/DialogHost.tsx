import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DialogBody, DialogFrame, type DialogName, type DialogPayload, type DialogResult } from './dialogs'
import { keepsWindowOpen } from './dialogMeta'
import { applyTheme } from './themes'
import { buildErrorReport } from './lib/errors'
import './App.css'

/** What the main process tells a popup window to be. */
type DialogMessage = {
  name: string | null
  payload: DialogPayload | null
  /** Counts openings, so reopening a dialog starts its form over. */
  openId: number
}

/**
 * A dialog running in its own OS window.
 *
 * The window is opened by the main window through `electronDialogApi.open`,
 * which guarantees one window per dialog name and raises an existing one rather
 * than making a second. Results travel back over IPC; closing is always allowed
 * from the frame's own X button.
 *
 * Which dialog this is comes from the main process, not from the URL. Popup
 * windows are pooled — a dismissed one is hidden and handed to whichever dialog
 * opens next — so the same renderer has to be able to become any of them.
 */
export default function DialogHost({ name: routeName }: { name: string }) {
  const [message, setMessage] = useState<DialogMessage | null>(null)
  // The settings window drives the theme live; a new message drops that, so the
  // next dialog to use this window is not left wearing the previous one's.
  const [theme, setTheme] = useState<string | undefined>(undefined)
  const name = message?.name ?? routeName
  const payload = message?.payload ?? null

  useEffect(() => {
    let cancelled = false
    const arrive = (value: DialogMessage | null) => {
      setMessage(value)
      setTheme(undefined)
    }
    void window.electronDialogApi?.payload().then((value) => {
      if (!cancelled && value) arrive(value as DialogMessage)
    })
    // A reopened window is handed a fresh message instead of being recreated.
    const off = window.electronDialogApi?.onPayload((next) => arrive(next as DialogMessage))
    return () => { cancelled = true; off?.() }
  }, [])

  useEffect(() => {
    const next = theme ?? payload?.theme
    if (next) applyTheme(next)
  }, [payload?.theme, theme])

  const close = () => void window.electronDialogApi?.close()

  /**
   * Fits the window to the dialog. The fixed sizes could not track the content,
   * so some popups clipped their buttons and others left a band of dead space
   * beneath them.
   */
  const shellRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const node = shellRef.current?.firstElementChild as HTMLElement | null
    if (!node) return
    const report = () => {
      // The content scrolls inside the dialog, so the dialog's own height only
      // ever reports the window it is already in. What it *wants* is the fixed
      // chrome — title bar, padding, gaps — plus the content's full height.
      const content = node.querySelector('.dialog-content') as HTMLElement | null
      if (!content) {
        void window.electronDialogApi?.reportSize?.({ width: 0, height: Math.ceil(node.scrollHeight) })
        return
      }
      const chrome = Math.max(0, node.getBoundingClientRect().height - content.getBoundingClientRect().height)
      // Only the height is reported; the width is a design decision per dialog.
      void window.electronDialogApi?.reportSize?.({ width: 0, height: Math.ceil(chrome + content.scrollHeight) })
    }
    report()
    const observer = new ResizeObserver(report)
    // The dialog box is capped at the window, so when a page grows past it
    // (Layer Style's Bevel after Drop Shadow, a Settings tab) the box does not
    // change size and the observer on it alone stays silent. Watching the
    // content's children catches that growth, and re-watching after each DOM
    // change catches the children a new page brings.
    const watch = () => {
      observer.disconnect()
      observer.observe(node)
      const content = node.querySelector('.dialog-content')
      if (content) for (const child of content.children) observer.observe(child)
    }
    watch()
    const mutations = new MutationObserver(() => { watch(); report() })
    mutations.observe(node, { childList: true, subtree: true })
    // Fonts and the icon SVGs land after the first paint and change the height.
    const settle = window.setTimeout(report, 120)
    return () => {
      observer.disconnect()
      mutations.disconnect()
      window.clearTimeout(settle)
    }
  }, [payload])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // This popup is its own renderer: a failure here would vanish with the window
  // unless it is handed to the main window to display.
  useEffect(() => {
    const send = (error: unknown) => {
      const report = buildErrorReport(error, { action: name, source: `dialog:${name}` })
      void window.electronDialogApi?.reportError({ source: report.title, message: report.message, details: report.details })
    }
    const onError = (event: ErrorEvent) => send(event.error ?? event.message)
    const onRejection = (event: PromiseRejectionEvent) => send(event.reason)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [name])

  if (!payload || !name) {
    return <div className="dialog-window" ref={shellRef} />
  }

  const send = (result: DialogResult) => {
    void window.electronDialogApi?.send(name, result)
    // Live edits (settings, previews, the filter gallery) keep the window open.
    if (!keepsWindowOpen(result.action)) {
      close()
    }
  }

  return (
    <div className="dialog-window" ref={shellRef}>
      {/* Keyed on the opening, not just the dialog: a pooled window keeps its
          React tree between uses, and without this a form would come back
          holding whatever was typed into it the last time round. */}
      <DialogFrame key={message?.openId ?? 0} name={name as DialogName} language={payload.language} payload={payload} onClose={close}>
        <DialogBody name={name as DialogName} payload={payload} onResult={send} onClose={close} onThemeChange={setTheme} />
      </DialogFrame>
    </div>
  )
}
