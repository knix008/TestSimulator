const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  isElectron: true,
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximizeToggle: () => ipcRenderer.invoke('window:maximizeToggle'),
  /** Hide main window to the system tray (does not quit). */
  close: () => ipcRenderer.invoke('window:close'),
  showWindow: () => ipcRenderer.invoke('window:show'),
  /** Desktop notification (click focuses the app). */
  notify: (payload) => ipcRenderer.invoke('app:notify', payload || {}),
  /** Write text to the system clipboard (reliable in Electron modals). */
  copyText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  /** Quit the app process (also available from the tray menu). */
  quitApp: () => ipcRenderer.invoke('app:quit'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  setMinimumSize: (width, height, options) =>
    ipcRenderer.invoke('window:setMinimumSize', width, height, options || {}),
  setWindowOpacity: (opacity) => ipcRenderer.invoke('window:setOpacity', opacity),
  getWindowOpacity: () => ipcRenderer.invoke('window:getOpacity'),
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
  onWindowState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('window:state', handler);
    return () => ipcRenderer.removeListener('window:state', handler);
  },
  /** Fired when the main window is hidden to tray or shown again. */
  onWindowVisibility: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('window:visibility', handler);
    return () => ipcRenderer.removeListener('window:visibility', handler);
  },
  /** Enable/disable LAN camera publish (used for peer IP calls). */
  setPhonePublish: (enabled) => ipcRenderer.invoke('phone:setPublish', enabled),
  getPhoneInfo: () => ipcRenderer.invoke('phone:getInfo'),
  /** Dial peer IP and wait for Accept / Reject. */
  phoneRing: (host, port) => ipcRenderer.invoke('phone:ring', { host, port }),
  /** Answer an incoming call request. */
  phoneRespond: (callId, accepted) =>
    ipcRenderer.invoke('phone:respond', { callId, accepted: Boolean(accepted) }),
  phoneClearSessions: () => ipcRenderer.invoke('phone:clearSessions'),
  onIncomingCall: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('phone:incoming', handler);
    return () => ipcRenderer.removeListener('phone:incoming', handler);
  },
  /** Peer stopped watching our /live (typical remote hang-up). */
  onPhonePeerLeft: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('phone:peerLeft', handler);
    return () => ipcRenderer.removeListener('phone:peerLeft', handler);
  },
  onOpenMediaPaths: (callback) => {
    const handler = (_event, paths) => callback(paths);
    ipcRenderer.on('app:openMediaPaths', handler);
    return () => ipcRenderer.removeListener('app:openMediaPaths', handler);
  }
});
