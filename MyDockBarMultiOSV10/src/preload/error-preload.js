'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('errorApi', {
  onShow: (handler) => {
    ipcRenderer.on('error:show', (_event, payload) => handler(payload));
  },
  copy: (text) => ipcRenderer.invoke('error:copy', text),
});
