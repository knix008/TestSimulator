/* Preload of the detached context-menu window (see src/popup.html, src/js/popupMenu.js). */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('popupAPI', {
  onShow:    (cb) => ipcRenderer.on('popup-show',    (_, payload) => cb(payload)),
  onRefresh: (cb) => ipcRenderer.on('popup-refresh', (_, payload) => cb(payload)),
  onHide:    (cb) => ipcRenderer.on('popup-hide',    () => cb()),
  event:     (ev) => ipcRenderer.send('popup-event', ev),
  setIgnoreMouse: (ignore) => ipcRenderer.send('popup-ignore-mouse', !!ignore),
});
