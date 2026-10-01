const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { themeBackground } = require("./theme-bg.cjs");

const isProd = app.isPackaged || process.env.MYGIT_MODE === "prod";
const uiUrl = process.env.MYGIT_UI || "http://127.0.0.1:5173";

if (process.platform === "win32") app.setAppUserModelId("com.mygit.multi");
Menu.setApplicationMenu(null);

function resolveIcon() {
  const names = process.platform === "win32" ? ["MyGit.ico", "icon.ico"] : ["MyGit.png", "icon.png", "MyGit.ico", "icon.ico"];
  const roots = [process.resourcesPath, __dirname, path.join(__dirname, "..", "..", "Assets"), path.join(__dirname, "..", "build")];
  for (const root of roots) {
    for (const name of names) {
      const candidate = path.join(root, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

ipcMain.handle("pick-file", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: process.platform === "win32"
      ? [{ name: "Programs", extensions: ["exe", "cmd", "bat"] }]
      : undefined,
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("pick-directory", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("pick-save-directory", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("window-minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle("window-toggle-maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return win.isMaximized();
});

ipcMain.handle("window-close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.handle("window-is-maximized", (event) => {
  return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
});

ipcMain.on("window-theme-ready", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed() && !win.isVisible()) win.show();
});

function savedWindowBackground() {
  try {
    const dir = process.env.MYGIT_SETTINGS_DIR
      || (process.platform === "win32"
        ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "MyGitJS")
        : process.platform === "darwin"
          ? path.join(os.homedir(), "Library", "Application Support", "MyGitJS")
          : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "MyGitJS"));
    const data = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
    return themeBackground(data.theme);
  } catch {
    return themeBackground("light-classic");
  }
}

async function createWindow(url) {
  const win = new BrowserWindow({
    width: 1640,
    height: 900,
    minWidth: 680,
    minHeight: 640,
    title: "MyGit",
    icon: resolveIcon(),
    backgroundColor: savedWindowBackground(),
    show: false,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.setMenuBarVisibility(false);
  const sendMaximized = () => win.webContents.send("window-maximized", win.isMaximized());
  win.on("maximize", sendMaximized);
  win.on("unmaximize", sendMaximized);
  const reveal = setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) win.show();
  }, 4000);
  win.once("closed", () => clearTimeout(reveal));
  await win.loadURL(url);
}

app.whenReady().then(async () => {
  if (!isProd) {
    await createWindow(uiUrl);
    return;
  }
  const { startServer } = require(path.join(__dirname, "..", "dist-server", "index.cjs"));
  const started = await startServer({
    port: 0,
    staticDir: path.join(__dirname, "..", "dist"),
  });
  await createWindow(`http://127.0.0.1:${started.port}`);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(isProd ? "http://127.0.0.1:4730" : uiUrl);
  }
});
