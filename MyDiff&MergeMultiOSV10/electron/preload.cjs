// The only surface the renderer gets. Everything else goes over HTTP to the app's own
// server, which the web build talks to as well — so the renderer has one code path and
// this bridge only covers what a browser genuinely cannot do.
const { contextBridge, ipcRenderer, webFrame } = require("electron");

const on = (channel) => (listener) => {
  const wrapped = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

contextBridge.exposeInMainWorld("mdm", {
  desktop: true,
  platform: process.platform,

  info: () => ipcRenderer.invoke("app:info"),
  quit: () => ipcRenderer.invoke("app:quit"),

  setTitle: (title) => ipcRenderer.invoke("window:title", title),
  setMinimumSize: (width, height) => ipcRenderer.invoke("window:min-size", width, height),
  setBackgroundColor: (color) => ipcRenderer.invoke("window:background", color),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  resizeWindowTo: (width, height) => ipcRenderer.invoke("window:resize-to", width, height),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:maximize-toggle"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  onWindowState: on("window:state"),
  setNativeTheme: (kind) => ipcRenderer.invoke("theme:native", kind),
  /** Keeps Chromium's own zoom at 1 so the app's zoom setting is the only one. */
  resetZoom: () => webFrame.setZoomFactor(1),

  pickFile: (options) => ipcRenderer.invoke("pick:file", options || {}),
  pickDirectory: (options) => ipcRenderer.invoke("pick:directory", options || {}),
  pickSave: (options) => ipcRenderer.invoke("pick:save", options || {}),

  copyText: (value) => ipcRenderer.invoke("clipboard:write", value),
  readText: () => ipcRenderer.invoke("clipboard:read"),
  openExternal: (target) => ipcRenderer.invoke("shell:open", target),
  revealInFolder: (target) => ipcRenderer.invoke("shell:reveal", target),

  mergeSaved: () => ipcRenderer.invoke("merge:saved"),
  print: (options) => ipcRenderer.invoke("print:now", options || {}),

  /* --------------------------------------------------- menus and dialogs */
  openMenu: (payload, anchor) => ipcRenderer.invoke("menu:open", payload, anchor),
  closeMenu: () => ipcRenderer.invoke("menu:close"),
  menuPayload: () => ipcRenderer.invoke("menu:payload"),
  menuSize: (size) => ipcRenderer.invoke("menu:size", size),
  chooseMenu: (commandId) => ipcRenderer.invoke("menu:choose", commandId),
  onMenuPayload: on("menu:payload"),
  onMenuChosen: on("menu:chosen"),

  openDialog: (name, payload) => ipcRenderer.invoke("dialog:open", name, payload),
  dialogPayload: () => ipcRenderer.invoke("dialog:payload"),
  dialogResult: (name, result) => ipcRenderer.invoke("dialog:result", name, result),
  closeDialog: (name) => ipcRenderer.invoke("dialog:close", name),
  closeAllDialogs: () => ipcRenderer.invoke("dialog:close-all"),
  dialogSize: (size) => ipcRenderer.invoke("dialog:size", size),
  onDialogPayload: on("dialog:payload"),
  onDialogResult: on("dialog:result"),
  onDialogClosed: on("dialog:closed"),

  broadcastSettings: (settings) => ipcRenderer.invoke("settings:broadcast", settings),
  onSettingsChanged: on("settings:changed"),
  onOpenRequest: on("app:open-request"),
});
