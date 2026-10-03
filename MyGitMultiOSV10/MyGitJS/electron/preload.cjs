const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mygit", {
  pickDirectory: () => ipcRenderer.invoke("pick-directory"),
  pickSaveDirectory: () => ipcRenderer.invoke("pick-save-directory"),
  pickFile: () => ipcRenderer.invoke("pick-file"),
  openTool: (url, kind) => ipcRenderer.invoke("open-tool", url, kind),
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.invoke("window-minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window-toggle-maximize"),
    close: () => ipcRenderer.invoke("window-close"),
    isMaximized: () => ipcRenderer.invoke("window-is-maximized"),
    themeReady: () => ipcRenderer.send("window-theme-ready"),
    onMaximized: (callback) => {
      const listener = (_event, value) => callback(Boolean(value));
      ipcRenderer.on("window-maximized", listener);
      return () => ipcRenderer.removeListener("window-maximized", listener);
    },
  },
});
