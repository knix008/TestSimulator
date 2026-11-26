/// <reference types="vite/client" />

import type {
  CreateBootableIsoOptions,
  CreateIsoOptions,
  EngineInfo,
  ExtractOptions,
  JobProgress,
  MountResult,
} from './platform/engine-types'
import type { IsoTreeResult } from './iso9660/tree-types'

export type EditSessionSnapshot = IsoTreeResult & {
  sourcePath: string
  sourceKind: 'iso' | 'img' | 'appimage' | 'docker' | 'unknown'
  dirty: boolean
  canSaveAppImage: boolean
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
  saveFile: (
    defaultPath?: string,
    hintPath?: string,
    title?: string,
    filters?: { name: string; extensions: string[] }[],
  ) => Promise<string | null>
  openPath: (targetPath: string) => Promise<string>
  extractIso: (options: ExtractOptions) => Promise<{ ok: true }>
  createIso: (options: CreateIsoOptions) => Promise<{ ok: true }>
  createBootableIso: (options: CreateBootableIsoOptions) => Promise<{ ok: true }>
  createAppImage?: (options: { sourceDir: string; output: string; name?: string; arch?: 'x86_64' | 'aarch64' }) => Promise<{ ok: true; size: number; offset: number }>
  cancelJob: () => Promise<{ ok: true; canceled: boolean }>
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
  /** Tauri: OS file drops come as the `isomaker-native-drop` window event (tauri-bridge.ts). */
  nativeDrop?: boolean
  onHostError?: (handler: (message: string) => void) => () => void
  fsPlaces?: () => Promise<import('./platform/engine-types').FsPlace[]>
  fsList?: (dir: string) => Promise<import('./platform/engine-types').FsEntry[]>
  fsStat?: (p: string) => Promise<import('./platform/engine-types').FsEntry | null>
  packageStatus?: () => Promise<import('./packages/packages').PackageStatus[]>
  missingRequiredPackages?: () => Promise<import('./packages/packages').PackageId[]>
  runPackage?: (
    id: import('./packages/packages').PackageId,
    action: import('./packages/packages').PackageAction,
  ) => Promise<import('./packages/packages').PackageStatus[]>
  cancelPackage?: () => Promise<{ canceled: boolean }>
  onPackageProgress?: (handler: (p: import('./packages/packages').PackageProgress) => void) => () => void

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
