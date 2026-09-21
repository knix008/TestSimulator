"use strict";

const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const fs = require("fs");
const path = require("path");
const { ConnectionManager } = require("./lib/connection-manager");
const { FileLogger } = require("./lib/logger");
const { MetricsPump } = require("./lib/metrics-pump");

let win = null;
let settingsWin = null;
const manager = new ConnectionManager();
let logger = null;
const ICON = path.join(__dirname, "assets", "icon.png");

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function defaultSettings() {
  return { language: "ko", theme: "midnight", intervalMs: 1000, windowSec: 60 };
}

function loadSettings() {
  try {
    return { ...defaultSettings(), ...JSON.parse(fs.readFileSync(settingsPath(), "utf8")) };
  } catch {
    return defaultSettings();
  }
}

function saveSettings(next) {
  const merged = { ...defaultSettings(), ...loadSettings(), ...next };
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(merged, null, 2), "utf8");
  if (merged.intervalMs) manager.setIntervalMs(merged.intervalMs);
  broadcastSettings(merged);
  return merged;
}

function settingsTitle(lang) {
  return lang === "en" ? "Settings — MyMonitor MultiOS" : "설정 — MyMonitor MultiOS";
}

function broadcastSettings(payload) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send("settings:changed", payload);
  }
}

function prefs() {
  return {
    preload: path.join(__dirname, "preload.js"),
    contextIsolation: true,
    nodeIntegration: false,
    spellcheck: false,
    backgroundThrottling: false
  };
}

function openSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return "focused";
  }
  const s = loadSettings();
  settingsWin = new BrowserWindow({
    width: 560,
    height: 540,
    resizable: false,
    minimizable: true,
    maximizable: false,
    backgroundColor: "#0b1220",
    title: settingsTitle(s.language),
    icon: path.join(__dirname, "assets", "settings-icon.png"),
    autoHideMenuBar: true,
    modal: false,
    webPreferences: prefs()
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(__dirname, "renderer", "settings.html"));
  settingsWin.on("page-title-updated", (event) => {
    event.preventDefault();
    const title = settingsTitle(loadSettings().language);
    if (settingsWin.getTitle() !== title) settingsWin.setTitle(title);
  });
  settingsWin.on("closed", () => {
    settingsWin = null;
  });
  return "opened";
}

function closeSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close();
  return true;
}

function appTitle() {
  return `MyMonitor MultiOS v${app.getVersion()}`;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1360,
    minHeight: 720,
    backgroundColor: "#0b1220",
    title: appTitle(),
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: prefs()
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.on("page-title-updated", (event) => {
    event.preventDefault();
    if (win.getTitle() !== appTitle()) win.setTitle(appTitle());
  });
  win.on("closed", () => {
    closeSettingsWindow();
    win = null;
  });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  if (process.platform === "win32") {
    app.setAppUserModelId("com.mymonitor.multios");
  }
  const settings = loadSettings();
  manager.setIntervalMs(settings.intervalMs);
  logger = new FileLogger(path.join(app.getPath("userData"), "logs"));
  createWindow();

  const metricsPump = new MetricsPump((sample) => send("monitor:metrics", sample), 32);
  manager.on("targets", (list) => send("monitor:targets", list));
  manager.on("metrics", (sample) => metricsPump.push(sample));
  manager.on("log", (entry) => {
    const rec = logger.write(entry);
    send("monitor:log", rec);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  manager.stopAll();
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("app:quit", async () => {
  manager.stopAll();
  app.quit();
});
ipcMain.handle("window:min-content-width", async (event, contentWidth) => {
  const target = BrowserWindow.fromWebContents(event.sender);
  if (!target || target.isDestroyed()) return 0;
  const extra = Math.max(0, target.getSize()[0] - target.getContentSize()[0]);
  const minW = Math.max(1360, Math.ceil(Number(contentWidth) || 0) + extra + 16);
  const minH = Math.max(720, target.getMinimumSize()[1] || 720);
  target.setMinimumSize(minW, minH);
  const [curW, curH] = target.getSize();
  if (curW < minW) target.setSize(minW, curH);
  return minW;
});
ipcMain.handle("settings:get", async () => loadSettings());
ipcMain.handle("settings:set", async (_e, next) => saveSettings(next));
ipcMain.handle("settings:open", async () => openSettingsWindow());
ipcMain.handle("settings:close", async () => closeSettingsWindow());
ipcMain.handle("monitor:set-interval", async (_e, ms) => {
  const interval = manager.setIntervalMs(ms);
  return saveSettings({ intervalMs: interval });
});
ipcMain.handle("app:info", async () => ({
  name: "MyMonitor MultiOS",
  version: app.getVersion(),
  author: "SHKWON(knix008@naver.com)",
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch
}));

ipcMain.handle("monitor:start", async (_e, config) => manager.start(config));
ipcMain.handle("monitor:stop", async (_e, id) => manager.stop(id));
ipcMain.handle("monitor:list", async () => manager.snapshot());
ipcMain.handle("monitor:serial-ports", async () => manager.listSerialPorts());
ipcMain.handle("monitor:logs", async () => (logger ? logger.list() : []));
ipcMain.handle("monitor:export-logs", async (_e, format) => {
  const ext = format === "json" ? "json" : format === "csv" ? "csv" : "txt";
  const res = await dialog.showSaveDialog(win, {
    title: "로그 내보내기",
    defaultPath: `mmon-logs.${ext}`,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
  });
  if (res.canceled || !res.filePath) return null;
  logger.exportTo(res.filePath, format);
  return res.filePath;
});
