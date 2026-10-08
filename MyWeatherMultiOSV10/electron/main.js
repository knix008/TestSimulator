import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, Tray, clipboard, dialog, ipcMain, net, screen, shell } from "electron";
import { parseFcList, parseMacFonts, parseWindowsFonts, resolveFontList } from "../src/core/fonts.js";
import { createI18n } from "../src/core/i18n.js";
import { menuWindowOptions, popupWindowOptions } from "../src/ui/menu-layout.js";
import { themeColors, themeVars, DEFAULT_THEME_ID } from "../src/core/themes.js";
import { buildTrayMenu, placeTrayMenu, trayIconFile, trayMenuSize } from "../src/ui/tray-menu.js";
import { sanitizeSettings } from "../src/core/settings.js";
import { WINDOW_DEFAULT, WINDOW_MIN, placeWindow, recordedWindowPlacement, stampWindowPlacement, windowIsVisible } from "../src/ui/window-spec.js";
import { PopupHub } from "./popup-hub.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconPath = path.join(__dirname, "../assets/icon.png");
const hub = new PopupHub();
const contentsToPopup = new Map();
const menuSpecs = new Map();
let mainWindow = null;
let liveBounds = null;
let tray = null;
let trayMenuWin = null;
let trayMenuAnchor = null;
let trayMenuClosedAt = 0;
let trayCommand = "";
let trayRevealUntil = 0;
let quitting = false;
let resizeStart = null;
let applyingPlacement = false;
let savedPlacementToken = 0;
let recordPlacement = false;
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

function revealWindow(win, onShown) {
  if (!win) return;
  let revealed = false;
  const reveal = () => {
    if (revealed || win.isDestroyed()) return;
    revealed = true;
    hideFromTaskbar(win);
    win.show();
    win.focus();
    if (onShown) setTimeout(onShown, 80);
  };
  win.once("ready-to-show", reveal);
  win.webContents.once("did-finish-load", reveal);
}

function savedWindowPlacement() {
  const settings = sanitizeSettings(readJson(settingsFile()));
  const recorded = recordedWindowPlacement(settings, readJson(windowStateFile()));
  const areas = screen.getAllDisplays().map((display) => display.workArea);
  const saved = {
    x: Number.isFinite(recorded.x) ? recorded.x : undefined,
    y: Number.isFinite(recorded.y) ? recorded.y : undefined,
    width: recorded.width || undefined,
    height: recorded.height || undefined,
  };
  const placed = placeWindow(saved, areas, WINDOW_DEFAULT);
  const onScreen = !Number.isFinite(recorded.x) || windowIsVisible({ x: saved.x, y: saved.y, width: placed.width, height: placed.height }, areas);
  return { ...placed, maximized: Boolean(recorded.maximized) && onScreen };
}

function boundsOf(placement) {
  return {
    x: Math.round(placement.x),
    y: Math.round(placement.y),
    width: Math.round(placement.width),
    height: Math.round(placement.height),
  };
}

/** A transparent frameless window can ignore its first size until setBounds runs after it is shown. */
function holdSavedBounds(win, placement) {
  if (!win || win.isDestroyed() || placement.maximized) return;
  const token = savedPlacementToken;
  const bounds = boundsOf(placement);
  const apply = () => {
    if (token !== savedPlacementToken || win.isDestroyed() || win.isMaximized()) return;
    applyingPlacement = true;
    try {
      win.setBounds(bounds);
    } catch {
      /* shown again once the window is ready */
    } finally {
      applyingPlacement = false;
    }
  };
  apply();
  setTimeout(apply, 0);
  setTimeout(apply, 150);
}

