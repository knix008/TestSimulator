import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DialogBody, DialogFrame, type DialogName, type DialogPayload, type DialogResult } from './dialogs'
import { applyTheme } from './themes'
import { buildErrorReport } from './lib/errors'
import './App.css'

/**
 * A dialog running in its own OS window.
 *
 * The window is opened by the main window through `electronDialogApi.open`,
 * which guarantees one window per dialog name and raises an existing one rather
 * than making a second. Results travel back over IPC; closing is always allowed
 * from the frame's own X button.
 */
export default function DialogHost({ name }: { name: string }) {
  const [payload, setPayload] = useState<DialogPayload | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.electronDialogApi?.payload().then((value) => {
      if (!cancelled && value) setPayload(value.payload as DialogPayload)
    })
    // A reopened window is handed a fresh payload instead of being recreated.
    const off = window.electronDialogApi?.onPayload((next) => setPayload(next as DialogPayload))
    return () => { cancelled = true; off?.() }
  }, [])

  const [theme, setTheme] = useState<string | undefined>(undefined)

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
    observer.observe(node)
    // Fonts and the icon SVGs land after the first paint and change the height.
    const settle = window.setTimeout(report, 120)
    return () => {
      observer.disconnect()
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

  if (!payload) {
    return <div className="dialog-window" ref={shellRef} />
  }

  const send = (result: DialogResult) => {
    void window.electronDialogApi?.send(name, result)
    // Live edits (settings, and the filter gallery) keep the window open.
    if (result.action !== 'settings' && result.action !== 'filter') {
      close()
    }
  }

  return (
    <div className="dialog-window" ref={shellRef}>
      <DialogFrame name={name as DialogName} language={payload.language} payload={payload} onClose={close}>
        <DialogBody name={name as DialogName} payload={payload} onResult={send} onClose={close} onThemeChange={setTheme} />
      </DialogFrame>
    </div>
  )
}
