const { app, BrowserWindow, Menu, ipcMain, dialog, clipboard, shell } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { themeBackground } = require("./theme-bg.cjs");

const isProd = app.isPackaged || process.env.MYDIFF_MODE === "prod";
const devUrl = process.env.MYDIFF_UI || "http://127.0.0.1:5174";

if (process.platform === "win32") app.setAppUserModelId("com.mydiff.multi");
Menu.setApplicationMenu(null);

/** `mydiff LEFT RIGHT` — what git difftool passes when MyDiff is the registered tool. */
function pendingPair() {
  const argv = app.isPackaged ? process.argv.slice(1) : process.argv.slice(2);
  const files = argv.filter((item) => item && !item.startsWith("-") && item !== ".");
  if (files.length < 2) return null;
  return { left: files[0], right: files[1] };
}

function settingsFile() {
  const dir = process.env.MYDIFF_SETTINGS_DIR
    || (process.platform === "win32"
      ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "MyDiffJS")
      : process.platform === "darwin"
        ? path.join(os.homedir(), "Library", "Application Support", "MyDiffJS")
        : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "MyDiffJS"));
  return path.join(dir, "settings.json");
}

function savedSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
  } catch {
    return {};
  }
}

function resolveIcon() {
  const names = process.platform === "win32"
    ? ["MyDiff.ico", "icon.ico"]
    : ["MyDiff.png", "icon.png", "MyDiff.ico", "icon.ico"];
  const roots = [
    process.resourcesPath,
    __dirname,
    path.join(__dirname, "..", "build"),
    path.join(__dirname, "..", "public"),
    path.join(__dirname, "..", "..", "Assets"),
  ];
  for (const root of roots) {
    if (!root) continue;
    for (const name of names) {
      const candidate = path.join(root, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

ipcMain.handle("pick-file", async (_event, title) => {
  const result = await dialog.showOpenDialog({ title: title || undefined, properties: ["openFile"] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("pick-directory", async (_event, title) => {
  const result = await dialog.showOpenDialog({ title: title || undefined, properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("copy-text", (_event, value) => {
  clipboard.writeText(String(value ?? ""));
  return true;
});

ipcMain.handle("open-external", (_event, target) => {
  const value = String(target ?? "");
  if (/^https?:\/\//i.test(value)) shell.openExternal(value);
  else if (value) shell.openPath(value);
  return true;
});

async function createWindow(url) {
  const settings = savedSettings();
  const win = new BrowserWindow({
    width: Math.max(Number(settings?.window?.width) || 1280, 900),
    height: Math.max(Number(settings?.window?.height) || 820, 600),
    minWidth: 900,
    minHeight: 600,
    title: "MyDiff",
    icon: resolveIcon(),
    backgroundColor: themeBackground(settings.theme),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.setMenuBarVisibility(false);
  if (settings?.window?.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());
  await win.loadURL(url);
  return win;
}

app.whenReady().then(async () => {
  const pending = pendingPair();
  if (!isProd) {
    if (pending) process.env.MYDIFF_PENDING = JSON.stringify(pending);
    await createWindow(devUrl);
    return;
  }
  const { startServer } = require(path.join(__dirname, "..", "dist-server", "index.cjs"));
  const started = await startServer({
    port: 0,
    staticDir: path.join(__dirname, "..", "dist"),
    pending,
    launcher: process.execPath,
  });
  await createWindow(`http://127.0.0.1:${started.port}`);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow(devUrl);
});
