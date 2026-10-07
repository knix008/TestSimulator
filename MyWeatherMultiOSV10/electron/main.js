import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, Menu, Tray, clipboard, dialog, ipcMain, nativeImage, net, screen, shell } from "electron";
import { parseFcList, parseMacFonts, parseWindowsFonts, resolveFontList } from "../src/core/fonts.js";
import { createI18n } from "../src/core/i18n.js";
import { menuWindowOptions, popupWindowOptions } from "../src/ui/menu-layout.js";
import { buildTrayMenu, menuIconFile, trayIconFile } from "../src/ui/tray-menu.js";
import { WINDOW_DEFAULT, WINDOW_MIN } from "../src/ui/window-spec.js";
import { PopupHub } from "./popup-hub.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconPath = path.join(__dirname, "../assets/icon.png");
const hub = new PopupHub();
const contentsToPopup = new Map();
const menuSpecs = new Map();
let mainWindow = null;
let tray = null;
let quitting = false;
let resizeStart = null;
const moveStarts = new Map();

app.setName("MyWeather");
if (process.platform === "linux") app.commandLine.appendSwitch("enable-transparent-visuals");

function errorText(title, error) {
  const detail = error && error.stack ? error.stack : String(error);
  return [
    title,
    `Time: ${new Date().toISOString()}`,
    `Application: MyWeather ${app.getVersion()}`,
    `Environment: Electron ${process.versions.electron}, ${process.platform} ${process.arch}`,
    "",
    detail,
  ].join("\n");
}

async function showFatalError(title, error) {
  const text = errorText(title, error);
  console.error(text);
  if (!app.isReady()) return;
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  const options = {
    type: "error",
    title: "MyWeather",
    message: title,
    detail: text,
    buttons: ["Copy / 복사", "Close / 닫기"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  };
  const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
  if (response === 0) clipboard.writeText(text);
}

process.on("uncaughtException", (error) => void showFatalError("Unexpected error in the main process", error));
process.on("unhandledRejection", (reason) => void showFatalError("Unhandled promise rejection in the main process", reason));

function sendWindowState(win) {
  if (win.isDestroyed()) return;
  win.webContents.send("window-state", { maximized: win.isMaximized(), minimized: win.isMinimized() });
}

function hideFromTaskbar(win) {
  if (!win || win.isDestroyed()) return;
  win.setSkipTaskbar(true);
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: WINDOW_DEFAULT.width,
    height: WINDOW_DEFAULT.height,
    minWidth: WINDOW_MIN.width,
    minHeight: WINDOW_MIN.height,
    show: false,
    frame: false,
    transparent: true,
    thickFrame: false,
    resizable: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    skipTaskbar: true,
    title: "MyWeather V1.0",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(__dirname, "../src/index.html"));
  const keepOffTaskbar = () => hideFromTaskbar(win);
  win.once("ready-to-show", () => {
    keepOffTaskbar();
    win.show();
    win.setIgnoreMouseEvents(false);
    keepOffTaskbar();
  });
  for (const name of ["show", "restore"]) win.on(name, keepOffTaskbar);
  win.on("focus", () => setTimeout(keepOffTaskbar, 250));
  for (const name of ["maximize", "unmaximize", "minimize", "restore"]) win.on(name, () => sendWindowState(win));
  win.webContents.on("render-process-gone", (_event, details) =>
    void showFatalError("The window renderer stopped", new Error(`${details.reason} (exit code ${details.exitCode})`)),
  );
  win.webContents.on("did-fail-load", (_event, code, description, url) =>
    void showFatalError("The window failed to load", new Error(`${description} (${code}) ${url}`)),
  );
  win.webContents.on("preload-error", (_event, preloadPath, error) => void showFatalError(`Preload failed: ${preloadPath}`, error));
  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    win.webContents.send("request-close");
  });
  return win;
}

function listSystemFonts() {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      execFile(
        "powershell",
        ["-NoProfile", "-Command", "Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }"],
        { maxBuffer: 10 * 1024 * 1024, windowsHide: true },
        (error, stdout) => resolve(error ? resolveFontList([]) : parseWindowsFonts(stdout)),
      );
      return;
    }
    if (process.platform === "darwin") {
      execFile("system_profiler", ["SPFontsDataType"], { maxBuffer: 20 * 1024 * 1024 }, (error, stdout) =>
        resolve(error ? resolveFontList([]) : parseMacFonts(stdout)),
      );
      return;
    }
    execFile("fc-list", [":", "family"], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout) =>
      resolve(error ? resolveFontList([]) : parseFcList(stdout)),
    );
  });
}

