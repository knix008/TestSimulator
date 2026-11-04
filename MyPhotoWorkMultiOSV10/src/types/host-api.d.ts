type HostOpenFile = {
  path: string
  name: string
  mime: string
  text?: string
  dataUrl?: string
}

type HostOpenResult = {
  canceled: boolean
  directory?: string
  files: HostOpenFile[]
}

type HostSaveResult = {
  canceled: boolean
  filePath?: string
  directory?: string
}

type HostSaveFilter = {
  name: string
  extensions: string[]
}

interface Window {
  hostFileApi?: {
    openFiles(options?: { defaultPath?: string }): Promise<HostOpenResult>
    readFile(options: { filePath: string }): Promise<HostOpenResult & { message?: string }>
    saveFile(options: { defaultDirectory?: string; fileName: string; filters?: HostSaveFilter[]; text?: string; dataUrl?: string }): Promise<HostSaveResult>
    writeFile(options: { filePath: string; text?: string; dataUrl?: string }): Promise<HostSaveResult>
  }
  /** The neural network weights on this machine. */
  hostModelApi?: {
    list(): Promise<string[]>
    read(id: string): Promise<ArrayBuffer>
    download(id: string, url: string, bytes: number): Promise<{ ok: boolean; message?: string }>
    cancel(id: string): Promise<void>
    remove(id: string): Promise<void>
    onProgress(listener: (progress: { id: string; received: number; total: number; done: boolean; error?: string }) => void): () => void
  }
  /** One print window, so the job goes straight to the printer from there. */
  hostPrintApi?: {
    printers(): Promise<{ name: string; displayName: string; isDefault: boolean }[]>
    print(options: { html: string; deviceName?: string; landscape?: boolean; copies?: number }): Promise<{ ok: boolean; message?: string }>
  }
  hostWindowApi?: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<void>
    close(): Promise<void>
    forceClose(): Promise<void>
    /** The page has painted, so the hidden window can appear. */
    ready(): Promise<void>
    onCloseRequest(callback: () => void): () => void
  }
  /** The user guide (doc/index.html) in a window of its own. */
  hostGuideApi?: {
    open(language: string): Promise<void>
  }
  /** What the shell says about itself before any page script runs. */
  __MPW_HOST__?: { tauri: string; webview: string; platform: string; arch: string }
  /** What the desktop shell itself is running. */
  hostAppApi?: {
    versions(): { tauri: string; webview: string; platform: string; arch: string }
  }
  /** Menu dropdowns rendered in their own window so they can overhang the app. */
  hostMenuApi?: {
    open(payload: unknown, anchor: { x: number; y: number; width: number; height: number }): Promise<boolean>
    close(): Promise<void>
    payload(): Promise<unknown>
    reportSize(size: { width: number; height: number }): Promise<void>
    choose(commandId: string): Promise<void>
    onPayload(callback: (payload: unknown) => void): () => void
    onChosen(callback: (commandId: string) => void): () => void
  }
  /** Dialogs rendered as separate, movable windows. */
  hostDialogApi?: {
    open(name: string, payload: unknown): Promise<boolean>
    close(name?: string): Promise<void>
    closeAll(): Promise<void>
    payload(): Promise<{ name: string; payload: unknown } | null>
    send(name: string, result: unknown): Promise<void>
    onPayload(callback: (payload: unknown) => void): () => void
    onResult(callback: (message: { name: string; result: unknown }) => void): () => void
    onClosed(callback: (name: string) => void): () => void
    reportSize(size: { width: number; height: number }): Promise<void>
    reportError(report: { source: string; message: string; details: string }): Promise<void>
    onError(callback: (report: { source: string; message: string; details: string }) => void): () => void
  }
}
