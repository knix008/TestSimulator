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
    saveFile(options: { defaultDirectory?: string; fileName: string; filters?: ElectronSaveFilter[]; text?: string; dataUrl?: string }): Promise<ElectronSaveResult>
    writeFile(options: { filePath: string; text?: string; dataUrl?: string }): Promise<ElectronSaveResult>
  }
  electronWindowApi?: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<void>
    close(): Promise<void>
    forceClose(): Promise<void>
    onCloseRequest(callback: () => void): () => void
  }
  /** Menu dropdowns rendered in their own window so they can overhang the app. */
  electronMenuApi?: {
    open(payload: unknown, anchor: { x: number; y: number; width: number; height: number }): Promise<boolean>
    close(): Promise<void>
    payload(): Promise<unknown>
    reportSize(size: { width: number; height: number }): Promise<void>
    choose(commandId: string): Promise<void>
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
  }
}
