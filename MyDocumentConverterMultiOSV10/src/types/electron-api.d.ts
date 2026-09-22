type ElectronOpenFile = {
  path: string
  name: string
  size?: number
  text?: string
  base64?: string
}

type ElectronOpenResult = {
  canceled: boolean
  directory?: string
  message?: string
  files: ElectronOpenFile[]
}

type ElectronSaveResult = {
  canceled: boolean
  filePath?: string
  directory?: string
  message?: string
}

type ElectronSaveFilter = {
  name: string
  extensions: string[]
}

type ElectronProgress = { id: string; received: number; total: number; done: boolean; error?: string }

interface Window {
  electronFileApi?: {
    openFiles(options?: { defaultPath?: string; filters?: ElectronSaveFilter[]; multiple?: boolean }): Promise<ElectronOpenResult>
    readFile(options: { filePath: string }): Promise<ElectronOpenResult>
    exists(filePath: string): Promise<boolean>
    saveFile(options: { defaultDirectory?: string; fileName: string; filters?: ElectronSaveFilter[]; text?: string; base64?: string }): Promise<ElectronSaveResult>
    writeFile(options: { filePath: string; text?: string; base64?: string }): Promise<ElectronSaveResult>
    chooseDirectory(options?: { defaultPath?: string }): Promise<{ canceled: boolean; directory?: string }>
    showInFolder(filePath: string): Promise<void>
    openExternal(url: string): Promise<void>
    openPath(target: string): Promise<string>
    onOpenPaths(callback: (paths: string[]) => void): () => void
    pathForFile(file: File): string
  }
  electronUrlApi?: {
    fetch(id: string, url: string): Promise<{ ok: boolean; message?: string; name?: string; contentType?: string; text?: string; base64?: string }>
    cancel(id: string): Promise<void>
    onProgress(callback: (progress: ElectronProgress) => void): () => void
  }
  electronFontApi?: {
    list(): Promise<string[]>
  }
  electronPrintApi?: {
    printers(): Promise<{ name: string; displayName: string; isDefault: boolean }[]>
    print(options: { html: string; deviceName?: string; landscape?: boolean; copies?: number; pageSize?: string; pages?: string }): Promise<{ ok: boolean; message?: string }>
    pdf(options: { html: string; landscape?: boolean; pageSize?: string; pages?: string }): Promise<{ ok: boolean; message?: string; base64?: string }>
  }
  electronWindowApi?: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<void>
    isMaximized(): Promise<boolean>
    close(): Promise<void>
    forceClose(): Promise<void>
    setMinimumWidth(width: number): Promise<void>
    setTitle(title: string): Promise<void>
    ready(): Promise<void>
    onCloseRequest(callback: () => void): () => void
  }
  electronAppApi?: {
    versions(): { electron: string; chrome: string; node: string; v8: string; platform: string; arch: string }
    paths(): Promise<{ documents: string; downloads: string; home: string; userData: string; temp: string }>
  }
  electronMenuApi?: {
    open(payload: unknown, anchor: { x: number; y: number; width: number; height: number }): Promise<boolean>
    close(): Promise<void>
    payload(): Promise<unknown>
    reportSize(size: { width: number; height: number }): Promise<void>
    choose(commandId: string): Promise<void>
    onPayload(callback: (payload: unknown) => void): () => void
    onChosen(callback: (commandId: string) => void): () => void
  }
  electronDialogApi?: {
    open(name: string, payload: unknown): Promise<boolean>
    close(name?: string): Promise<void>
    closeAll(): Promise<void>
    payload(): Promise<{ name: string; payload: unknown; openId: number } | null>
    send(name: string, result: unknown): Promise<void>
    onPayload(callback: (payload: unknown) => void): () => void
    onResult(callback: (message: { name: string; result: unknown }) => void): () => void
    onClosed(callback: (name: string) => void): () => void
    reportSize(size: { width: number; height: number }): Promise<void>
    reportError(report: { source: string; message: string; details: string }): Promise<void>
    onError(callback: (report: { source: string; message: string; details: string }) => void): () => void
  }
}

declare module 'mammoth/mammoth.browser.js' {
  const mammoth: {
    convertToHtml(input: { arrayBuffer: ArrayBuffer }, options?: Record<string, unknown>): Promise<{ value: string; messages: { type: string; message: string }[] }>
  }
  export default mammoth
}
