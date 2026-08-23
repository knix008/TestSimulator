'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  isElectron: true,
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  copyText: (text) => ipcRenderer.invoke('clipboard:writeText', text),

  getAutoStart: () => ipcRenderer.invoke('autostart:get'),
  setAutoStart: (enabled) => ipcRenderer.invoke('autostart:set', Boolean(enabled)),

  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  fitSettingsWindow: (height) => ipcRenderer.send('window:fitSettings', height),
  setWindowOpacity: (opacity) => ipcRenderer.invoke('window:setOpacity', opacity),
  beginWindowDrag: () => ipcRenderer.send('window:beginDrag'),
  updateWindowDrag: (screenX, screenY) => ipcRenderer.send('window:updateDrag', screenX, screenY),
  endWindowDrag: () => ipcRenderer.send('window:endDrag'),

  getMemos: () => ipcRenderer.invoke('memos:get'),
  saveMemos: (items) => ipcRenderer.invoke('memos:save', items),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (data) => ipcRenderer.invoke('settings:save', data),
  getLook: (index) => ipcRenderer.invoke('look:get', index),
  setLook: (index, look) => ipcRenderer.invoke('look:set', index, look),
  removeLook: (index) => ipcRenderer.invoke('look:remove', index),

  openNewMemo: () => ipcRenderer.invoke('pad:openNew'),
  openMemoIndex: (index) => ipcRenderer.invoke('pad:openIndex', index),
  openTextFile: () => ipcRenderer.invoke('pad:openFile'),
  showList: () => ipcRenderer.invoke('list:show'),
  openSettings: (context) => ipcRenderer.invoke('settings:open', context || {}),
  getSettingsContext: () => ipcRenderer.invoke('settings:getContext'),
  sendSettingsCommand: (cmd) => ipcRenderer.send('settings:command', cmd),
  onSettingsLoad: (callback) => {
    const handler = (_event, context) => callback(context);
    ipcRenderer.on('settings:load', handler);
    return () => ipcRenderer.removeListener('settings:load', handler);
  },
  onSettingsCommand: (callback) => {
    const handler = (_event, cmd) => callback(cmd);
    ipcRenderer.on('settings:command', handler);
    return () => ipcRenderer.removeListener('settings:command', handler);
  },
  hidePad: () => ipcRenderer.invoke('pad:hide'),
  closePad: () => ipcRenderer.invoke('pad:close'),
  notifyPadState: (state) => ipcRenderer.send('pad:state', state),
  previewColor: (color) => ipcRenderer.send('settings:previewColor', color),

  onPadLoad: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('pad:load', handler);
    return () => ipcRenderer.removeListener('pad:load', handler);
  },
  onMemosChanged: (callback) => {
    const handler = (_event, memos) => callback(memos);
    ipcRenderer.on('memos:changed', handler);
    return () => ipcRenderer.removeListener('memos:changed', handler);
  },
  onSettingsChanged: (callback) => {
    const handler = (_event, settings) => callback(settings);
    ipcRenderer.on('settings:changed', handler);
    return () => ipcRenderer.removeListener('settings:changed', handler);
  },
  onPreviewColor: (callback) => {
    const handler = (_event, color) => callback(color);
    ipcRenderer.on('settings:previewColor', handler);
    return () => ipcRenderer.removeListener('settings:previewColor', handler);
  },
  onRestoreLooks: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('settings:restoreLooks', handler);
    return () => ipcRenderer.removeListener('settings:restoreLooks', handler);
  },
  onLanguageChanged: (callback) => {
    const handler = (_event, language) => callback(language);
    ipcRenderer.on('settings:language', handler);
    return () => ipcRenderer.removeListener('settings:language', handler);
  }
});
