const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('fp3dDesktop', {
  isDesktop: true,
  openFiles: (options) => ipcRenderer.invoke('fp3d:openFiles', options || {}),
  rememberPaths: (filePaths) => ipcRenderer.invoke('fp3d:rememberPaths', filePaths || []),
  saveFile: (payload) => ipcRenderer.invoke('fp3d:saveFile', payload || {}),
  savePng: (payload) => ipcRenderer.invoke('fp3d:saveFile', {
    ...(payload || {}),
    filters: [{ name: 'PNG Image', extensions: ['png'] }],
    title: (payload && payload.title) || 'Save PNG',
  }),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch {
      return '';
    }
  },
});
