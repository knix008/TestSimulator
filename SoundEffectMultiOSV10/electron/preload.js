const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openAudioFiles: () => ipcRenderer.invoke('dialog:openAudio'),
  saveAudioFile: (payload) => ipcRenderer.invoke('dialog:saveAudio', payload),
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
  }
});