function createMainWindow() {
  const placement = savedWindowPlacement();
  liveBounds = {
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
    maximized: Boolean(placement.maximized),
  };
  const win = new BrowserWindow({
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
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
    title: "MyWeather",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(__dirname, "../src/index.html"));
  holdSavedBounds(win, placement);
  const keepOffTaskbar = () => hideFromTaskbar(win);
  win.once("ready-to-show", () => {
    holdSavedBounds(win, placement);
    if (placement.maximized) win.maximize();
    keepOffTaskbar();
    win.show();
    win.setIgnoreMouseEvents(false);
    keepOffTaskbar();
    sendWindowState(win);
    setTimeout(() => {
      recordPlacement = true;
      if (savedPlacementToken === 0) rememberCurrent();
    }, 200);
  });
  for (const name of ["show", "restore"]) win.on(name, keepOffTaskbar);
  win.on("focus", () => setTimeout(keepOffTaskbar, 250));
  const restoreAfterTray = () => {
    if (Date.now() > trayRevealUntil || win.isDestroyed()) return;
    setTimeout(() => {
      if (Date.now() > trayRevealUntil || win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
      keepOffTaskbar();
    }, 0);
  };
  win.on("hide", restoreAfterTray);
  win.on("minimize", restoreAfterTray);
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
  const rememberCurrent = () => {
    if (!recordPlacement || applyingPlacement || win.isDestroyed()) return;
    const maximized = win.isMaximized();
    const bounds = maximized ? win.getNormalBounds() : win.getBounds();
    noteBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width >= WINDOW_MIN.width ? bounds.width : liveBounds?.width,
      height: bounds.height >= WINDOW_MIN.height ? bounds.height : liveBounds?.height,
      maximized,
    });
  };
  win.on("resized", rememberCurrent);
  win.on("moved", rememberCurrent);
  win.on("maximize", () => noteBounds({ ...liveBounds, maximized: true }));
  win.on("unmaximize", rememberCurrent);
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

function windowStateFile() {
  return path.join(app.getPath("userData"), "window.json");
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function noteBounds(bounds) {
  const width = Math.round(Number(bounds?.width));
  const height = Math.round(Number(bounds?.height));
  const x = Math.round(Number(bounds?.x));
  const y = Math.round(Number(bounds?.y));
  const next = {
    x: Number.isFinite(x) ? x : liveBounds?.x,
    y: Number.isFinite(y) ? y : liveBounds?.y,
    width: width >= WINDOW_MIN.width ? width : liveBounds?.width,
    height: height >= WINDOW_MIN.height ? height : liveBounds?.height,
    maximized: typeof bounds?.maximized === "boolean" ? bounds.maximized : Boolean(liveBounds?.maximized),
  };
  if (!(next.width >= WINDOW_MIN.width) || !(next.height >= WINDOW_MIN.height) || !Number.isFinite(next.x) || !Number.isFinite(next.y)) return liveBounds;
  liveBounds = next;
  try {
    fs.mkdirSync(path.dirname(windowStateFile()), { recursive: true });
    fs.writeFileSync(windowStateFile(), JSON.stringify(liveBounds));
  } catch {
    /* a later resize or quit writes the same rectangle */
  }
  return liveBounds;
}

function currentPlacement() {
  if (recordPlacement && mainWindow && !mainWindow.isDestroyed()) {
    const maximized = mainWindow.isMaximized();
    const bounds = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    return noteBounds({ ...bounds, maximized });
  }
  if (liveBounds && liveBounds.width >= WINDOW_MIN.width && liveBounds.height >= WINDOW_MIN.height && Number.isFinite(liveBounds.x) && Number.isFinite(liveBounds.y)) {
    return { ...liveBounds };
  }
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const maximized = mainWindow.isMaximized();
  const bounds = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
  return noteBounds({ ...bounds, maximized });
}

function writeSettingsFile(settings) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
}

function saveWindowPlacement() {
  const placement = currentPlacement();
  if (!placement) return;
  const settings = stampWindowPlacement(sanitizeSettings(readJson(settingsFile())), placement);
  if (!settings.windowSize) return;
  writeSettingsFile(settings);
}

function revealMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  hideFromTaskbar(mainWindow);
  mainWindow.show();
  mainWindow.focus();
  hideFromTaskbar(mainWindow);
}

function revealMainWindowFromTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  trayRevealUntil = Date.now() + 700;
  mainWindow.setAlwaysOnTop(true);
  mainWindow.show();
  mainWindow.moveTop();
  mainWindow.focus();
  hideFromTaskbar(mainWindow);
}

function finishTrayCommand() {
  const command = trayCommand;
  trayCommand = "";
  if (!command || !mainWindow || mainWindow.isDestroyed()) return;
  revealMainWindowFromTray();
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setAlwaysOnTop(false);
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    hideFromTaskbar(mainWindow);
    mainWindow.webContents.send("menu-command", command);
  }, 280);
}

function closeTrayMenu() {
  trayMenuClosedAt = Date.now();
  trayMenuAnchor = null;
  const win = trayMenuWin;
  trayMenuWin = null;
  if (win && !win.isDestroyed()) {
    win.hide();
    win.close();
    return;
  }
  if (trayCommand) finishTrayCommand();
}

