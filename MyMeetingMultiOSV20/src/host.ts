// Everything that reaches the desktop. In a plain browser (npm run dev:web) settings and the draft
// stay in localStorage, files are opened through a file input and saved as downloads.
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open, save } from '@tauri-apps/plugin-dialog'

export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const SETTINGS = 'mymeeting.settings'
const DRAFT = 'mymeeting.draft'

function stored(key: string): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}
function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* blocked or full storage: it lasts for this session */
  }
}

export type AppInfo = { version: string; platform: string; arch: string; tauri: string; webview: string }
export type FileFilter = { name: string; extensions: string[] }
/** A file chosen in the browser: its name and text, as there is no path. */
export type PickedFile = { path: string; name: string; text: string }
export type PopoutShow = { label: string; width: number; height: number; resizeOnly?: boolean }

export const MINUTES_FILTERS: FileFilter[] = [{ name: 'MyMeeting', extensions: ['mtg'] }]

/** The browser's file input, as a promise. */
function browserPick(accept: string): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      void file.text().then((text) => resolve({ path: file.name, name: file.name, text }))
    }
    input.click()
  })
}

function download(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export const host = {
  loadSettings: (): Promise<unknown> => (isDesktop ? invoke('load_settings') : Promise.resolve(stored(SETTINGS))),
  saveSettings: (patch: Record<string, unknown>): Promise<void> => {
    if (isDesktop) return invoke('save_settings', { patch })
    store(SETTINGS, { ...stored(SETTINGS), ...patch })
    return Promise.resolve()
  },
  loadDraft: (): Promise<unknown> => (isDesktop ? invoke('load_draft') : Promise.resolve(stored(DRAFT))),
  saveDraft: (draft: unknown): Promise<void> => {
    if (isDesktop) return invoke('save_draft', { draft })
    store(DRAFT, draft)
    return Promise.resolve()
  },
  ready: (): Promise<void> => (isDesktop ? invoke('window_ready') : Promise.resolve()),
  startupFile: (): Promise<string | null> => (isDesktop ? invoke('startup_file') : Promise.resolve(null)),

  /** Picks and reads a minutes file. */
  openMinutes: async (defaultPath?: string): Promise<PickedFile | null> => {
    if (!isDesktop) return browserPick('.mtg,application/json')
    const path = await open({ defaultPath, filters: [...MINUTES_FILTERS, { name: 'All Files', extensions: ['*'] }] })
    if (typeof path !== 'string') return null
    return { path, name: path.split(/[\\/]/).pop() ?? path, text: await host.readText(path) }
  },
  readText: (path: string): Promise<string> => (isDesktop ? invoke('read_text', { path }) : Promise.reject(new Error('desktop app only'))),
  writeText: (path: string, text: string): Promise<void> => (isDesktop ? invoke('write_text', { path, text }) : Promise.reject(new Error('desktop app only'))),
  /** Asks where to save, then writes. The browser downloads instead; null means cancelled. */
  saveAs: async (defaultName: string, text: string, filters: FileFilter[], mime = 'text/plain;charset=utf-8'): Promise<string | null> => {
    if (!isDesktop) {
      download(defaultName, text, mime)
      return defaultName
    }
    const path = await save({ defaultPath: defaultName, filters })
    if (!path) return null
    await host.writeText(path, text)
    return path
  },
  /** A picture the WebView cannot draw (its bytes as base64) as a PNG data URL. */
  convertImage: (data: string): Promise<string> => (isDesktop ? invoke('convert_image', { data }) : Promise.reject(new Error('desktop app only'))),
  systemFonts: (): Promise<string[]> => (isDesktop ? invoke('system_fonts') : Promise.resolve([])),
  appInfo: (): Promise<AppInfo | null> => (isDesktop ? invoke('app_info') : Promise.resolve(null)),
  print: (): Promise<void> => {
    if (isDesktop) return invoke('print_window')
    window.print()
    return Promise.resolve()
  },
  openExternal: (url: string): Promise<void> => {
    if (isDesktop) return invoke('open_external', { url })
    window.open(url, '_blank')
    return Promise.resolve()
  },
  on: <T,>(name: string, handler: (payload: T) => void): (() => void) => {
    if (!isDesktop) return () => {}
    const pending = listen<T>(name, (event) => handler(event.payload))
    return () => void pending.then((off) => off())
  },
  toggleFullscreen: async (): Promise<boolean> => {
    if (isDesktop) {
      const win = getCurrentWindow()
      const next = !(await win.isFullscreen())
      await win.setFullscreen(next)
      return next
    }
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
    return !!document.fullscreenElement
  },
  minimize: () => (isDesktop ? getCurrentWindow().minimize() : undefined),
  toggleMaximize: () => (isDesktop ? getCurrentWindow().toggleMaximize() : undefined),
  startDrag: () => (isDesktop ? getCurrentWindow().startDragging() : undefined),
  startResize: () => (isDesktop ? getCurrentWindow().startResizeDragging('SouthEast') : undefined),
  closeMain: (): Promise<void> => (isDesktop ? invoke('main_close') : Promise.resolve()),
  closeGuardReady: (): Promise<void> => (isDesktop ? invoke('close_guard_ready') : Promise.resolve()),

  popoutInline: (): Promise<boolean> => (isDesktop ? invoke('popout_inline') : Promise.resolve(true)),
  popoutReset: (): Promise<void> => (isDesktop ? invoke('popout_reset') : Promise.resolve()),
  popoutShow: (options: PopoutShow): Promise<boolean> => invoke('popout_show', { options }),
  popoutDrag: (label: string): Promise<boolean> => invoke('popout_drag', { label }),
  popoutResize: (label: string): Promise<void> => invoke('plugin:window|start_resize_dragging', { label, value: 'SouthEast' }),
  popoutMinimize: (label: string): Promise<boolean> => invoke('popout_minimize', { label }),
  popoutFocus: (label: string): Promise<boolean> => invoke('popout_focus', { label }),
  popoutClose: (label: string): Promise<boolean> => invoke('popout_close', { label }),
}
