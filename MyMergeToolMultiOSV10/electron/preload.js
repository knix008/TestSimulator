const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  resizeWindow: (width, height) => ipcRenderer.invoke("resize-window", { width: width, height: height }),
  pickFiles: (dir) => ipcRenderer.invoke("pick-files", dir),
  pickDirectory: (dir) => ipcRenderer.invoke("pick-directory", dir),
  writeFile: (file, text) => ipcRenderer.invoke("write-file", { file: file, text: text }),
  listFonts: () => ipcRenderer.invoke("list-fonts"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  print: () => ipcRenderer.invoke("print"),
  gitInspect: (dir) => ipcRenderer.invoke("git-inspect", dir),
  gitRead: (root, file) => ipcRenderer.invoke("git-read", { root: root, file: file }),
  openMenu: (payload) => ipcRenderer.invoke("open-menu", payload),
  openPopup: (payload) => ipcRenderer.invoke("open-popup", payload),
  refreshPopup: (html) => ipcRenderer.invoke("refresh-popup", html),
  readFile: (file) => ipcRenderer.invoke("read-file", file),
  forceClose: (code) => ipcRenderer.invoke("force-close", code),
  onCloseRequest: (callback) => ipcRenderer.on("request-close", () => callback()),
  onHostAction: (callback) => ipcRenderer.on("popup-action", (_event, payload) => callback(payload)),
  onLaunch: (callback) => ipcRenderer.on("launch", (_event, payload) => callback(payload)),
});
