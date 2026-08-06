import { contextBridge, ipcRenderer } from 'electron'
import type { CommandCenterApi, CompressRequest, ExtractRequest, FileOperationRequest, IndexStatus, OperationProgress, Preferences, SearchOptions } from '../src/shared.js'

const api: CommandCenterApi = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  savePreferences: (preferences: Preferences) => ipcRenderer.invoke('prefs:save', preferences),
  listDirectory: (path?: string) => ipcRenderer.invoke('fs:list', path),
  revealPath: (path: string) => ipcRenderer.invoke('fs:reveal', path),
  openPath: (path: string) => ipcRenderer.invoke('fs:open', path),
  readPreview: (path: string) => ipcRenderer.invoke('fs:preview', path),
  createFolder: (parentPath: string, name: string) => ipcRenderer.invoke('fs:create-folder', parentPath, name),
  createFile: (parentPath: string, name: string) => ipcRenderer.invoke('fs:create-file', parentPath, name),
  renamePath: (sourcePath: string, newName: string) => ipcRenderer.invoke('fs:rename', sourcePath, newName),
  copy: (request: FileOperationRequest) => ipcRenderer.invoke('fs:copy', request),
  move: (request: FileOperationRequest) => ipcRenderer.invoke('fs:move', request),
  delete: (paths: string[]) => ipcRenderer.invoke('fs:delete', paths),
  search: (options: SearchOptions) => ipcRenderer.invoke('fs:search', options),
  compress: (request: CompressRequest) => ipcRenderer.invoke('archive:compress', request),
  extract: (request: ExtractRequest) => ipcRenderer.invoke('archive:extract', request),
  chooseDirectory: () => ipcRenderer.invoke('dialog:directory'),
  chooseSaveZip: (defaultPath: string) => ipcRenderer.invoke('dialog:save-zip', defaultPath),
  watchDirectory: (path: string) => ipcRenderer.invoke('fs:watch', path),
  getIndexStatus: () => ipcRenderer.invoke('index:status'),
  rebuildIndex: () => ipcRenderer.invoke('index:rebuild'),
  cancelIndex: () => ipcRenderer.invoke('index:cancel'),
  searchIndex: (options: SearchOptions) => ipcRenderer.invoke('index:search', options),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onDirectoryChanged: (callback: (path: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, path: string) => callback(path)
    ipcRenderer.on('fs:changed', handler)
    return () => ipcRenderer.off('fs:changed', handler)
  },
  onOperationProgress: (callback: (progress: OperationProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: OperationProgress) => callback(progress)
    ipcRenderer.on('operation:progress', handler)
    return () => ipcRenderer.off('operation:progress', handler)
  },
  onIndexStatus: (callback: (status: IndexStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: IndexStatus) => callback(status)
    ipcRenderer.on('index:status', handler)
    return () => ipcRenderer.off('index:status', handler)
  },
}

contextBridge.exposeInMainWorld('commandCenter', api)
