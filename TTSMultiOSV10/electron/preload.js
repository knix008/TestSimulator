const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ttsBridge', {
  getModelCatalog:          ()          => ipcRenderer.invoke('app:getModelCatalog'),
  getCachedModels:          ()          => ipcRenderer.invoke('app:getCachedModels'),
  getCacheDirectory:        ()          => ipcRenderer.invoke('app:getCacheDirectory'),
  selectAudioPath:          (payload)   => ipcRenderer.invoke('app:selectAudioPath', payload),
  selectWavPath:            ()          => ipcRenderer.invoke('app:selectWavPath'),
  selectMp3Path:            ()          => ipcRenderer.invoke('app:selectMp3Path'),
  downloadAndPrepareModel:  (modelId)   => ipcRenderer.invoke('app:downloadAndPrepareModel', modelId),
  speak:                    (payload)   => ipcRenderer.invoke('app:speak', payload),
  warmModel:                (modelId)   => ipcRenderer.invoke('app:warmModel', modelId),
  listModelVoices:          (modelId)   => ipcRenderer.invoke('app:listModelVoices', modelId),
  exportWav:                (payload)   => ipcRenderer.invoke('app:exportWav', payload),
  exportMp3:                (payload)   => ipcRenderer.invoke('app:exportMp3', payload),
  deleteModel:              (modelId)   => ipcRenderer.invoke('app:deleteModel', modelId),
  openTextFile:             ()          => ipcRenderer.invoke('app:openTextFile'),
  copyText:                 (text)      => ipcRenderer.invoke('app:copyText', text),
  onModelDownloadProgress: (callback) => {
    const channel  = 'app:modelDownloadProgress';
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
