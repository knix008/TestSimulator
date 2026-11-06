// Everything that reaches the desktop. In a plain browser (npm run dev:web) settings stay in
// localStorage and files go through the browser's own file input and downloads.
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open, save } from '@tauri-apps/plugin-dialog'

export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const STORE = 'mymind.settings'

function browserSettings(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

/** The GUI tests answer the system's dialogs here, as nothing can click them. */
type TestSeam = { pick?: string; save?: string; printed?: number; open?: string | null; saveDiagram?: string | null }
const seam = () => (window as unknown as { __mymindTest?: TestSeam }).__mymindTest
/** A test's answer to a file dialog, null meaning the dialog was cancelled; undefined when no test answers. */
const answer = (key: 'open' | 'saveDiagram'): Promise<string | null> | undefined => {
  const test = seam()
  return test && key in test ? Promise.resolve(test[key] ?? null) : undefined
}

const desktopOnly = () => Promise.reject(new Error('desktop app only'))

export type AppInfo = {
  version: string
  platform: string
  arch: string
  tauri: string
  webview: string
  executableTime: number | null
}

export type SampleItem = {
  id: string
  file: string
  mode: 'mindmap' | 'fishbone'
  ko: [string, string]
  en: [string, string]
}

export type SamplesList = { dir: string; items: SampleItem[] }

export type PopoutShow = { label: string; width: number; height: number; resizeOnly?: boolean }

/** What can be put on the canvas: the WebView shows the first group, the shell converts the rest. */
export const IMAGE_EXTENSIONS = ['png', 'apng', 'jpg', 'jpeg', 'jpe', 'jfif', 'pjpeg', 'pjp', 'gif', 'webp', 'bmp', 'dib', 'svg', 'avif', 'ico', 'cur', 'tif', 'tiff', 'tga', 'dds', 'hdr', 'exr', 'pnm', 'pbm', 'pgm', 'ppm', 'pam', 'ff', 'qoi', 'psd']

const DIAGRAM_FILTERS = [{ name: 'MyMind Diagram', extensions: ['mmap', 'mymind'] }]

export const host = {
  loadSettings: (): Promise<unknown> => (isDesktop ? invoke('load_settings') : Promise.resolve(browserSettings())),
  saveSettings: (patch: Record<string, unknown>): Promise<void> => {
    if (isDesktop) return invoke('save_settings', { patch })
    try {
      localStorage.setItem(STORE, JSON.stringify({ ...browserSettings(), ...patch }))
    } catch {
      /* blocked storage: the settings last for this session */
    }
    return Promise.resolve()
  },
  ready: (): Promise<void> => (isDesktop ? invoke('window_ready') : Promise.resolve()),

  /** The diagram the app was started with (a double-click in the file manager). */
  startupFile: (): Promise<string | null> => (isDesktop ? invoke('startup_file') : Promise.resolve(null)),
  openDiagramDialog: (defaultPath?: string): Promise<string | null> =>
    answer('open') ?? (isDesktop ? open({ defaultPath, filters: [...DIAGRAM_FILTERS, { name: 'All Files', extensions: ['*'] }] }) : desktopOnly()),
  saveDiagramDialog: (defaultPath: string): Promise<string | null> =>
    answer('saveDiagram') ?? (isDesktop ? save({ defaultPath, filters: DIAGRAM_FILTERS }) : desktopOnly()),
  saveImageDialog: (defaultPath: string, extension: string, name: string): Promise<string | null> =>
    seam()?.save ? Promise.resolve(seam()!.save!) : isDesktop ? save({ defaultPath, filters: [{ name, extensions: [extension] }] }) : desktopOnly(),
  readText: (path: string): Promise<string> => (isDesktop ? invoke('read_text', { path }) : desktopOnly()),
  writeText: (path: string, text: string): Promise<void> => (isDesktop ? invoke('write_text', { path, text }) : desktopOnly()),
  writeBase64: (path: string, data: string): Promise<void> => (isDesktop ? invoke('write_base64', { path, data }) : desktopOnly()),
  samplesList: (): Promise<SamplesList> => (isDesktop ? invoke('samples_list') : Promise.resolve({ dir: '', items: [] })),
  systemFonts: (): Promise<string[]> => (isDesktop ? invoke('system_fonts') : Promise.resolve([])),
  appInfo: (): Promise<AppInfo | null> => (isDesktop ? invoke('app_info') : Promise.resolve(null)),
  pickImage: (): Promise<string | null> => (seam()?.pick ? Promise.resolve(seam()!.pick!) : isDesktop ? open({ filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }] }) : desktopOnly()),
  /** A picture as the page can show it, whatever its format was. */
  readImage: (path: string): Promise<{ mime: string; data: string }> => (isDesktop ? invoke('read_image', { path }) : desktopOnly()),
  /** Files dropped on the window; returns the function that stops listening. */
  onFileDrop: (handler: (paths: string[]) => void): (() => void) => {
    if (!isDesktop) return () => {}
    const pending = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') handler(event.payload.paths)
    })
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
  /** Writes a PNG as another image format, which the page cannot encode by itself. */
  writeConverted: (path: string, data: string, format: string): Promise<void> =>
    isDesktop ? invoke('write_converted', { path, data, format }) : desktopOnly(),
  print: (): Promise<void> => {
    const test = seam()
    if (test) {
      test.printed = (test.printed ?? 0) + 1
      return Promise.resolve()
    }
    if (isDesktop) return invoke('print_window')
    window.print()
    return Promise.resolve()
  },
  openExternal: (url: string): Promise<void> => {
    if (isDesktop) return invoke('open_external', { url })
    window.open(url, '_blank')
    return Promise.resolve()
  },

  /** Subscribes to a backend event; returns the function that unsubscribes. */
  on: <T,>(name: string, handler: (payload: T) => void): (() => void) => {
    if (!isDesktop) return () => {}
    const pending = listen<T>(name, (event) => handler(event.payload))
    return () => void pending.then((off) => off())
  },

  minimize: () => (isDesktop ? getCurrentWindow().minimize() : undefined),
  toggleMaximize: () => (isDesktop ? getCurrentWindow().toggleMaximize() : undefined),
  /** The main window's own close, once the page has dealt with unsaved work. */
  closeMain: (): Promise<void> => (isDesktop ? invoke('main_close') : Promise.resolve()),
  closeGuardReady: (): Promise<void> => (isDesktop ? invoke('close_guard_ready') : Promise.resolve()),
  startDrag: () => (isDesktop ? getCurrentWindow().startDragging() : undefined),
  startResize: () => (isDesktop ? getCurrentWindow().startResizeDragging('SouthEast') : undefined),
  setMinimumSize: (width: number, height: number): Promise<void> =>
    isDesktop ? invoke('window_min_size', { width, height }) : Promise.resolve(),

  popoutInline: (): Promise<boolean> => (isDesktop ? invoke('popout_inline') : Promise.resolve(true)),
  popoutReset: (): Promise<void> => (isDesktop ? invoke('popout_reset') : Promise.resolve()),
  popoutShow: (options: PopoutShow): Promise<boolean> => invoke('popout_show', { options }),
  popoutDrag: (label: string): Promise<boolean> => invoke('popout_drag', { label }),
  // The marker in a window's corner was pressed: the corner follows the mouse.
  popoutResize: (label: string): Promise<void> => invoke('plugin:window|start_resize_dragging', { label, value: 'SouthEast' }),
  popoutMinimize: (label: string): Promise<boolean> => invoke('popout_minimize', { label }),
  popoutFocus: (label: string): Promise<boolean> => invoke('popout_focus', { label }),
  popoutClose: (label: string): Promise<boolean> => invoke('popout_close', { label }),
}
