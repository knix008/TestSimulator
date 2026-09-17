import { useEffect, useState } from 'react'
import { DialogBody, DialogFrame, type DialogName, type DialogPayload, type DialogResult } from './dialogs'
import { applyTheme } from './themes'
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!payload) {
    return <div className="dialog-window" />
  }

  const send = (result: DialogResult) => {
    void window.electronDialogApi?.send(name, result)
    // Live edits (settings, and the filter gallery) keep the window open.
    if (result.action !== 'settings' && result.action !== 'filter') {
      close()
    }
  }

  return (
    <div className="dialog-window">
      <DialogFrame name={name as DialogName} language={payload.language} payload={payload} onClose={close}>
        <DialogBody name={name as DialogName} payload={payload} onResult={send} onClose={close} onThemeChange={setTheme} />
      </DialogFrame>
    </div>
  )
}
