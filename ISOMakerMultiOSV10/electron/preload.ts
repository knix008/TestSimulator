import { contextBridge, ipcRenderer } from 'electron'
import type {
  CreateBootableIsoOptions,
  CreateIsoOptions,
  EngineInfo,
  ExtractOptions,
  JobProgress,
  MountResult,
} from './iso/types'

type FileFilter = { name: string; extensions: string[] }

export type IsoMakerApi = {
  getEngineInfo: () => Promise<EngineInfo>
  openFile: (filters?: FileFilter[]) => Promise<string | null>
  openDirectory: () => Promise<string | null>
  saveFile: (defaultPath?: string) => Promise<string | null>
  openPath: (targetPath: string) => Promise<string>
  extractIso: (options: ExtractOptions) => Promise<{ ok: true }>
  createIso: (options: CreateIsoOptions) => Promise<{ ok: true }>
  createBootableIso: (options: CreateBootableIsoOptions) => Promise<{ ok: true }>
  cancelJob: () => Promise<{ ok: true; canceled: boolean }>
  mountIso: (isoPath: string) => Promise<MountResult>
  unmountIso: (target: string) => Promise<MountResult>
  onProgress: (handler: (progress: JobProgress) => void) => () => void
}

const api: IsoMakerApi = {
  getEngineInfo: () => ipcRenderer.invoke('engine:info'),
  openFile: (filters) => ipcRenderer.invoke('dialog:openFile', filters),
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  saveFile: (defaultPath) => ipcRenderer.invoke('dialog:saveFile', defaultPath),
  openPath: (targetPath) => ipcRenderer.invoke('shell:openPath', targetPath),
  extractIso: (options) => ipcRenderer.invoke('iso:extract', options),
  createIso: (options) => ipcRenderer.invoke('iso:create', options),
  createBootableIso: (options) => ipcRenderer.invoke('iso:createBootable', options),
  cancelJob: () => ipcRenderer.invoke('iso:cancel'),
  mountIso: (isoPath) => ipcRenderer.invoke('iso:mount', isoPath),
  unmountIso: (target) => ipcRenderer.invoke('iso:unmount', target),
  onProgress: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: JobProgress) => {
      handler(progress)
    }
    ipcRenderer.on('job:progress', listener)
    return () => {
      ipcRenderer.removeListener('job:progress', listener)
    }
  },
}

contextBridge.exposeInMainWorld('isoMaker', api)
