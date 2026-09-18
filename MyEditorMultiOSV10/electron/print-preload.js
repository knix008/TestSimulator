// Isolated bridge for the printer dialog window (preview + destination).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('medPrint', {
  print: (opts) => ipcRenderer.invoke('print:run', opts && typeof opts === 'object' ? opts : {}),
  cancel: () => ipcRenderer.send('print:cancel'),
});
