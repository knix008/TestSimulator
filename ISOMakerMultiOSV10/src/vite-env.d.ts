/// <reference types="vite/client" />

import type {
  CreateBootableIsoOptions,
  CreateIsoOptions,
  EngineInfo,
  ExtractOptions,
  JobProgress,
  MountResult,
} from '../electron/iso/types'
import type { IsoTreeResult } from './iso9660/tree-types'

export type EditSessionSnapshot = IsoTreeResult & {
  sourcePath: string
  dirty: boolean
}

export type IsoMakerApi = {
  getEngineInfo: () => Promise<EngineInfo>
  openFile: (
    filters?: { name: string; extensions: string[] }[],
    hintPath?: string,
    title?: string,
  ) => Promise<string | null>
  openFiles: (
    filters?: { name: string; extensions: string[] }[],
    hintPath?: string,
    title?: string,
  ) => Promise<string[]>
  openDirectory: (hintPath?: string, title?: string) => Promise<string | null>
  saveFile: (defaultPath?: string, hintPath?: string, title?: string) => Promise<string | null>
  openPath: (targetPath: string) => Promise<string>
  extractIso: (options: ExtractOptions) => Promise<{ ok: true }>
  createIso: (options: CreateIsoOptions) => Promise<{ ok: true }>
  createBootableIso: (options: CreateBootableIsoOptions) => Promise<{ ok: true }>
  mountIso: (isoPath: string) => Promise<MountResult>
  unmountIso: (target: string) => Promise<MountResult>
  listIsoTree: (isoPath: string) => Promise<IsoTreeResult>

  openEditSession: (isoPath: string) => Promise<EditSessionSnapshot>
  getEditSession: () => Promise<EditSessionSnapshot | null>
  closeEditSession: () => Promise<{ ok: true }>
  addPathsToSession: (destDir: string, filePaths: string[]) => Promise<EditSessionSnapshot>
  removeFromSession: (entryPath: string) => Promise<EditSessionSnapshot>
  removeManyFromSession: (entryPaths: string[]) => Promise<EditSessionSnapshot>
  mkdirInSession: (dirPath: string, name: string) => Promise<EditSessionSnapshot>
  renameInSession: (entryPath: string, newName: string) => Promise<EditSessionSnapshot>
  exportFileFromSession: (
    entryPath: string,
    outputPath: string,
  ) => Promise<{ ok: true; outputPath: string }>
  exportFilesToDirectory: (
    entryPaths: string[],
    outputDir: string,
  ) => Promise<{ ok: true; count: number; outputDir: string }>
  prepareDragOut: (entryPath: string) => Promise<{ tempPath: string; name: string }>
  prepareDragOutMany: (
    entryPaths: string[],
  ) => Promise<{ tempPaths: string[]; names: string[] }>
  saveEditSession: (outputPath: string) => Promise<EditSessionSnapshot>
  isEditDirty: () => Promise<{ dirty: boolean }>
  startDrag: (filePathOrPaths: string | string[]) => void
  getPathForFile: (file: File) => string

  setLocale?: (locale: 'ko' | 'en') => Promise<{ ok: true }>
  onProgress: (handler: (progress: JobProgress) => void) => () => void
  onNavigate: (handler: (tab: string) => void) => () => void
  onPrefs?: (handler: (prefs: { locale?: string; theme?: string }) => void) => () => void
  onSessionUpdated?: (handler: (snap: EditSessionSnapshot | null) => void) => () => void
  onCloseRequest?: (handler: () => void) => () => void
  ackCloseRequest?: () => Promise<{ ok: true }>
  decideClose?: (decision: 'save-done' | 'discard' | 'cancel') => Promise<{ ok: true }>
}

declare global {
  interface Window {
    isoMaker?: IsoMakerApi
  }
}

export {}
