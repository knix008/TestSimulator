import { contextBridge, ipcRenderer } from 'electron'

export type AppInfo = {
  name: string
  version: string
  author: string
  email: string
  copyright: string
  platform: string
  electron: string
  chrome: string
  node: string
  buildDate: string
}

const api = {
  minimize: () => ipcRenderer.invoke('window:minimize') as Promise<void>,
  maximize: () => ipcRenderer.invoke('window:maximize') as Promise<boolean>,
  close: () => ipcRenderer.invoke('window:close') as Promise<void>,
  isMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
  setMinWidth: (width: number) => ipcRenderer.invoke('window:setMinWidth', width) as Promise<void>,
  saveDialog: (defaultName: string) =>
    ipcRenderer.invoke('dialog:save', defaultName) as Promise<string | null>,
  openDialog: () =>
    ipcRenderer.invoke('dialog:open') as Promise<{ filePath: string; content: string } | null>,
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('file:write', filePath, content) as Promise<boolean>,
  saveImageDialog: (defaultName: string) =>
    ipcRenderer.invoke('dialog:saveImage', defaultName) as Promise<string | null>,
  writeBinaryFile: (filePath: string, base64: string) =>
    ipcRenderer.invoke('file:writeBinary', filePath, base64) as Promise<boolean>,
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url) as Promise<void>,
  getAppInfo: () => ipcRenderer.invoke('app:getInfo') as Promise<AppInfo>,
  // Fired when the OS opens a .mmap with the app (file association / "Open with").
  onOpenFile: (cb: (data: { filePath: string; content: string }) => void) => {
    const listener = (_e: unknown, data: { filePath: string; content: string }) => cb(data)
    ipcRenderer.on('file:opened', listener)
    return () => {
      ipcRenderer.removeListener('file:opened', listener)
    }
  },
  isElectron: true as const,
}

contextBridge.exposeInMainWorld('mymind', api)

export type MyMindApi = typeof api
