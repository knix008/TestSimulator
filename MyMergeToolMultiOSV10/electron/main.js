const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const build = require("../src/build-info");
const metrics = require("../src/metrics");
const gitplan = require("../src/gitplan");
const fonts = require("../src/fonts");
const git = require("./git-service");

const iconFile = process.platform === "win32" ? "icon.ico" : (process.platform === "darwin" ? "icon.icns" : "icon.png");
const iconPath = path.join(__dirname, "..", "assets", iconFile);

let mainWindow = null;
let menuChild = null;
let popupChild = null;
let force = false;
const children = new Set();
const KEEP_POPUP = new Set(["print-prev", "print-next", "print-sync"]);

function track(child) {
  children.add(child);
  child.on("closed", () => children.delete(child));
  return child;
}

function closeChildren() {
  Array.from(children).forEach((child) => {
    if (!child.isDestroyed()) child.close();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    title: build.title,
    icon: iconPath,
    minWidth: metrics.MIN_WIDTH,
    minHeight: metrics.MIN_HEIGHT,
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    backgroundColor: "#14181f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "..", "index.html"));
  win.on("close", (event) => {
    if (force) return;
    event.preventDefault();
    win.webContents.send("request-close");
  });
  win.on("closed", () => {
    closeChildren();
    if (mainWindow === win) mainWindow = null;
  });
  mainWindow = win;
  return win;
}

function closeIf(win) {
  if (win && !win.isDestroyed()) win.close();
}

function childWindow(payload, file, parent) {
  const owner = parent || mainWindow;
  const menu = file === "menu.html";
  const win = track(new BrowserWindow({
    parent: owner || undefined,
    title: payload.title || build.title,
    icon: iconPath,
    width: payload.width,
    height: payload.height,
    x: Math.round(Number(payload.x) || 0),
    y: Math.round(Number(payload.y) || 0),
    resizable: false,
    minimizable: false,
    maximizable: false,
    useContentSize: true,
    show: false,
    autoHideMenuBar: true,
    skipTaskbar: true,
    frame: false,
    transparent: true,
    roundedCorners: true,
    backgroundColor: "#00000000",
    alwaysOnTop: menu,
    webPreferences: {
      preload: path.join(__dirname, "popup-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  }));
  if (menu) win.on("blur", () => closeIf(win));
  win.loadFile(path.join(__dirname, "..", file));
  win.webContents.on("did-finish-load", () => {
    if (win.isDestroyed()) return;
    win.webContents.send("popup-html", payload.html || "");
    win.show();
  });
  return win;
}

function screenPoint(parent, payload, centered) {
  const origin = parent.getContentBounds();
  const width = Number(payload.width) || 320;
  const height = Number(payload.height) || 200;
  if (!centered) {
    return {
      x: Math.round(origin.x + Number(payload.x || 0)),
      y: Math.round(origin.y + Number(payload.y || 0)),
    };
  }
  return {
    x: Math.round(origin.x + Math.max(0, (origin.width - width) / 2)),
    y: Math.round(origin.y + Math.max(0, (origin.height - height) / 2)),
  };
}

function listFonts() {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      execFile("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"], { windowsHide: true }, (error, stdout) => {
        execFile("reg", ["query", "HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"], { windowsHide: true }, (error2, stdout2) => {
          resolve(fonts.parseWindowsFontQuery(String(stdout || "") + "\n" + String(stdout2 || "")));
        });
      });
      return;
    }
    execFile("fc-list", [":", "family"], { windowsHide: true }, (error, stdout) => {
      if (error || !stdout) {
        resolve(fonts.FALLBACK.slice());
        return;
      }
      const names = stdout.split(/\r?\n/).map((line) => line.split(",")[0].trim()).filter(Boolean);
      resolve(fonts.uniqueFamilies(names));
    });
  });
}

app.setName(build.name);
app.setAppUserModelId(metrics.APP_ID);

ipcMain.handle("resize-window", (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed() || win.isMaximized()) return;
  const bounds = win.getBounds();
  const min = win.getMinimumSize();
  win.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: Math.max(min[0], Math.round(Number(payload.width) || bounds.width)),
    height: Math.max(min[1], Math.round(Number(payload.height) || bounds.height)),
  });
});

ipcMain.handle("pick-files", async (_event, dir) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: dir || undefined,
    properties: ["openFile", "multiSelections"],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle("pick-directory", async (_event, dir) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: dir || undefined,
    properties: ["openDirectory"],
  });
  return result.canceled ? "" : result.filePaths[0];
});

ipcMain.handle("write-file", async (_event, payload) => {
  await fs.promises.writeFile(payload.file, payload.text, "utf8");
  return true;
});

ipcMain.handle("read-file", (_event, file) => fs.promises.readFile(file, "utf8"));

ipcMain.handle("list-fonts", () => listFonts());
ipcMain.handle("open-external", (_event, url) => shell.openExternal(url));
ipcMain.handle("print", () => {
  if (mainWindow) mainWindow.webContents.print({ silent: false, printBackground: true });
});

ipcMain.handle("git-inspect", async (_event, dir) => {
  const info = await git.inspect(dir);
  return {
    root: info.root,
    branch: info.branch,
    conflicts: gitplan.conflictPaths(info.porcelain),
  };
});

ipcMain.handle("git-read", (_event, payload) => git.readStages(payload.root, payload.file));
ipcMain.handle("open-menu", (event, payload) => {
  const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  closeIf(menuChild);
  const point = screenPoint(parent, payload, false);
  menuChild = childWindow(Object.assign({}, payload, point), "menu.html", parent);
});
ipcMain.handle("open-popup", (event, payload) => {
  const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  closeIf(menuChild);
  closeIf(popupChild);
  const point = screenPoint(parent, payload, !payload.anchor);
  popupChild = childWindow(Object.assign({}, payload, point), "popup.html", parent);
});
ipcMain.handle("refresh-popup", (_event, html) => {
  if (popupChild && !popupChild.isDestroyed()) popupChild.webContents.send("popup-html", html);
});
ipcMain.handle("force-close", (_event, code) => {
  force = true;
  closeChildren();
  app.exit(Number(code) || 0);
});

ipcMain.on("popup-action", (event, payload) => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("popup-action", payload);
  const keep = payload && KEEP_POPUP.has(payload.name);
  if (!keep && owner && owner !== mainWindow && !owner.isDestroyed()) owner.close();
});

app.whenReady().then(() => {
  createWindow();
  const launch = gitplan.parseLaunchArgs(gitplan.collectLaunchArgs(process.argv, app.isPackaged));
  mainWindow.webContents.on("did-finish-load", () => {
    if (launch.mode !== "standalone") mainWindow.webContents.send("launch", launch);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