function settingsFile() {
  return path.join(app.getPath("userData"), "settings.json");
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function menuImage(name) {
  const image = nativeImage.createFromPath(path.join(__dirname, "..", menuIconFile(name)));
  return image.isEmpty() ? undefined : image.resize({ width: 16, height: 16 });
}

function revealMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  hideFromTaskbar(mainWindow);
  mainWindow.show();
  mainWindow.focus();
  hideFromTaskbar(mainWindow);
}

function dispatchTrayCommand(id) {
  revealMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("menu-command", id);
}

function toTrayTemplate(entry) {
  if (entry.type === "separator") return { type: "separator" };
  const template = { label: entry.label, icon: menuImage(entry.icon), enabled: true };
  if (entry.submenu) template.submenu = entry.submenu.map(toTrayTemplate);
  else template.click = () => dispatchTrayCommand(entry.id);
  return template;
}

function showTrayMenu() {
  if (!tray) return;
  const settings = readJson(settingsFile());
  const i18n = createI18n(settings?.language);
  tray.popUpContextMenu(Menu.buildFromTemplate(buildTrayMenu((key) => i18n.t(key)).map(toTrayTemplate)));
}

function createTray() {
  const iconFile = path.join(__dirname, "..", trayIconFile(process.platform));
  tray = new Tray(iconFile);
  tray.setToolTip("MyWeather V1.0");
  tray.on("click", showTrayMenu);
  tray.on("right-click", showTrayMenu);
}

app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(iconPath);
    app.dock.hide();
  }
  createTray();
  mainWindow = createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
  });
});

app.on("before-quit", () => {
  quitting = true;
  if (tray) tray.destroy();
  tray = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("window-resize", (_event, step = {}) => {
  if (!mainWindow || mainWindow.isMaximized()) return null;
  if (step.phase === "start") {
    resizeStart = mainWindow.getBounds();
    return resizeStart;
  }
  if (step.phase === "end") {
    resizeStart = null;
    return mainWindow.getBounds();
  }
  if (!resizeStart) resizeStart = mainWindow.getBounds();
  const width = Math.max(WINDOW_MIN.width, Math.round(resizeStart.width + Number(step.dx || 0)));
  const height = Math.max(WINDOW_MIN.height, Math.round(resizeStart.height + Number(step.dy || 0)));
  mainWindow.setBounds({ x: resizeStart.x, y: resizeStart.y, width, height });
  return { width, height };
});

ipcMain.handle("window-move", (event, step = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed() || win.isMaximized()) return null;
  if (step.phase === "start") {
    const [x, y] = win.getPosition();
    moveStarts.set(win.id, { x, y });
    return { x, y };
  }
  if (step.phase === "end") {
    moveStarts.delete(win.id);
    const [x, y] = win.getPosition();
    return { x, y };
  }
  const origin = moveStarts.get(win.id) || (() => {
    const [x, y] = win.getPosition();
    return { x, y };
  })();
  const x = Math.round(origin.x + Number(step.dx || 0));
  const y = Math.round(origin.y + Number(step.dy || 0));
  win.setPosition(x, y);
  return { x, y };
});

ipcMain.handle("list-fonts", () => listSystemFonts());

ipcMain.handle("fetch-url", async (_event, url, options = {}) => {
  const response = await net.fetch(url, { headers: options.headers || {} });
  return { ok: response.ok, status: response.status, text: await response.text() };
});

ipcMain.handle("read-settings", () => readJson(settingsFile()));

ipcMain.handle("write-settings", (_event, data) => {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(data, null, 2));
  return true;
});

