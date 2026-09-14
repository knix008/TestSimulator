import { useEffect, useEffectEvent, useRef } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { text } from '../labels'
import { PopupDialog } from './dialogs'
import {
  mainWindowLabel,
  popupActionEvent,
  popupClosedEvent,
  popupReadyEvent,
  popupStateEvent,
  popupWindowLabel,
  popupWindowUrl,
  popupWindowWidth,
  type PopupAction,
  type PopupActionPayload,
  type PopupChrome,
  type PopupClosedPayload,
  type PopupData,
  type PopupKind,
  type PopupReadyPayload,
  type PopupState,
} from './protocol'

const isDesktop = isTauri()

// Initial logical position centred over the main window, so the popup never
// flashes at the screen origin before it measures and re-centres itself.
const initialPopupPosition = async (width: number, height: number) => {
  try {
    const main = getCurrentWindow()
    const [position, size, scale] = await Promise.all([main.outerPosition(), main.outerSize(), main.scaleFactor()])
    return {
      x: Math.round((position.x + (size.width - width * scale) / 2) / scale),
      y: Math.round((position.y + (size.height - height * scale) / 2) / scale),
    }
  } catch (error) {
    console.warn('[popup] failed to read main window position', error)
    return null
  }
}

type PopupHostProps<K extends PopupKind> = {
  kind: K
  open: boolean
  chrome: PopupChrome
  data: PopupData[K] | null
  onAction: (action: PopupAction[K]) => void
  /** The OS window went away (close button, Escape, Alt+F4, main window closing). */
  onClosed: () => void
}

/**
 * Owns one popup OS window for the main window: creates it when `open` flips
 * on, streams state snapshots into it, relays its actions back, and closes it
 * when `open` flips off. Outside Tauri (plain browser) the same dialog is
 * rendered inline over the app instead.
 */
export function PopupHost<K extends PopupKind>({ kind, open, chrome, data, onAction, onClosed }: PopupHostProps<K>) {
  const label = popupWindowLabel(kind)
  const state: PopupState<K> | null = data ? { kind, language: chrome.language, theme: chrome.theme, data } : null
  const stateRef = useRef(state)
  stateRef.current = state
  const stateJson = state ? JSON.stringify(state) : ''

  const handleAction = useEffectEvent((action: PopupAction[K]) => onAction(action))
  const handleClosed = useEffectEvent(() => onClosed())
  const pushState = useEffectEvent(() => {
    if (stateRef.current) {
      void emitTo(label, popupStateEvent, stateRef.current)
    }
  })

  // Relay channel with the popup window (ready / action / closed).
  useEffect(() => {
    if (!isDesktop) {
      return
    }

    let cancelled = false
    const disposers: Array<() => void> = []
    const keep = (dispose: () => void) => {
      if (cancelled) {
        dispose()
      } else {
        disposers.push(dispose)
      }
    }

    void listen<PopupReadyPayload>(popupReadyEvent, (event) => {
      if (event.payload.kind === kind) {
        pushState()
      }
    }).then(keep)

    void listen<PopupActionPayload<K>>(popupActionEvent, (event) => {
      if (event.payload.kind === kind) {
        handleAction(event.payload.action)
      }
    }).then(keep)

    void listen<PopupClosedPayload>(popupClosedEvent, (event) => {
      if (event.payload.label === label) {
        handleClosed()
      }
    }).then(keep)

    return () => {
      cancelled = true
      disposers.forEach((dispose) => dispose())
    }
  }, [kind, label])

  // Window lifecycle follows `open`.
  useEffect(() => {
    if (!isDesktop) {
      return
    }

    let cancelled = false

    const openWindow = async () => {
      const existing = await WebviewWindow.getByLabel(label)
      if (cancelled) {
        return
      }

      if (existing) {
        // Strict-mode re-run or a re-open while the old window is still up.
        pushState()
        void existing.setFocus().catch(() => {})
        return
      }

      const width = popupWindowWidth[kind]
      const height = 240
      const position = await initialPopupPosition(width, height)
      if (cancelled) {
        return
      }

      const win = new WebviewWindow(label, {
        url: popupWindowUrl(kind),
        title: text[chrome.language].appName,
        width,
        height,
        ...(position ?? { center: true }),
        decorations: false,
        resizable: false,
        // Stays hidden until the popup has measured and sized itself.
        visible: false,
        skipTaskbar: true,
        // Owned by the main window: always above it, minimised/restored with it.
        parent: mainWindowLabel,
        focus: true,
      })

      void win.once('tauri://error', (event) => {
        console.warn('[popup] failed to create window', kind, event.payload)
      })
    }

    if (open) {
      void openWindow()
    } else {
      void WebviewWindow.getByLabel(label).then((win) => win?.close().catch(() => {}))
    }

    return () => {
      cancelled = true
    }
    // The title language is only read at creation time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, label])

  // Every state change is mirrored into the open window.
  useEffect(() => {
    if (isDesktop && open) {
      pushState()
    }
  }, [stateJson, open])

  if (!open || !state) {
    return null
  }

  if (isDesktop) {
    // Dim and block the main window while the dialog is up, like the old in-app modal.
    return (
      <div
        className="modal-backdrop popup-shield"
        role="presentation"
        onClick={() => {
          void WebviewWindow.getByLabel(label).then((win) => {
            if (win) {
              void win.setFocus().catch(() => {})
            } else {
              // The window is already gone (e.g. closed before the event arrived).
              onClosed()
            }
          })
        }}
      />
    )
  }

  const closable = kind !== 'folderProgress'
  const send = (action: PopupAction[K]) => onAction(action)

  return (
    <div
      className={`modal-backdrop${kind === 'alert' ? ' alert-backdrop' : kind === 'error' ? ' error-backdrop' : ''}`}
      role="presentation"
      onClick={() => {
        if (closable) {
          send({ type: 'close' } as PopupAction[K])
        }
      }}
    >
      <PopupDialog kind={kind} labels={text[chrome.language]} data={state.data} send={send as (action: PopupAction[PopupKind]) => void} />
    </div>
  )
}
