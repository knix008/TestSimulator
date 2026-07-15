import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('appInfo', {
  platform: process.platform,
  versions: process.versions
})

contextBridge.exposeInMainWorld('modelCache', {
  match: (key) => ipcRenderer.invoke('model-cache:match', key),
  put: (key, data) => ipcRenderer.invoke('model-cache:put', key, data),
  info: () => ipcRenderer.invoke('model-cache:info'),
  status: (modelId) => ipcRenderer.invoke('model-cache:status', modelId)
})

contextBridge.exposeInMainWorld('depthApi', {
  /**
   * @param {{ modelId: string, width: number, height: number, rgba: ArrayBuffer }} payload
   */
  estimate: (payload) => ipcRenderer.invoke('depth:estimate', payload),
  /**
   * @param {(message: string) => void} callback
   * @returns {() => void}
   */
  onProgress: (callback) => {
    const listener = (_event, message) => {
      callback(String(message ?? ''))
    }
    ipcRenderer.on('depth:progress', listener)
    return () => ipcRenderer.removeListener('depth:progress', listener)
  }
})

contextBridge.exposeInMainWorld('modelIo', {
  /**
   * @param {{ glb: ArrayBuffer, baseName: string }} payload
   */
  convertGlbToFbx: (payload) => ipcRenderer.invoke('model-io:convert-glb-to-fbx', payload),
  getConfig: () => ipcRenderer.invoke('model-io:get-config'),
  setConfig: (payload) => ipcRenderer.invoke('model-io:set-config', payload),
  detectBlender: (payload) => ipcRenderer.invoke('model-io:detect-blender', payload)
})

contextBridge.exposeInMainWorld('fileDialog', {
  openImage: () => ipcRenderer.invoke('file-dialog:open-image'),
  openModel: () => ipcRenderer.invoke('file-dialog:open-model')
})