ipcMain.handle("open-file", async (event, opts = {}) => {
  const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const result = await dialog.showOpenDialog(parent, {
    defaultPath: opts.startDir || undefined,
    filters: [{ name: "MyWeather", extensions: ["myweather"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  return { path: filePath, directory: path.dirname(filePath), text: fs.readFileSync(filePath, "utf8") };
});

ipcMain.handle("save-file", async (event, opts = {}) => {
  const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const result = await dialog.showSaveDialog(parent, {
    defaultPath: opts.startDir ? path.join(opts.startDir, opts.suggestedName || "weather.myweather") : opts.suggestedName,
    filters: [{ name: "MyWeather", extensions: ["myweather", "json"] }],
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, opts.text ?? "", "utf8");
  return { path: result.filePath, directory: path.dirname(result.filePath) };
});

ipcMain.handle("read-file", (_event, filePath) => fs.readFileSync(filePath, "utf8"));

ipcMain.handle("write-file", (_event, filePath, text) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text ?? "", "utf8");
  return { path: filePath, directory: path.dirname(filePath) };
});

ipcMain.handle("pick-image", async (event, opts = {}) => {
  const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const result = await dialog.showOpenDialog(parent, {
    defaultPath: opts.startDir || undefined,
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const data = fs.readFileSync(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase() || "png";
  const mime = ext === "svg" ? "image/svg+xml" : ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  return {
    dataUrl: `data:${mime};base64,${data.toString("base64")}`,
    name: path.basename(filePath),
    type: mime,
    size: data.length,
    directory: path.dirname(filePath),
  };
});

ipcMain.handle("print", async (event, payload) => {
  const parent = BrowserWindow.fromWebContents(event.sender);
  const printWindow = new BrowserWindow({
    parent: parent || mainWindow,
    show: false,
    skipTaskbar: true,
    webPreferences: { sandbox: true },
  });
  await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(payload.html || "")}`);
  return new Promise((resolve) => {
    printWindow.webContents.print({ silent: false, printBackground: true }, () => {
      printWindow.close();
      resolve(true);
    });
  });
});

ipcMain.handle("open-external", (_event, url) => shell.openExternal(url));

ipcMain.handle("window-control", (_event, action) => {
  if (!mainWindow) return;
  if (action === "minimize") mainWindow.minimize();
  if (action === "maximize") mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  if (action === "close") mainWindow.close();
  sendWindowState(mainWindow);
});

ipcMain.handle("confirm-quit", () => {
  quitting = true;
  hub.closeAll();
  mainWindow?.close();
});

ipcMain.handle("clipboard-write", (_event, text) => clipboard.writeText(String(text ?? "")));
ipcMain.handle("clipboard-read", () => clipboard.readText());

ipcMain.handle("begin-popup", (event, spec) => {
  const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const id = hub.begin(spec, (stored) => {
    const bounds = screen.getDisplayMatching(parent.getBounds()).bounds;
    const win = new BrowserWindow({
      ...popupWindowOptions(stored, parent, bounds),
      icon: iconPath,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    const contentsId = win.webContents.id;
    contentsToPopup.set(contentsId, stored.popupId);
    win.on("closed", () => {
      contentsToPopup.delete(contentsId);
      if (hub.windows.has(stored.popupId)) hub.finish(stored.popupId, { action: "close" });
    });
    win.loadFile(path.join(__dirname, "../src/popup-host.html"));
    return {
      send(patch) {
        if (!win.isDestroyed()) win.webContents.send("popup-update", patch);
      },
      close() {
        if (!win.isDestroyed()) win.close();
      },
    };
  });
  return id;
});

ipcMain.handle("take-popup-spec", (event) => hub.take(contentsToPopup.get(event.sender.id)));
ipcMain.handle("finish-popup", (event, result) => hub.finish(contentsToPopup.get(event.sender.id), result));
ipcMain.handle("update-popup", (_event, id, patch) => hub.update(id, patch));
ipcMain.handle("wait-popup", (_event, id) => hub.wait(id));
ipcMain.handle("end-popup", (_event, id) => hub.finish(id, { action: "close" }));

ipcMain.on("popup-immediate", (event, message) => {
  const popupId = contentsToPopup.get(event.sender.id) || message.popupId;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("popup-immediate", { ...message, popupId });
});

ipcMain.handle("show-menu", (event, payload) => {
  const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const options = menuWindowOptions(payload.layout, parent);
  const area = screen.getDisplayNearestPoint({ x: options.x, y: options.y }).workArea;
  options.x = Math.max(area.x, Math.min(options.x, area.x + area.width - options.width));
  if (options.y + options.height > area.y + area.height) options.y = Math.max(area.y, options.y - options.height);
  const win = new BrowserWindow({
    ...options,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  menuSpecs.set(win.webContents.id, payload);
  win.on("blur", () => {
    if (!win.isDestroyed()) win.close();
  });
  win.loadFile(path.join(__dirname, "../src/menu-host.html"));
  return true;
});

ipcMain.handle("take-menu-spec", (event) => menuSpecs.get(event.sender.id) || null);

ipcMain.on("menu-command", (event, id) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("menu-command", id);
  if (win && win !== mainWindow && !win.isDestroyed()) win.close();
});
