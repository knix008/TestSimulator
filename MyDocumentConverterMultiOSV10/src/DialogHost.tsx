import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DialogBody, DialogFrame } from './dialogs'
import { hasFixedSize, keepsWindowOpen, type DialogName, type DialogPayload, type DialogResult } from './dialogMeta'
import { applyTheme } from './themes'
import { buildErrorReport } from './lib/errors'
import './App.css'

/** What the main process tells a popup window to be. */
type DialogMessage = {
  name: string | null
  payload: DialogPayload | null
  openId: number
}

/**
 * A dialog running in its own OS window.
 *
 * Which dialog this is comes from the main process, not from the URL: popup
 * windows are pooled, and a dismissed one is hidden and handed to whichever
 * dialog opens next. Results travel back over IPC; the window sizes itself
 * to its content so a popup never needs a scrollbar of its own.
 */
export default function DialogHost({ name: routeName }: { name: string }) {
  const [message, setMessage] = useState<DialogMessage | null>(null)
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
    const off = window.electronDialogApi?.onPayload((next) => arrive(next as DialogMessage))
    return () => { cancelled = true; off?.() }
  }, [])

  useEffect(() => {
    const next = theme ?? payload?.theme
    if (next) applyTheme(next)
  }, [payload?.theme, theme])

  const close = () => void window.electronDialogApi?.close()

  // The window follows its content: the title bar plus whatever the body
  // needs, so a popup never has empty space under its buttons nor a
  // scrollbar of its own. A fixed-size dialog (Settings) never reports.
  // Shrinking is allowed only just after opening; later the window may
  // grow with its content but a size the user chose is left alone.
  const shellRef = useRef<HTMLDivElement | null>(null)
  const shrinkUntil = useRef(0)
  useLayoutEffect(() => {
    const node = shellRef.current?.firstElementChild as HTMLElement | null
    if (!node || hasFixedSize(name)) return
    shrinkUntil.current = Date.now() + 600
    const report = () => {
      const content = node.querySelector('.dialog-content') as HTMLElement | null
      let height = Math.ceil(node.scrollHeight)
      if (content) {
        const top = content.getBoundingClientRect().top - node.getBoundingClientRect().top
        height = Math.ceil(top + content.scrollHeight)
      }
      if (height < window.innerHeight - 2 && Date.now() > shrinkUntil.current) return
      void window.electronDialogApi?.reportSize?.({ width: 0, height })
    }
    report()
    const observer = new ResizeObserver(report)
    const watch = () => {
      observer.disconnect()
      observer.observe(node)
      const content = node.querySelector('.dialog-content')
      if (content) for (const child of content.children) observer.observe(child)
    }
    watch()
    const mutations = new MutationObserver(() => { watch(); report() })
    mutations.observe(node, { childList: true, subtree: true })
    const settle = window.setTimeout(report, 150)
    const settleLate = window.setTimeout(report, 450)
    return () => {
      observer.disconnect()
      mutations.disconnect()
      window.clearTimeout(settle)
      window.clearTimeout(settleLate)
    }
  }, [payload, name])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
    if (!keepsWindowOpen(result.action)) close()
  }

  // Keyed on the opening: a pooled window keeps its React tree between uses,
  // and without this a form would come back holding what was typed last time.
  // The progress window is the exception — it is re-sent while open.
  const key = name === 'progress' ? 'progress' : message?.openId ?? 0
  return (
    <div className="dialog-window" ref={shellRef}>
      <DialogFrame key={key} name={name as DialogName} language={payload.language} payload={payload} onClose={close}>
        <DialogBody name={name as DialogName} payload={payload} onResult={send} onClose={close} onThemeChange={setTheme} />
      </DialogFrame>
    </div>
  )
}
