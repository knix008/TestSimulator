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
  getDreamspaceStatus: () => ipcRenderer.invoke('fp3d:dreamspaceStatus'),
  ensureDreamspace: () => ipcRenderer.invoke('fp3d:dreamspaceEnsure'),
  cancelDreamspace: () => ipcRenderer.invoke('fp3d:dreamspaceCancel'),
  onDreamspaceProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('fp3d:dreamspaceProgress', handler);
    return () => ipcRenderer.removeListener('fp3d:dreamspaceProgress', handler);
  },

  getFloorplanApiStatus: () => ipcRenderer.invoke('fp3d:floorplanApiStatus'),
  ensureFloorplanApi: () => ipcRenderer.invoke('fp3d:floorplanApiEnsure'),
  cancelFloorplanApi: () => ipcRenderer.invoke('fp3d:floorplanApiCancel'),
  onFloorplanApiProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('fp3d:floorplanApiProgress', handler);
    return () => ipcRenderer.removeListener('fp3d:floorplanApiProgress', handler);
  },

  openExternal: (url) => ipcRenderer.invoke('fp3d:openExternal', url),
  openPath: (targetPath) => ipcRenderer.invoke('fp3d:openPath', targetPath),
});
