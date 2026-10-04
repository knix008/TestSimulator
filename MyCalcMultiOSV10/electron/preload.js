const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mycalcDesktop", {
  windowControl: (action) => ipcRenderer.invoke("mycalc-window", action),
  onWindowState: (handler) => {
    ipcRenderer.on("mycalc-window-state", (_event, state) => handler(state));
  },
});

contextBridge.exposeInMainWorld("mycalcPrint", {
  printers: () => ipcRenderer.invoke("mycalc-printers"),
  print: (options) => ipcRenderer.invoke("mycalc-print", options),
});
