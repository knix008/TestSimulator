const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ttsBridge', {
  getModelCatalog:          ()          => ipcRenderer.invoke('app:getModelCatalog'),
  getCachedModels:          ()          => ipcRenderer.invoke('app:getCachedModels'),
  getCacheDirectory:        ()          => ipcRenderer.invoke('app:getCacheDirectory'),
  selectWavPath:            ()          => ipcRenderer.invoke('app:selectWavPath'),
  downloadAndPrepareModel:  (modelId)   => ipcRenderer.invoke('app:downloadAndPrepareModel', modelId),
  speak:                    (payload)   => ipcRenderer.invoke('app:speak', payload),
  warmModel:                (modelId)   => ipcRenderer.invoke('app:warmModel', modelId),
  listModelVoices:          (modelId)   => ipcRenderer.invoke('app:listModelVoices', modelId),
  exportWav:                (payload)   => ipcRenderer.invoke('app:exportWav', payload),
  openTextFile:             ()          => ipcRenderer.invoke('app:openTextFile'),
  onModelDownloadProgress: (callback) => {
    const channel  = 'app:modelDownloadProgress';
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
