const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mydiff", {
  platform: process.platform,
  pickFile: (title) => ipcRenderer.invoke("pick-file", title),
  pickDirectory: (title) => ipcRenderer.invoke("pick-directory", title),
  copyText: (value) => ipcRenderer.invoke("copy-text", value),
  openExternal: (target) => ipcRenderer.invoke("open-external", target),
});