function showTrayMenu() {
  if (!tray) return;
  if (trayMenuWin && !trayMenuWin.isDestroyed()) {
    closeTrayMenu();
    return;
  }
  if (Date.now() - trayMenuClosedAt < 500) return;
  const settings = readJson(settingsFile()) || {};
  const i18n = createI18n(settings.language);
  const items = buildTrayMenu((key) => i18n.t(key));
  const colors = themeColors(settings.theme || DEFAULT_THEME_ID, settings.customTheme);
  const icon = tray.getBounds();
  const area = screen.getDisplayMatching(icon).workArea;
  const placed = placeTrayMenu(icon, trayMenuSize(items), area);
  const win = new BrowserWindow({
    frame: false,
    transparent: true,
    thickFrame: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    x: placed.x,
    y: placed.y,
    width: placed.width,
    height: placed.height,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  trayMenuWin = win;
  trayMenuAnchor = null;
  menuSpecs.set(win.webContents.id, {
    kind: "tray",
    items,
    theme: { vars: themeVars(colors, 0), mode: colors.mode },
  });
  let acceptBlur = false;
  win.on("blur", () => {
    if (acceptBlur && !trayCommand) closeTrayMenu();
  });
  win.on("closed", () => {
    if (trayMenuWin === win) trayMenuWin = null;
    if (trayCommand) finishTrayCommand();
  });
  revealWindow(win, () => {
    acceptBlur = true;
  });
  win.loadFile(path.join(__dirname, "../src/menu-host.html"));
}

function createTray() {
  const iconFile = path.join(__dirname, "..", trayIconFile(process.platform));
  tray = new Tray(iconFile);
  tray.setToolTip("MyWeather");
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
  if (!quitting) saveWindowPlacement();
  quitting = true;
  if (tray) tray.destroy();
  tray = null;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    saveWindowPlacement();
    app.quit();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("window-resize", (_event, step = {}) => {
  if (!mainWindow || mainWindow.isMaximized()) return null;
  savedPlacementToken += 1;
  recordPlacement = true;
  if (step.phase === "start") {
    const bounds = mainWindow.getBounds();
    resizeStart = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width >= WINDOW_MIN.width ? bounds.width : liveBounds?.width,
      height: bounds.height >= WINDOW_MIN.height ? bounds.height : liveBounds?.height,
    };
    return resizeStart;
  }
  if (step.phase === "end") {
    resizeStart = null;
    return currentPlacement();
  }
  if (!resizeStart) resizeStart = mainWindow.getBounds();
  const width = Math.max(WINDOW_MIN.width, Math.round(resizeStart.width + Number(step.dx || 0)));
  const height = Math.max(WINDOW_MIN.height, Math.round(resizeStart.height + Number(step.dy || 0)));
  const next = { x: resizeStart.x, y: resizeStart.y, width, height, maximized: false };
  mainWindow.setBounds(next);
  const actual = mainWindow.getBounds();
  noteBounds({ x: actual.x, y: actual.y, width: actual.width, height: actual.height, maximized: false });
  return { x: actual.x, y: actual.y, width: actual.width, height: actual.height };
});

ipcMain.handle("window-move", (event, step = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed() || win.isMaximized()) return null;
  savedPlacementToken += 1;
  recordPlacement = true;
  if (step.phase === "start") {
    const [x, y] = win.getPosition();
    moveStarts.set(win.id, { x, y });
    return { x, y };
  }
  if (step.phase === "end") {
    moveStarts.delete(win.id);
    const bounds = win.getBounds();
    const noted = noteBounds({
      x: bounds.x,
      y: bounds.y,
      width: liveBounds?.width || bounds.width,
      height: liveBounds?.height || bounds.height,
      maximized: win.isMaximized(),
    });
    return noted || { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, maximized: win.isMaximized() };
  }
  const origin = moveStarts.get(win.id) || (() => {
    const [x, y] = win.getPosition();
    return { x, y };
  })();
  const x = Math.round(origin.x + Number(step.dx || 0));
  const y = Math.round(origin.y + Number(step.dy || 0));
  win.setPosition(x, y);
  const actual = win.getBounds();
  noteBounds({ x: actual.x, y: actual.y, width: actual.width, height: actual.height, maximized: false });
  return { x: actual.x, y: actual.y };
});

ipcMain.handle("list-fonts", () => listSystemFonts());

ipcMain.handle("fetch-url", async (_event, url, options = {}) => {
  const response = await net.fetch(url, { headers: options.headers || {} });
  return { ok: response.ok, status: response.status, text: await response.text() };
});

ipcMain.handle("read-settings", () => readJson(settingsFile()));

ipcMain.handle("write-settings", (_event, data) => {
  const incoming = data && typeof data === "object" ? data : {};
  const placement = currentPlacement();
  if (placement) {
    writeSettingsFile(stampWindowPlacement(incoming, placement));
    return true;
  }
  const previous = readJson(settingsFile()) || {};
  if (!incoming.windowSize && previous.windowSize) incoming.windowSize = previous.windowSize;
  if (!incoming.windowPosition && previous.windowPosition) incoming.windowPosition = previous.windowPosition;
  if (incoming.windowMaximized == null && previous.windowMaximized != null) incoming.windowMaximized = previous.windowMaximized;
  writeSettingsFile(incoming);
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

function imageDialogPath(dir) {
  const text = String(dir || "").trim();
  if (!text) return undefined;
  return text.endsWith("/") || text.endsWith("\\") ? text : text + path.sep;
}

ipcMain.handle("pick-image", async (event, opts = {}) => {
  const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const result = await dialog.showOpenDialog(parent, {
    defaultPath: imageDialogPath(opts.startDir),
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

ipcMain.handle("window-bounds", () => currentPlacement());

ipcMain.handle("confirm-quit", () => {
  saveWindowPlacement();
  quitting = true;
  hub.closeAll();
  mainWindow?.close();
});

ipcMain.handle("clipboard-write", (_event, text) => clipboard.writeText(String(text ?? "")));
ipcMain.handle("clipboard-read", () => clipboard.readText());

ipcMain.handle("begin-popup", (event, spec) => {
  const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const started = hub.begin(spec, (stored) => {
    const parentBounds = parent.getBounds();
    const workArea = screen.getDisplayMatching(parentBounds).workArea;
    const win = new BrowserWindow({
      ...popupWindowOptions(stored, parent, workArea, parentBounds),
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
    revealWindow(win);
    win.loadFile(path.join(__dirname, "../src/popup-host.html"));
    return {
      send(patch) {
        if (!win.isDestroyed()) win.webContents.send("popup-update", patch);
      },
      close() {
        if (!win.isDestroyed()) win.close();
      },
      focus() {
        if (win.isDestroyed()) return;
        if (win.isMinimized()) win.restore();
        win.show();
        win.moveTop();
        win.focus();
      },
    };
  });
  return started;
});

ipcMain.handle("take-popup-spec", (event) => hub.take(contentsToPopup.get(event.sender.id)));
ipcMain.handle("finish-popup", (event, result) => hub.finish(contentsToPopup.get(event.sender.id), result));
ipcMain.handle("update-popup", (_event, id, patch) => hub.update(id, patch));
ipcMain.handle("wait-popup", (_event, id) => hub.wait(id));
ipcMain.handle("end-popup", (_event, id) => hub.finish(id, { action: "close" }));

ipcMain.on("broadcast-theme", (event, payload) => {
  if (!payload || typeof payload !== "object") return;
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.id === event.sender.id) continue;
    win.webContents.send("apply-theme", {
      vars: payload.vars || {},
      mode: payload.mode || "",
      theme: payload.theme || "",
      customTheme: payload.customTheme || null,
      transparency: payload.transparency,
    });
  }
});

ipcMain.on("broadcast-wallpaper", (event, payload) => {
  if (!payload || typeof payload !== "object") return;
  const message = { image: typeof payload.image === "string" ? payload.image : "", opacity: Number(payload.opacity) || 0 };
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.id === event.sender.id) continue;
    win.webContents.send("apply-wallpaper", message);
  }
});

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
  let acceptBlur = false;
  win.on("blur", () => {
    if (acceptBlur && !win.isDestroyed()) win.close();
  });
  revealWindow(win, () => {
    acceptBlur = true;
  });
  win.loadFile(path.join(__dirname, "../src/menu-host.html"));
  return true;
});

ipcMain.handle("take-menu-spec", (event) => menuSpecs.get(event.sender.id) || null);

ipcMain.handle("fit-tray-menu", (event, size = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed() || !tray) return null;
  const icon = tray.getBounds();
  const area = screen.getDisplayMatching(icon).workArea;
  const width = Math.max(1, Math.ceil(Number(size.width) || win.getBounds().width));
  const height = Math.max(1, Math.ceil(Number(size.height) || win.getBounds().height));
  if (!trayMenuAnchor) {
    const placed = placeTrayMenu(icon, { width, height }, area);
    trayMenuAnchor = { x: placed.x, y: placed.y };
    win.setBounds(placed);
    return placed;
  }
  let x = trayMenuAnchor.x;
  let y = trayMenuAnchor.y;
  if (x + width > area.x + area.width) x = area.x + area.width - width;
  if (x < area.x) x = area.x;
  if (y + height > area.y + area.height) y = area.y + area.height - height;
  if (y < area.y) y = area.y;
  const bounds = { x: Math.round(x), y: Math.round(y), width, height };
  win.setBounds(bounds);
  return bounds;
});

ipcMain.on("menu-command", (event, id) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && trayMenuWin && win === trayMenuWin) {
    if (id) trayCommand = id;
    closeTrayMenu();
    return;
  }
  if (id && mainWindow && !mainWindow.isDestroyed()) {
    if (win && win !== mainWindow) revealMainWindow();
    mainWindow.webContents.send("menu-command", id);
  }
  if (win && win !== mainWindow && !win.isDestroyed()) win.close();
});
