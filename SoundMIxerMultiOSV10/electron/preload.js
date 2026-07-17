const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openAudioFiles: () => ipcRenderer.invoke('dialog:openAudio'),
  openProjectFile: () => ipcRenderer.invoke('dialog:openProject'),
  saveAudioFile: (payload) => ipcRenderer.invoke('dialog:saveAudio', payload),
  saveProjectFile: (payload) => ipcRenderer.invoke('dialog:saveProject', payload),
  getPath: (name) => ipcRenderer.invoke('app:getPath', name),
  onMenuOpenAudio: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('menu:open-audio', handler);
    return () => ipcRenderer.removeListener('menu:open-audio', handler);
  },
  onMenuSaveAudio: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('menu:save-audio', handler);
    return () => ipcRenderer.removeListener('menu:save-audio', handler);
  },
  onMenuOpenProject: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('menu:open-project', handler);
    return () => ipcRenderer.removeListener('menu:open-project', handler);
  },
  onMenuSaveProject: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('menu:save-project', handler);
    return () => ipcRenderer.removeListener('menu:save-project', handler);
  }
});
