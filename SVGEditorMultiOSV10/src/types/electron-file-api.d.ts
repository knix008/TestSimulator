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
}