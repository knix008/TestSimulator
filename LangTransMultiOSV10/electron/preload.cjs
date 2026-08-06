const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('langTransWindow', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  startTtsServer: () => ipcRenderer.invoke('tts:start'),
})