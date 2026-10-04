const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mycalcDesktop", {
  setContentSize: (mode) => ipcRenderer.send("mycalc-content-size", mode),
  saveFile: (payload) => ipcRenderer.invoke("mycalc-save-file", payload),
  windowControl: (action) => ipcRenderer.invoke("mycalc-window", action),
  setBounds: (bounds) => ipcRenderer.invoke("mycalc-window-bounds", bounds),
  onWindowState: (handler) => {
    ipcRenderer.on("mycalc-window-state", (_event, state) => handler(state));
  },
});
