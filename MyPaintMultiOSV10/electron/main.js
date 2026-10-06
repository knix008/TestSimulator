const { app, BrowserWindow, ipcMain, dialog, shell, Menu, screen, clipboard, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const build = require("../src/build-info");
const metrics = require("../src/metrics");
const fonts = require("../src/fonts");

const iconFile = process.platform === "win32" ? "icon.ico" : (process.platform === "darwin" ? "icon.icns" : "icon.png");
const iconPath = path.join(__dirname, "..", "assets", iconFile);

let mainWindow = null;
let menuChild = null;
let popupChild = null;
let force = false;
const children = new Set();
const KEEP_POPUP = new Set(["print-prev", "print-next", "print-sync", "settings-sync", "palette-sync", "canvas-sync"]);

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

function collectLaunchArgs(argv, packaged) {
  return argv.slice(packaged ? 1 : 2).filter((item) => !String(item).startsWith("--"));
}

function parseLaunchArgs(args) {
  const file = (args || []).find((item) => /\.(mpaint|png|jpg|jpeg|gif|webp|bmp)$/i.test(String(item)));
  if (!file) return { mode: "standalone", file: "" };
  return { mode: /\.mpaint$/i.test(file) ? "drawing" : "image", file: file };
}

function createWindow() {
  const win = new BrowserWindow({
    title: build.title,
    icon: iconPath,
    minWidth: metrics.MIN_WIDTH,
    minHeight: metrics.MIN_HEIGHT,
    width: 1360,
    height: 860,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: "#f3f4f6",
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

/* A menu may run past the edge of the window, but never past the edge of the screen: if it
 * does not fit below the point it was asked for, it opens above it, and failing that it is
 * pushed back inside the work area. */
function fitToScreen(x, y, width, height) {
  const area = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).workArea;
  let left = x;
  let top = y;
  if (left + width > area.x + area.width) left = x - width;
  if (left + width > area.x + area.width) left = area.x + area.width - width;
  if (left < area.x) left = area.x;
  if (top + height > area.y + area.height) top = y - height;
  if (top + height > area.y + area.height) top = area.y + area.height - height;
  if (top < area.y) top = area.y;
  return { x: Math.round(left), y: Math.round(top) };
}

function screenPoint(parent, payload, centered) {
  const origin = parent.getContentBounds();
  const width = Number(payload.width) || 320;
  const height = Number(payload.height) || 200;
  if (!centered) {
    return fitToScreen(origin.x + Number(payload.x || 0), origin.y + Number(payload.y || 0), width, height);
  }
  return fitToScreen(
    origin.x + Math.max(0, (origin.width - width) / 2),
    origin.y + Math.max(0, (origin.height - height) / 2),
    width,
    height,
  );
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

ipcMain.handle("window-command", (event, name) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return false;
  if (name === "minimize") win.minimize();
  else if (name === "close") win.close();
  else if (name === "maximize") {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
  return win.isMaximized();
});

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

ipcMain.handle("pick-files", async (_event, payload) => {
  const options = payload && typeof payload === "object" ? payload : { dir: payload };
  const filters = Array.isArray(options.filters) && options.filters.length
    ? options.filters
    : [{ name: "All files", extensions: ["*"] }];
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: options.dir || undefined,
    properties: ["openFile", "multiSelections"],
    filters: filters,
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle("pick-save", async (_event, payload) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: (payload && payload.path) || undefined,
    filters: [
      { name: "MyPaint", extensions: ["mpaint"] },
      { name: "PNG", extensions: ["png"] },
    ],
  });
  return result.canceled ? "" : result.filePath;
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

ipcMain.handle("write-binary", async (_event, payload) => {
  await fs.promises.writeFile(payload.file, Buffer.from(String(payload.base64 || ""), "base64"));
  return true;
});

/* A picture onto the system clipboard, so what was copied here can be pasted into any other
 * program. Only the image is written: MyPaint keeps its own shapes in its own clipboard, and a
 * text flavour would mean another program pasting MyPaint's internals as text. */
ipcMain.handle("clipboard-write-image", (_event, payload) => {
  const image = nativeImage.createFromDataURL(String((payload && payload.dataUrl) || ""));
  if (image.isEmpty()) return false;
  clipboard.writeImage(image);
  return true;
});

const DOWNLOAD_LIMIT = 256 * 1024 * 1024;

const TYPE_EXTENSIONS = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
  "image/bmp": "bmp", "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico",
  "image/avif": "avif", "image/tiff": "tif", "image/heic": "heic", "image/heif": "heif",
  "image/jp2": "jp2", "image/jpx": "jp2", "application/dicom": "dcm",
};

function nameFromUrl(target, contentType) {
  const last = decodeURIComponent(target.pathname.split("/").filter(Boolean).pop() || "");
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  const guess = TYPE_EXTENSIONS[type];
  if (last && /\.[A-Za-z0-9]{1,5}$/.test(last)) return last;
  const base = last || target.hostname.replace(/[^A-Za-z0-9.-]/g, "") || "download";
  return guess ? base + "." + guess : base;
}

let downloadStop = null;

ipcMain.handle("cancel-download", () => {
  if (downloadStop) downloadStop.abort();
  return true;
});

ipcMain.handle("download-url", async (event, link) => {
  let target;
  try {
    target = new URL(String(link || "").trim());
  } catch (error) {
    throw new Error("That is not a web address.");
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("Only http and https addresses can be downloaded.");
  }
  downloadStop = new AbortController();
  const stop = downloadStop;
  const response = await fetch(target, { redirect: "follow", signal: stop.signal }).catch((error) => {
    if (stop.signal.aborted) throw new Error("The download was stopped.");
    throw error;
  });
  if (!response.ok) throw new Error("The server answered " + response.status + " " + (response.statusText || "") + ".");
  const total = Number(response.headers.get("content-length") || 0);
  if (total > DOWNLOAD_LIMIT) throw new Error("That file is larger than 256 MB.");
  const chunks = [];
  let received = 0;
  let announced = 0;
  const tell = () => {
    if (event.sender.isDestroyed()) return;
    event.sender.send("download-progress", { received: received, total: total });
  };
  const reader = response.body.getReader();
  try {
    for (;;) {
      if (stop.signal.aborted) throw new Error("The download was stopped.");
      const step = await reader.read();
      if (step.done) break;
      chunks.push(Buffer.from(step.value));
      received += step.value.length;
      if (received > DOWNLOAD_LIMIT) throw new Error("That file is larger than 256 MB.");
      if (received - announced >= 32768) {
        announced = received;
        tell();
      }
    }
  } finally {
    if (downloadStop === stop) downloadStop = null;
    try { reader.cancel(); } catch (error) { /* already finished */ }
  }
  tell();
  const buffer = Buffer.concat(chunks, received);
  if (!buffer.length) throw new Error("The address gave back an empty file.");
  return {
    name: nameFromUrl(target, response.headers.get("content-type")),
    type: response.headers.get("content-type") || "",
    url: target.href,
    bytes: received,
    base64: buffer.toString("base64"),
  };
});

ipcMain.handle("read-file", (_event, file) => fs.promises.readFile(file, "utf8"));
ipcMain.handle("read-binary", async (_event, file) => {
  const data = await fs.promises.readFile(file);
  return data.toString("base64");
});

ipcMain.handle("list-fonts", () => listFonts());
ipcMain.handle("open-external", (_event, url) => shell.openExternal(url));
ipcMain.handle("print", (_event, options) => {
  if (!mainWindow) return;
  const opts = options || {};
  mainWindow.webContents.print({
    silent: false,
    printBackground: true,
    copies: Math.max(1, Math.min(99, Number(opts.copies) || 1)),
    landscape: Boolean(opts.landscape),
  });
});

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

ipcMain.handle("apply-theme", (_event, css) => {
  Array.from(children).forEach((child) => {
    if (!child.isDestroyed()) child.webContents.send("popup-theme", css);
  });
});

ipcMain.handle("close-popup", () => {
  closeIf(popupChild);
  popupChild = null;
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
  const launch = parseLaunchArgs(collectLaunchArgs(process.argv, app.isPackaged));
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

module.exports = { collectLaunchArgs: collectLaunchArgs, parseLaunchArgs: parseLaunchArgs, nameFromUrl: nameFromUrl, fitToScreen: fitToScreen };
