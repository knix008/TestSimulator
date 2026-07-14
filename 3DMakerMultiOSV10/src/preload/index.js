import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('appInfo', {
  platform: process.platform,
  versions: process.versions
})

contextBridge.exposeInMainWorld('modelCache', {
  match: (key) => ipcRenderer.invoke('model-cache:match', key),
  put: (key, data) => ipcRenderer.invoke('model-cache:put', key, data),
  info: () => ipcRenderer.invoke('model-cache:info')
})
