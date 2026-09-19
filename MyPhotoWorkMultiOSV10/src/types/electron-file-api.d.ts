type ElectronOpenFile = {
  path: string
  name: string
  mime: string
  text?: string
  dataUrl?: string
}

type ElectronOpenResult = {
  canceled: boolean
  directory?: string
  files: ElectronOpenFile[]
}

type ElectronSaveResult = {
  canceled: boolean
  filePath?: string
  directory?: string
}

type ElectronSaveFilter = {
  name: string
  extensions: string[]
}

interface Window {
  electronFileApi?: {
    openFiles(options?: { defaultPath?: string }): Promise<ElectronOpenResult>
    readFile(options: { filePath: string }): Promise<ElectronOpenResult & { message?: string }>
    saveFile(options: { defaultDirectory?: string; fileName: string; filters?: ElectronSaveFilter[]; text?: string; dataUrl?: string }): Promise<ElectronSaveResult>
    writeFile(options: { filePath: string; text?: string; dataUrl?: string }): Promise<ElectronSaveResult>
  }
  /** One print window, so the job goes straight to the printer from there. */
  electronPrintApi?: {
    printers(): Promise<{ name: string; displayName: string; isDefault: boolean }[]>
    print(options: { html: string; deviceName?: string; landscape?: boolean; copies?: number }): Promise<{ ok: boolean; message?: string }>
  }
  electronWindowApi?: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<void>
    close(): Promise<void>
    forceClose(): Promise<void>
    onCloseRequest(callback: () => void): () => void
  }
  /** What the desktop shell itself is running. */
  electronAppApi?: {
    versions(): { electron: string; chrome: string; node: string; v8: string; platform: string; arch: string }
  }
  /** Menu dropdowns rendered in their own window so they can overhang the app. */
  electronMenuApi?: {
    open(payload: unknown, anchor: { x: number; y: number; width: number; height: number }): Promise<boolean>
    close(): Promise<void>
    payload(): Promise<unknown>
    reportSize(size: { width: number; height: number }): Promise<void>
    choose(commandId: string): Promise<void>
    onPayload(callback: (payload: unknown) => void): () => void
    onChosen(callback: (commandId: string) => void): () => void
  }
  /** Dialogs rendered as separate, movable windows. */
  electronDialogApi?: {
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
