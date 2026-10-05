const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("popupHost", {
  onHtml: (callback) => ipcRenderer.on("popup-html", (_event, html) => callback(html)),
  action: (name, detail) => ipcRenderer.send("popup-action", { name: name, detail: detail || {} }),
});
