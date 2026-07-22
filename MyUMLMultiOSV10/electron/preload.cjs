const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('myUmlDesktop', {
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (payload) => ipcRenderer.invoke('project:save', payload),
  saveImage: (payload) => ipcRenderer.invoke('image:save', payload)
});
