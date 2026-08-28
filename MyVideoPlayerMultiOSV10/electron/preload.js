const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  isElectron: true,
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximizeToggle: () => ipcRenderer.invoke('window:maximizeToggle'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  setMinimumSize: (width, height) => ipcRenderer.invoke('window:setMinimumSize', width, height),
  getBounds: () => ipcRenderer.invoke('window:getBounds'),
  setBounds: (bounds) => ipcRenderer.invoke('window:setBounds', bounds),
  setWindowOpacity: (opacity) => ipcRenderer.invoke('window:setOpacity', opacity),
  getWindowOpacity: () => ipcRenderer.invoke('window:getOpacity'),
  setSpectrumOpacity: (opacity) => ipcRenderer.invoke('spectrum:setOpacity', opacity),
  getSpectrumOpacity: () => ipcRenderer.invoke('spectrum:getOpacity'),
  beginWindowDrag: () => ipcRenderer.send('window:beginDrag'),
  updateWindowDrag: (screenX, screenY) => ipcRenderer.send('window:updateDrag', screenX, screenY),
  endWindowDrag: () => ipcRenderer.send('window:endDrag'),
  openMedia: () => ipcRenderer.invoke('dialog:openMedia'),
  openMediaPath: (filePath) => ipcRenderer.invoke('media:openPath', filePath),
  makeMediaCompatible: (filePath, options) =>
    ipcRenderer.invoke('media:makeCompatible', filePath, options || {}),
  onMediaCompatProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('media:compatProgress', handler);
    return () => ipcRenderer.removeListener('media:compatProgress', handler);
  },
  openSubtitle: () => ipcRenderer.invoke('dialog:openSubtitle'),
  findSubtitle: (mediaPath) => ipcRenderer.invoke('fs:findSubtitle', mediaPath),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  getSystemTheme: () => ipcRenderer.invoke('theme:getSystem'),
  setThemeSource: (source) => ipcRenderer.invoke('theme:setSource', source),
  parseYouTube: (input) => ipcRenderer.invoke('youtube:parse', input),
  getYouTubeInfo: (input) => ipcRenderer.invoke('youtube:info', input),
  downloadYouTube: (payload) => ipcRenderer.invoke('youtube:download', payload),
  cancelYouTubeDownload: (options) =>
    ipcRenderer.invoke('youtube:cancelDownload', options || { discard: true }),
  stopYouTubeDownload: (options) =>
    ipcRenderer.invoke('youtube:cancelDownload', options || { discard: false }),
  openRtsp: (input) => ipcRenderer.invoke('rtsp:open', input),
  stopRtsp: () => ipcRenderer.invoke('rtsp:stop'),
  getActiveRtsp: () => ipcRenderer.invoke('rtsp:getActive'),
  isRtspUrl: (input) => ipcRenderer.invoke('rtsp:isUrl', input),
  startRtspRecord: (payload) => ipcRenderer.invoke('rtsp:startRecord', payload || {}),
  stopRtspRecord: (options) => ipcRenderer.invoke('rtsp:stopRecord', options || {}),
  getRtspRecording: () => ipcRenderer.invoke('rtsp:getRecording'),
  onRtspRecordProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('rtsp:recordProgress', handler);
    return () => ipcRenderer.removeListener('rtsp:recordProgress', handler);
  },
  /** Durable key/value store in Electron userData (survives random UI port). */
  persistGetItem: (key) => ipcRenderer.sendSync('persist:getItem', key),
  persistSetItem: (key, value) => ipcRenderer.sendSync('persist:setItem', key, value),
  persistRemoveItem: (key) => ipcRenderer.sendSync('persist:removeItem', key),
  openSpectrumWindow: (initPayload) => ipcRenderer.invoke('spectrum:open', initPayload),
  closeSpectrumWindow: () => ipcRenderer.invoke('spectrum:close'),
  focusSpectrumWindow: () => ipcRenderer.invoke('spectrum:focus'),
  sendSpectrumMessage: (message) => ipcRenderer.send('spectrum:toWindow', message),
  sendSpectrumHostMessage: (message) => ipcRenderer.send('spectrum:toHost', message),
  onSpectrumMessage: (callback) => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on('spectrum:message', handler);
    return () => ipcRenderer.removeListener('spectrum:message', handler);
  },
  onSpectrumWindowEvent: (callback) => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on('spectrum:hostEvent', handler);
    return () => ipcRenderer.removeListener('spectrum:hostEvent', handler);
  },
  openHistoryWindow: (initPayload) => ipcRenderer.invoke('history:open', initPayload),
  closeHistoryWindow: () => ipcRenderer.invoke('history:close'),
  focusHistoryWindow: () => ipcRenderer.invoke('history:focus'),
  sendHistoryMessage: (message) => ipcRenderer.send('history:toWindow', message),
  sendHistoryHostMessage: (message) => ipcRenderer.send('history:toHost', message),
  onHistoryMessage: (callback) => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on('history:message', handler);
    return () => ipcRenderer.removeListener('history:message', handler);
  },
  onHistoryWindowEvent: (callback) => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on('history:hostEvent', handler);
    return () => ipcRenderer.removeListener('history:hostEvent', handler);
  },
  onYouTubeDownloadProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('youtube:downloadProgress', handler);
    return () => ipcRenderer.removeListener('youtube:downloadProgress', handler);
  },
  onWindowState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('window:state', handler);
    return () => ipcRenderer.removeListener('window:state', handler);
  },
  onOpenMediaPaths: (callback) => {
    const handler = (_event, paths) => callback(paths);
    ipcRenderer.on('app:openMediaPaths', handler);
    return () => ipcRenderer.removeListener('app:openMediaPaths', handler);
  }
});
