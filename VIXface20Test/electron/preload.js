// preload.js — exposes a minimal, safe bridge to the renderer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vixapi', {
  sendCommand: (opts) => ipcRenderer.invoke('device:send', opts),
  readConfig: () => ipcRenderer.invoke('config:read'),
  loadSessions: () => ipcRenderer.invoke('sessions:load'),
  saveSessions: (payload) => ipcRenderer.invoke('sessions:save', payload),
  saveCsv: (opts) => ipcRenderer.invoke('csv:save', opts)
});
