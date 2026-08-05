const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronFileApi', {
  openFiles: (options) => ipcRenderer.invoke('files:open', options),
  saveFile: (options) => ipcRenderer.invoke('files:save', options),
  writeFile: (options) => ipcRenderer.invoke('files:write', options),
})

contextBridge.exposeInMainWorld('electronWindowApi', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close'),
})