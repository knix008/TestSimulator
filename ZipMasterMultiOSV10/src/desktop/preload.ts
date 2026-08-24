import { contextBridge, ipcRenderer } from 'electron'
import type {
  ArchiveEntry,
  CompressOptions,
  DirListing,
  ExtractOptions,
  FsEntry,
  InputSource,
  OperationResult,
  Progress
} from '@core/types'

/** 렌더러에 노출되는 안전한 IPC 브리지. */
const api = {
  pickInputs: (kind: 'files' | 'folder'): Promise<InputSource[]> =>
    ipcRenderer.invoke('dialog:pickInputs', kind),
  pickArchive: (): Promise<InputSource | null> => ipcRenderer.invoke('dialog:pickArchive'),
  pickSavePath: (format: string, defaultName?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pickSave', { format, defaultName }),
  pickOutputDir: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pickDir', defaultPath),
  resolveCompressPath: (dir: string, baseName: string, format: string): Promise<string> =>
    ipcRenderer.invoke('archive:resolvePath', { dir, baseName, format }),

  compress: (
    inputs: InputSource[],
    outPath: string,
    opts: CompressOptions
  ): Promise<OperationResult> => ipcRenderer.invoke('archive:compress', { inputs, outPath, opts }),

  extract: (archivePath: string, outDir: string, opts: ExtractOptions): Promise<OperationResult> =>
    ipcRenderer.invoke('archive:extract', { archivePath, outDir, opts }),

  listEntries: (archivePath: string): Promise<ArchiveEntry[]> =>
    ipcRenderer.invoke('archive:list', archivePath),

  // ---- 파일 시스템 탐색 ----
  listDrives: (): Promise<FsEntry[]> => ipcRenderer.invoke('fs:listDrives'),
  listDir: (dirPath: string): Promise<DirListing> => ipcRenderer.invoke('fs:listDir', dirPath),

  // ---- 파일 조작(삭제/복사/이동/드래그 내보내기) ----
  deletePath: (target: string): Promise<void> => ipcRenderer.invoke('fs:delete', target),
  copyPath: (src: string, destDir: string): Promise<void> => ipcRenderer.invoke('fs:copy', { src, destDir }),
  movePath: (src: string, destDir: string): Promise<void> => ipcRenderer.invoke('fs:move', { src, destDir }),
  startDrag: (filePath: string): void => ipcRenderer.send('fs:startDrag', filePath),

  /** 진행률 구독. 반환된 함수로 해제. */
  onProgress: (cb: (p: Progress) => void): (() => void) => {
    const listener = (_e: unknown, p: Progress) => cb(p)
    ipcRenderer.on('archive:progress', listener)
    return () => ipcRenderer.removeListener('archive:progress', listener)
  },

  // ---- 앱 정보 & 창 제어 ----
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  minimizeWindow: (): void => ipcRenderer.send('win:minimize'),
  maximizeWindow: (): void => ipcRenderer.send('win:maximize'),
  closeWindow: (): void => ipcRenderer.send('win:close')
}

contextBridge.exposeInMainWorld('zipmaster', api)

export type ZipMasterApi = typeof api
