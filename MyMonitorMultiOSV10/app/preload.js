"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("monitor", {
  start: (config) => ipcRenderer.invoke("monitor:start", config),
  stop: (id) => ipcRenderer.invoke("monitor:stop", id),
  list: () => ipcRenderer.invoke("monitor:list"),
  serialPorts: () => ipcRenderer.invoke("monitor:serial-ports"),
  logs: () => ipcRenderer.invoke("monitor:logs"),
  exportLogs: (format) => ipcRenderer.invoke("monitor:export-logs", format),
  quit: () => ipcRenderer.invoke("app:quit"),
  setMinContentWidth: (width) => ipcRenderer.invoke("window:min-content-width", width),
  settingsGet: () => ipcRenderer.invoke("settings:get"),
  settingsSet: (next) => ipcRenderer.invoke("settings:set", next),
  openSettings: () => ipcRenderer.invoke("settings:open"),
  closeSettings: () => ipcRenderer.invoke("settings:close"),
  onSettings: (cb) => {
    const fn = (_e, data) => cb(data);
    ipcRenderer.on("settings:changed", fn);
    return () => ipcRenderer.removeListener("settings:changed", fn);
  },
  setIntervalMs: (ms) => ipcRenderer.invoke("monitor:set-interval", ms),
  appInfo: () => ipcRenderer.invoke("app:info"),
  onTargets: (cb) => {
    const fn = (_e, data) => cb(data);
    ipcRenderer.on("monitor:targets", fn);
    return () => ipcRenderer.removeListener("monitor:targets", fn);
  },
  onMetrics: (cb) => {
    const fn = (_e, data) => cb(data);
    ipcRenderer.on("monitor:metrics", fn);
    return () => ipcRenderer.removeListener("monitor:metrics", fn);
  },
  onLog: (cb) => {
    const fn = (_e, data) => cb(data);
    ipcRenderer.on("monitor:log", fn);
    return () => ipcRenderer.removeListener("monitor:log", fn);
  }
});
