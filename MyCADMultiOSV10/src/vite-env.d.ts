/// <reference types="vite/client" />

declare global {
  const __APP_VERSION__: string
  const __APP_NAME__: string
  const __BUILD_DATE__: string
  const __AUTHOR__: string
}

interface MycadApi {
  isElectron: boolean
  platform: string
  getVersion: () => Promise<string>
  listFonts: () => Promise<string[]>
  loadSettings: () => Promise<unknown>
  saveSettings: (settings: unknown) => Promise<void>
  readPath?: (filePath: string) => Promise<{ ok: boolean; content?: string; error?: string; filePath?: string }>
  supportedExtensions?: () => Promise<string[]>
  setMinSize?: (width: number, height: number) => Promise<boolean>
  openFile: (opts: { title: string; filters: { name: string; extensions: string[] }[]; defaultPath?: string }) => Promise<{ canceled: boolean; filePath?: string; content?: string; directory?: string }>
  saveFile: (opts: { title: string; filters: { name: string; extensions: string[] }[]; defaultPath?: string; content: string }) => Promise<{ canceled: boolean; filePath?: string; directory?: string }>
  showMenu: (payload: { x: number; y: number; items: { id: string; label: string; icon: string; enabled: boolean }[] }) => Promise<string | null>
  openPopup: (payload: { kind: string; width: number; height: number; title: string }) => Promise<void>
  print: () => Promise<void>
  download: (url: string) => Promise<{ ok: boolean; text?: string; error?: string }>
  onDownloadProgress: (cb: (progress: { percent: number; message: string }) => void) => () => void
  openExternal: (url: string) => Promise<void>
  onRequestClose: (cb: () => void) => () => void
  confirmClose: (allow: boolean) => void
  resizeBy: (dx: number, dy: number) => void
  pathForFile: (file: File) => string
  onOpenPath: (cb: (filePath: string) => void) => () => void
}

declare global {
  interface Window {
    mycad?: MycadApi
    __mycadRequestClose?: () => void
  }
}

export {}
