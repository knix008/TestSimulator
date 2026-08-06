export type PlatformKind = 'desktop' | 'web'

export type AppTheme = 'light' | 'dark'
export type AppLanguage = 'ko' | 'en'

export type EntryKind = 'file' | 'directory'

export type FileEntry = {
  name: string
  fullPath: string
  kind: EntryKind
  size: number
  modifiedMs: number
  extension: string
}

export type DirectoryListing = {
  path: string
  parentPath: string | null
  entries: FileEntry[]
}

export type PreviewResult =
  | { kind: 'empty'; message: string }
  | { kind: 'text'; text: string; name: string }
  | { kind: 'image'; dataUrl: string; name: string }
  | { kind: 'info'; name: string; detail: string }

export type SearchOptions = {
  rootPath: string
  pattern: string
  includeFolders: boolean
  searchContent: boolean
  contentPattern?: string
  caseSensitive: boolean
  useRegex: boolean
}

export type FileOperationRequest = {
  sources: string[]
  destinationDir?: string
  targetPath?: string
}

export type CompressRequest = {
  sources: string[]
  destinationZip: string
  splitSizeBytes: number
}

export type ExtractRequest = {
  archivePath: string
  destinationDir: string
}

export type OperationProgress = {
  label: string
  currentPath: string
  completed: number
  total: number
  done: boolean
}

export type IndexStatus = {
  state: 'not-built' | 'building' | 'ready'
  count: number
  indexedCount: number
  lastBuiltMs: number | null
}

export type Preferences = {
  language: AppLanguage
  theme: AppTheme
  leftPath?: string
  rightPath?: string
  bookmarks: string[]
}

export type AppInfo = {
  platform: PlatformKind
  os: 'aix' | 'android' | 'darwin' | 'freebsd' | 'haiku' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd' | 'browser'
  homePath: string
  roots: string[]
  preferences: Preferences
}

export type CommandCenterApi = {
  getAppInfo(): Promise<AppInfo>
  savePreferences(preferences: Preferences): Promise<void>
  listDirectory(path?: string): Promise<DirectoryListing>
  revealPath(path: string): Promise<void>
  openPath(path: string): Promise<void>
  readPreview(path: string): Promise<PreviewResult>
  createFolder(parentPath: string, name: string): Promise<void>
  createFile(parentPath: string, name: string): Promise<void>
  renamePath(sourcePath: string, newName: string): Promise<void>
  copy(request: FileOperationRequest): Promise<void>
  move(request: FileOperationRequest): Promise<void>
  delete(paths: string[]): Promise<void>
  search(options: SearchOptions): Promise<FileEntry[]>
  compress(request: CompressRequest): Promise<void>
  extract(request: ExtractRequest): Promise<void>
  chooseDirectory(): Promise<string | null>
  chooseSaveZip(defaultPath: string): Promise<string | null>
  watchDirectory(path: string): Promise<void>
  getIndexStatus(): Promise<IndexStatus>
  rebuildIndex(): Promise<void>
  cancelIndex(): Promise<void>
  searchIndex(options: SearchOptions): Promise<FileEntry[]>
  minimizeWindow(): Promise<void>
  toggleMaximizeWindow(): Promise<void>
  closeWindow(): Promise<void>
  onDirectoryChanged(callback: (path: string) => void): () => void
  onOperationProgress(callback: (progress: OperationProgress) => void): () => void
  onIndexStatus(callback: (status: IndexStatus) => void): () => void
}

declare global {
  interface Window {
    commandCenter?: CommandCenterApi
  }
}
