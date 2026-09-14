import type { PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { emitTo, listen } from '@tauri-apps/api/event'
import { currentMonitor, getCurrentWindow, LogicalSize, PhysicalPosition } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { text } from '../labels'
import { themeVarKeys } from '../themeFile'
import { PopupDialog } from './dialogs'
import {
  mainWindowLabel,
  popupActionEvent,
  popupReadyEvent,
  popupStateEvent,
  popupWindowWidth,
  type PopupAction,
  type PopupActionPayload,
  type PopupKind,
  type PopupReadyPayload,
  type PopupState,
} from './protocol'
import '../App.css'

// Popups never scroll, so the window grows with its content; only the monitor's
// work area (minus a small margin) bounds it.
const maxPopupHeight = async () => {
  try {
    const monitor = await currentMonitor()
    if (monitor) {
      return Math.max(200, Math.floor(monitor.workArea.size.height / monitor.scaleFactor) - 24)
    }
  } catch (error) {
    console.warn('[popup] failed to read monitor size', error)
  }

  return 1200
}

// Centre the popup over the main window (clamped to the monitor) before it is shown.
const placeOverMain = async (width: number, height: number) => {
  const win = getCurrentWindow()

  try {
    const main = await WebviewWindow.getByLabel(mainWindowLabel)
    const monitor = await currentMonitor()
    const scale = monitor?.scaleFactor ?? (await win.scaleFactor())
    const physicalWidth = Math.round(width * scale)
    const physicalHeight = Math.round(height * scale)

    let x: number
    let y: number

    if (main && (await main.isVisible())) {
      const position = await main.outerPosition()
      const size = await main.outerSize()
      x = position.x + Math.round((size.width - physicalWidth) / 2)
      y = position.y + Math.round((size.height - physicalHeight) / 2)
    } else if (monitor) {
      x = monitor.position.x + Math.round((monitor.size.width - physicalWidth) / 2)
      y = monitor.position.y + Math.round((monitor.size.height - physicalHeight) / 2)
    } else {
      return
    }

    if (monitor) {
      const area = monitor.workArea
      const minX = area.position.x
      const minY = area.position.y
      const maxX = area.position.x + area.size.width - physicalWidth
      const maxY = area.position.y + area.size.height - physicalHeight
      x = Math.max(minX, Math.min(x, maxX))
      y = Math.max(minY, Math.min(y, maxY))
    }

    await win.setPosition(new PhysicalPosition(x, y))
  } catch (error) {
    console.warn('[popup] failed to position window', error)
  }
}

const resizeToContent = async (width: number, height: number) => {
  const win = getCurrentWindow()

  try {
    // Popups are created non-resizable; relax that only for the programmatic resize.
    await win.setResizable(true)
    await win.setSize(new LogicalSize(width, height))
    await win.setResizable(false)
  } catch (error) {
    console.warn('[popup] failed to resize window', error)
  }
}

export default function PopupApp({ kind }: { kind: PopupKind }) {
  const [state, setState] = useState<PopupState | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const shownRef = useRef(false)
  const lastSizeRef = useRef({ width: 0, height: 0 })

  // Handshake: subscribe to state first, then announce readiness so the main
  // window's reply cannot slip in before the listener exists.
  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined

    void listen<PopupState>(popupStateEvent, (event) => {
      if (event.payload.kind === kind) {
        setState(event.payload)
      }
    }).then((dispose) => {
      if (cancelled) {
        dispose()
        return
      }

      unlisten = dispose
      const payload: PopupReadyPayload = { kind }
      void emitTo(mainWindowLabel, popupReadyEvent, payload)
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [kind])

  // Mirror the main window's theme so the dialog looks like it always did.
  useEffect(() => {
    if (!state) {
      return
    }

    const root = document.documentElement
    root.dataset.theme = state.theme.builtIn ? state.theme.id : 'custom'
    root.dataset.popup = kind
    document.documentElement.lang = state.language

    for (const key of themeVarKeys) {
      root.style.removeProperty(key)
    }

    if (state.theme.vars) {
      Object.entries(state.theme.vars).forEach(([key, value]) => root.style.setProperty(key, value))
    }
  }, [state, kind])

  // Size the OS window to the rendered dialog, then reveal it.
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!state || !content) {
      return
    }

    let disposed = false

    const fit = async () => {
      const width = popupWindowWidth[kind]
      const height = Math.min(await maxPopupHeight(), Math.ceil(content.getBoundingClientRect().height))

      if (!height || disposed) {
        return
      }

      const last = lastSizeRef.current
      if (last.width !== width || last.height !== height) {
        lastSizeRef.current = { width, height }
        await resizeToContent(width, height)

        if (!shownRef.current) {
          await placeOverMain(width, height)
        }
      }

      if (!shownRef.current && !disposed) {
        shownRef.current = true
        const win = getCurrentWindow()
        try {
          await win.show()
          // Re-apply after showing: a position set on a still-hidden window
          // can be dropped by the OS.
          await placeOverMain(width, height)
          await win.setFocus()
        } catch (error) {
          console.warn('[popup] failed to show window', error)
        }
      }
    }

    void fit()
    const observer = new ResizeObserver(() => void fit())
    observer.observe(content)

    return () => {
      disposed = true
      observer.disconnect()
    }
  }, [state, kind])

  const send = (action: PopupAction[PopupKind]) => {
    const payload: PopupActionPayload = { kind, action }
    void emitTo(mainWindowLabel, popupActionEvent, payload)
  }

  useEffect(() => {
    if (kind === 'folderProgress') {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        send({ type: 'close' })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  const onDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return
    }

    const target = event.target as HTMLElement
    if (target.closest('button, input, select, textarea, a, label')) {
      return
    }

    event.preventDefault()
    void getCurrentWindow().startDragging()
  }

  if (!state) {
    return <div className="popup-root" />
  }

  return (
    <div className="popup-root">
      <div className="popup-content" ref={contentRef}>
        <PopupDialog kind={kind} labels={text[state.language]} data={state.data} send={send} onDragStart={onDragStart} />
      </div>
    </div>
  )
}
