import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { dialogSpec } from '../dialogSpecs'

/**
 * The desktop shell as the page sees it.
 *
 * The editor talks to `window.hostFileApi`, `hostDialogApi` and the others and never
 * to Tauri, so the same code runs in a browser, where those are simply absent. This
 * module fills them in when the page is inside the Tauri shell; `main.tsx` imports it
 * before anything that reads them.
 */

/** Tauri's listen is asynchronous; the editor's unsubscribe functions are not. */
function subscribe<T>(event: string, callback: (payload: T) => void): () => void {
  let stop: (() => void) | null = null
  let stopped = false
  void listen<T>(event, (message) => callback(message.payload), { target: { kind: 'WebviewWindow', label: getCurrentWindow().label } }).then((off) => {
    if (stopped) off()
    else stop = off
  })
  return () => {
    stopped = true
    stop?.()
  }
}

/** Models broadcast to every window rather than to one. */
function subscribeAll<T>(event: string, callback: (payload: T) => void): () => void {
  let stop: (() => void) | null = null
  let stopped = false
  void listen<T>(event, (message) => callback(message.payload)).then((off) => {
    if (stopped) off()
    else stop = off
  })
  return () => {
    stopped = true
    stop?.()
  }
}

/** Parts of a window that move it. Controls inside them stay controls. */
export const DRAG_REGIONS = '.title-bar, .menu-bar, .tool-bar, .dialog-title-bar'
const NOT_DRAG = 'button, a, input, select, textarea, label, [role="button"], .menu-group'

function installWindowDragging() {
  document.addEventListener('mousedown', (event) => {
    const target = event.target as HTMLElement | null
    if (event.button !== 0 || !target?.closest) return
    if (target.closest('.resize-grip')) {
      event.preventDefault()
      void getCurrentWindow().startResizeDragging('SouthEast')
      return
    }
    if (!target.closest(DRAG_REGIONS) || target.closest(NOT_DRAG)) return
    event.preventDefault()
    const window = getCurrentWindow()
    if (event.detail === 2 && window.label === 'main') void window.toggleMaximize()
    else void window.startDragging()
  })
}

/** In a browser F5 is harmless; here it would throw the open document away. */
function installReloadGuard() {
  if (import.meta.env.DEV) return
  window.addEventListener('keydown', (event) => {
    if (event.key === 'F5') event.preventDefault()
  })
}

export function isTauriShell() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function installTauriBridge() {
  if (!isTauriShell()) return

  window.hostFileApi = {
    openFiles: (options) => invoke('files_open', { defaultPath: options?.defaultPath ?? null }),
    readFile: ({ filePath }) => invoke('files_read', { filePath }),
    saveFile: (options) => invoke('files_save', { options }),
    writeFile: ({ filePath, text, dataUrl }) => invoke('files_write', { filePath, text: text ?? null, dataUrl: dataUrl ?? null }),
  }

  window.hostModelApi = {
    list: () => invoke('models_list'),
    read: (id) => invoke<ArrayBuffer>('models_read', { id }),
    download: (id, url, bytes) => invoke('models_download', { id, url, bytes: Math.max(0, Math.round(bytes) || 0) }),
    cancel: (id) => invoke('models_cancel', { id }),
    remove: (id) => invoke('models_remove', { id }),
    onProgress: (callback) => subscribeAll('models:progress', callback),
  }

  // Silent printing is a WebView2 feature. Without this bridge the app prints through
  // the webview's own print dialog, as it does in a browser.
  if (window.__MPW_HOST__?.platform === 'windows') {
    window.hostPrintApi = {
      printers: async () => {
        const info = await invoke<{ printers: { name: string; isDefault: boolean }[] }>('print_info')
        return info.printers.map((printer) => ({ name: printer.name, displayName: printer.name, isDefault: printer.isDefault }))
      },
      print: async ({ html, deviceName, landscape, copies }) => {
        // The sheet is A4; the page's own CSS keeps the margin.
        const sheet = landscape ? { widthMm: 297, heightMm: 210 } : { widthMm: 210, heightMm: 297 }
        try {
          await invoke('print_html', { job: { html, ...sheet, printer: deviceName ?? null, copies: copies ?? 1 } })
          return { ok: true }
        } catch (cause) {
          const message = String(cause)
          if (message !== 'file-printer') return { ok: false, message }
        }
        // That "printer" only writes a file, and its driver's own save dialog would
        // appear from nowhere: a PDF goes through the app's save dialog instead.
        const { save } = await import('@tauri-apps/plugin-dialog')
        const output = await save({ defaultPath: 'print.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] })
        if (!output) return { ok: true }
        try {
          await invoke('print_pdf', { job: { html, ...sheet, output } })
          return { ok: true }
        } catch (cause) {
          return { ok: false, message: String(cause) }
        }
      },
    }
  }

  const current = getCurrentWindow()
  window.hostWindowApi = {
    minimize: () => current.minimize(),
    toggleMaximize: () => current.toggleMaximize(),
    close: () => current.close(),
    forceClose: () => invoke('window_force_close'),
    ready: () => invoke('window_ready'),
    onCloseRequest: (callback) => subscribe('window:close-request', callback),
  }

  window.hostGuideApi = {
    open: (language) => invoke('open_guide', { language }),
  }

  window.hostAppApi = {
    versions: () => {
      const info = window.__MPW_HOST__
      return { tauri: info?.tauri ?? '', webview: info?.webview ?? '', platform: info?.platform ?? '', arch: info?.arch ?? '' }
    },
  }

  window.hostMenuApi = {
    open: (payload, anchor) => invoke('menu_open', { payload, anchor }),
    close: () => invoke('menu_close'),
    payload: () => invoke('menu_payload'),
    reportSize: ({ width, height }) => invoke('menu_size', { width, height }),
    choose: (commandId) => invoke('menu_choose', { commandId }),
    onPayload: (callback) => subscribe('menu:payload', callback),
    onChosen: (callback) => subscribe('menu:chosen', callback),
  }

  window.hostDialogApi = {
    open: (name, payload) => invoke('dialog_open', { name, payload, spec: dialogSpec(name) }),
    close: (name) => invoke('dialog_close', { name: name ?? null }),
    closeAll: () => invoke('dialog_close_all'),
    payload: () => invoke('dialog_payload'),
    send: (name, result) => invoke('dialog_result', { name, result }),
    onPayload: (callback) => subscribe('dialog:payload', callback),
    onResult: (callback) => subscribe('dialog:result', callback),
    onClosed: (callback) => subscribe('dialog:closed', callback),
    reportSize: ({ width, height }) => invoke('dialog_size', { width, height }),
    reportError: (report) => invoke('dialog_error', { report }),
    onError: (callback) => subscribe('dialog:error', callback),
  }

  installWindowDragging()
  // WebView2's own menu (Refresh, Save as, Print) has no place in a desktop app. Text
  // fields keep theirs, for copy and paste.
  document.addEventListener('contextmenu', (event) => {
    if (!(event.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable]')) event.preventDefault()
  })
  installReloadGuard()
}
