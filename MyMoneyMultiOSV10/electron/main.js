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
import {
  MAX_EXTRA_WINDOWS,
  WINDOW_FIELDS,
  WINDOW_LIST_FIELD,
  sanitizeBoard,
  sanitizeSettings,
  sanitizeWindowSlots,
  sharedSettings,
  windowLabel,
} from "../src/core/settings.js";
import { WINDOW_DEFAULT, WINDOW_MIN, isUsableSize, placeWindow, recordedWindowPlacement, stampWindowPlacement, windowIsVisible } from "../src/ui/window-spec.js";
import { PopupHub } from "./popup-hub.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconPath = path.join(__dirname, "../assets/icon.png");
const hub = new PopupHub();
const contentsToPopup = new Map();
const menuSpecs = new Map();
/**
 * Every market window and the slot it keeps its board under. The first window
 * is slot "main": its board is `defaultBoard` and its rectangle is the saved
 * window placement. Every other window has a slot in `settings.windows`.
 */
const MAIN_SLOT = "main";
const moneyWindows = new Map();
/** Menu and popup windows route their result back to the market window that opened them. */
const windowOwners = new Map();
const resizeStarts = new Map();
const slotBoundsTimers = new Map();
let mainWindow = null;
/** The market window a tray command goes to: the one used last. */
let activeWindow = null;
let liveBounds = null;
let tray = null;
let trayMenuWin = null;
let trayMenuAnchor = null;
let trayMenuClosedAt = 0;
let trayCommand = "";
let trayRevealUntil = 0;
let windowCascade = 0;
let quitting = false;
const moveStarts = new Map();

app.setName("MyMoney");
if (process.platform === "win32") app.setAppUserModelId("com.shkwon.mymoney");
if (process.platform === "linux") app.commandLine.appendSwitch("enable-transparent-visuals");

/**
 * One copy at a time. Two of them share settings.json, window.json and one
 * Chromium cache directory, so the second would overwrite the first's
 * watchlists and lose its own cache. A duplicate launch says so and leaves the
 * running copy alone; the message points at the tray because the close button
 * only hides the windows.
 *
 * `--multi` and MYMONEY_MULTI are for driving a second copy while developing.
 * They are ignored in a packaged build, and they move the duplicate to its own
 * user data folder so the two never write over each other.
 */
const allowMultipleInstances =
  !app.isPackaged &&
  (process.argv.includes("--multi") || ["1", "true", "yes"].includes(String(process.env.MYMONEY_MULTI || "").toLowerCase()));
const singleInstance = allowMultipleInstances || app.requestSingleInstanceLock();
if (allowMultipleInstances) {
  app.setPath("userData", `${app.getPath("userData")}-pid-${process.pid}`);
}

/** The duplicate has no window to speak through, so it uses the saved language. */
function tellAlreadyRunning() {
  const i18n = createI18n(sanitizeSettings(readJson(settingsFile())).language);
  const t = (key) => i18n.t(key);
  dialog.showMessageBoxSync({
    type: "info",
    title: app.getName(),
    message: t("msg.alreadyRunning"),
    detail: t("msg.alreadyRunningHint"),
    buttons: [t("btn.ok")],
    noLink: true,
  });
}

function errorText(title, error) {
  const detail = error && error.stack ? error.stack : String(error);
  return [
    title,
    `Time: ${new Date().toISOString()}`,
    `Application: MyMoney ${app.getVersion()}`,
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
    title: "MyMoney",
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

function slotOf(win) {
  return moneyWindows.get(win)?.slot || "";
}

function isPrimary(win) {
  return Boolean(win) && win === mainWindow;
}

/** The market window a request came from, directly or through one of its popups. */
function moneyWindowOf(sender) {
  const direct = BrowserWindow.fromWebContents(sender);
  if (direct && moneyWindows.has(direct)) return direct;
  const owner = windowOwners.get(sender.id);
  if (owner && !owner.isDestroyed()) return owner;
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

/** A stable key for the window a dialog belongs to; the hub stores it as a string. */
function ownerKey(win) {
  return win && !win.isDestroyed() ? `win-${win.id}` : "";
}

function liveWindows() {
  return [...moneyWindows.keys()].filter((win) => !win.isDestroyed());
}

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

/** Extra windows step down and right from the first one instead of covering it. */
function cascadedPlacement() {
  const base = savedWindowPlacement();
  windowCascade = (windowCascade % 8) + 1;
  const step = 32 * windowCascade;
  const area = screen.getDisplayMatching({ x: base.x, y: base.y, width: base.width, height: base.height }).workArea;
  const x = Math.min(base.x + step, area.x + area.width - base.width);
  const y = Math.min(base.y + step, area.y + area.height - base.height);
  return {
    x: Math.max(area.x, Math.round(x)),
    y: Math.max(area.y, Math.round(y)),
    width: base.width,
    height: base.height,
    maximized: false,
  };
}

/** Where an extra window goes: its own last rectangle, or a step off the first window. */
function slotPlacement(slot) {
  const bounds = slot?.bounds;
  if (!bounds) return cascadedPlacement();
  const areas = screen.getAllDisplays().map((display) => display.workArea);
  return { ...placeWindow(bounds, areas, WINDOW_DEFAULT), maximized: false };
}

function readSlots() {
  return sanitizeWindowSlots(readJson(settingsFile())?.[WINDOW_LIST_FIELD]);
}

/** Read, change and write the slot list in one step, so two windows never undo each other. */
function editSlots(change) {
  const stored = readJson(settingsFile()) || {};
  const slots = sanitizeWindowSlots(stored[WINDOW_LIST_FIELD]);
  const next = change(slots) || slots;
  stored[WINDOW_LIST_FIELD] = next;
  writeSettingsFile(stored);
  return next;
}

/** An extra window's rectangle is kept in its slot a moment after it stops moving. */
function rememberSlotBounds(win) {
  const slot = slotOf(win);
  if (!slot || slot === MAIN_SLOT || win.isDestroyed()) return;
  clearTimeout(slotBoundsTimers.get(slot));
  slotBoundsTimers.set(
    slot,
    setTimeout(() => {
      slotBoundsTimers.delete(slot);
      if (win.isDestroyed() || quitting) return;
      const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
      editSlots((slots) => slots.map((entry) => (entry.id === slot ? { ...entry, bounds: { ...bounds } } : entry)));
    }, 250),
  );
}

function newSlotId() {
  const taken = new Set(readSlots().map((entry) => entry.id));
  let id = "";
  do id = `w${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  while (taken.has(id));
  return id;
}

/**
 * A market window. `slot` is MAIN_SLOT for the first window and a slot id for
 * the others; the slot decides which board read-settings hands the page.
 */
function createMainWindow(slot = MAIN_SLOT, slotEntry = null) {
  const first = slot === MAIN_SLOT;
  const placement = first ? savedWindowPlacement() : slotPlacement(slotEntry);
  if (first) {
    liveBounds = {
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      maximized: Boolean(placement.maximized),
    };
  }
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
    title: "MyMoney V1.0",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  const winId = win.id;
  moneyWindows.set(win, { slot });
  if (first) mainWindow = win;
  activeWindow = win;
  win.loadFile(path.join(__dirname, "../src/index.html"));
  const keepOffTaskbar = () => hideFromTaskbar(win);
  win.once("ready-to-show", () => {
    if (first && placement.maximized) win.maximize();
    keepOffTaskbar();
    win.show();
    win.setIgnoreMouseEvents(false);
    keepOffTaskbar();
    sendWindowState(win);
  });
  for (const name of ["show", "restore"]) win.on(name, keepOffTaskbar);
  win.on("focus", () => {
    activeWindow = win;
    setTimeout(keepOffTaskbar, 250);
  });
  const restoreAfterTray = () => {
    if (Date.now() > trayRevealUntil || win.isDestroyed() || win !== activeWindow) return;
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
  // The close button only puts the window away. The program keeps running in
  // the tray and ends from the tray menu.
  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    hideMoneyWindow(win);
  });
  win.on("closed", () => {
    moneyWindows.delete(win);
    resizeStarts.delete(winId);
    moveStarts.delete(winId);
    for (const [id, owner] of [...windowOwners]) if (owner === win) windowOwners.delete(id);
    if (activeWindow === win) activeWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : liveWindows()[0] || null;
    if (mainWindow === win) mainWindow = null;
  });
  const rememberCurrent = () => {
    if (win.isDestroyed()) return;
    if (!first) {
      rememberSlotBounds(win);
      return;
    }
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
  win.on("maximize", () => {
    if (first) noteBounds({ ...liveBounds, maximized: true });
  });
  win.on("unmaximize", rememberCurrent);
  return win;
}

/** A new window with its own board, which starts as the starter watchlist. */
function openNewWindow() {
  if (readSlots().length >= MAX_EXTRA_WINDOWS) return null;
  const id = newSlotId();
  const entry = { id, board: sanitizeBoard(null), bounds: null };
  editSlots((slots) => [...slots, entry]);
  return createMainWindow(id, entry);
}

/** Put a window away. Its board and its place stay; the tray brings it back. */
function hideMoneyWindow(win) {
  if (!win || win.isDestroyed()) return;
  if (isPrimary(win)) saveWindowPlacement();
  else rememberSlotBounds(win);
  hub.closeOwned(ownerKey(win));
  win.hide();
}

/** Remove an extra window for good, board and all. The first window cannot be removed. */
function removeMoneyWindow(win) {
  if (!win || win.isDestroyed() || isPrimary(win)) return false;
  const slot = slotOf(win);
  clearTimeout(slotBoundsTimers.get(slot));
  slotBoundsTimers.delete(slot);
  editSlots((slots) => slots.filter((entry) => entry.id !== slot));
  hub.closeOwned(ownerKey(win));
  moneyWindows.delete(win);
  win.destroy();
  return true;
}

function revealMoneyWindow(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  hideFromTaskbar(win);
  win.show();
  win.focus();
  hideFromTaskbar(win);
  activeWindow = win;
}

/** End the program: every window's state is already on disk, so nothing is asked. */
function quitApp() {
  if (quitting) return;
  saveWindowPlacement();
  for (const win of liveWindows()) {
    if (!isPrimary(win)) {
      const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
      const slot = slotOf(win);
      clearTimeout(slotBoundsTimers.get(slot));
      editSlots((slots) => slots.map((entry) => (entry.id === slot ? { ...entry, bounds: { ...bounds } } : entry)));
    }
  }
  quitting = true;
  hub.closeAll();
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.destroy();
  app.quit();
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
  if (!isUsableSize(next) || !Number.isFinite(next.x) || !Number.isFinite(next.y)) return liveBounds;
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
  if (liveBounds && isUsableSize(liveBounds) && Number.isFinite(liveBounds.x) && Number.isFinite(liveBounds.y)) {
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

/** The window a tray command acts on: the one used last, or the first. */
function trayTarget() {
  if (activeWindow && !activeWindow.isDestroyed()) return activeWindow;
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  return liveWindows()[0] || null;
}

function revealFromTray(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  activeWindow = win;
  trayRevealUntil = Date.now() + 700;
  win.setAlwaysOnTop(true);
  win.show();
  win.moveTop();
  win.focus();
  hideFromTaskbar(win);
}

/** Bring every window back: the tray's "Show windows". */
function revealAllWindows() {
  const target = trayTarget();
  for (const win of liveWindows()) {
    if (win === target) continue;
    if (win.isMinimized()) win.restore();
    win.showInactive();
    hideFromTaskbar(win);
  }
  revealMoneyWindow(target);
}

/** The tray lists every window by its market and first symbols. */
function trayWindowList(language) {
  const stored = sanitizeSettings(readJson(settingsFile()));
  const slots = readSlots();
  const list = [];
  const windows = liveWindows();
  windows.sort((a, b) => (isPrimary(a) ? -1 : isPrimary(b) ? 1 : a.id - b.id));
  windows.forEach((win, index) => {
    const slot = slotOf(win);
    const board = slot === MAIN_SLOT ? stored.defaultBoard : slots.find((entry) => entry.id === slot)?.board;
    list.push({ slot, label: windowLabel(board, language, index), active: win === trayTarget(), visible: win.isVisible() });
  });
  return list;
}

function windowBySlot(slot) {
  return liveWindows().find((win) => slotOf(win) === slot) || null;
}

function finishTrayCommand() {
  const command = trayCommand;
  trayCommand = "";
  if (!command) return;
  if (command === "exit") {
    quitApp();
    return;
  }
  if (command === "show-window") {
    revealAllWindows();
    return;
  }
  if (command === "new-window") {
    openNewWindow();
    return;
  }
  if (command.startsWith("window:")) {
    revealMoneyWindow(windowBySlot(command.slice(7)));
    return;
  }
  const target = trayTarget();
  if (!target) return;
  revealFromTray(target);
  setTimeout(() => {
    if (target.isDestroyed()) return;
    target.setAlwaysOnTop(false);
    if (target.isMinimized()) target.restore();
    if (!target.isVisible()) target.show();
    target.focus();
    hideFromTaskbar(target);
    target.webContents.send("menu-command", command);
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
  const settings = sanitizeSettings(readJson(settingsFile()));
  const i18n = createI18n(settings.language);
  const items = buildTrayMenu((key) => i18n.t(key), {
    windows: trayWindowList(settings.language),
    canAddWindow: readSlots().length < MAX_EXTRA_WINDOWS,
  });
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
  const trayContentsId = win.webContents.id;
  menuSpecs.set(trayContentsId, {
    kind: "tray",
    items,
    theme: { vars: themeVars(colors, 0), mode: colors.mode },
  });
  let acceptBlur = false;
  win.on("blur", () => {
    if (acceptBlur && !trayCommand) closeTrayMenu();
  });
  win.on("closed", () => {
    menuSpecs.delete(trayContentsId);
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
  tray.setToolTip("MyMoney V1.0");
  tray.on("click", showTrayMenu);
  tray.on("right-click", showTrayMenu);
}

app.whenReady().then(() => {
  if (!singleInstance) {
    tellAlreadyRunning();
    app.exit(0);
    return;
  }
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(iconPath);
    app.dock.hide();
  }
  createTray();
  createMainWindow(MAIN_SLOT);
  // Every window that was open last time comes back with its own board.
  for (const slot of readSlots()) createMainWindow(slot.id, slot);
  activeWindow = mainWindow;
  app.on("activate", () => {
    if (moneyWindows.size === 0) createMainWindow(MAIN_SLOT);
    else revealAllWindows();
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

// Windows are only hidden, never closed, until the tray says to quit.
app.on("window-all-closed", () => {
  if (quitting && process.platform !== "darwin") app.quit();
});

function boundsReply(win) {
  const bounds = win.getBounds();
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, maximized: win.isMaximized() };
}

/** After a window changed shape: the first one keeps window.json, the others their slot. */
function noteWindowShape(win) {
  if (isPrimary(win)) {
    const actual = win.getBounds();
    return noteBounds({ x: actual.x, y: actual.y, width: actual.width, height: actual.height, maximized: false });
  }
  if (moneyWindows.has(win)) rememberSlotBounds(win);
  return boundsReply(win);
}

ipcMain.handle("window-resize", (event, step = {}) => {
  const win = moneyWindowOf(event.sender);
  if (!win || win.isDestroyed() || win.isMaximized()) return null;
  if (step.phase === "start") {
    const bounds = win.getBounds();
    const sized = isPrimary(win) ? liveBounds : null;
    const start = {
      x: bounds.x,
      y: bounds.y,
      width: sized?.width >= WINDOW_MIN.width ? sized.width : bounds.width,
      height: sized?.height >= WINDOW_MIN.height ? sized.height : bounds.height,
    };
    resizeStarts.set(win.id, start);
    return start;
  }
  if (step.phase === "end") {
    resizeStarts.delete(win.id);
    return isPrimary(win) ? currentPlacement() : noteWindowShape(win);
  }
  const base = resizeStarts.get(win.id) || win.getBounds();
  if (!resizeStarts.has(win.id)) resizeStarts.set(win.id, base);
  const width = Math.max(WINDOW_MIN.width, Math.round(base.width + Number(step.dx || 0)));
  const height = Math.max(WINDOW_MIN.height, Math.round(base.height + Number(step.dy || 0)));
  win.setBounds({ x: base.x, y: base.y, width, height });
  noteWindowShape(win);
  return { x: base.x, y: base.y, width, height };
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
    if (!isPrimary(win)) {
      if (moneyWindows.has(win)) rememberSlotBounds(win);
      return boundsReply(win);
    }
    const bounds = win.getBounds();
    const noted = noteBounds({
      x: bounds.x,
      y: bounds.y,
      width: liveBounds?.width || bounds.width,
      height: liveBounds?.height || bounds.height,
      maximized: win.isMaximized(),
    });
    return noted || boundsReply(win);
  }
  const origin = moveStarts.get(win.id) || (() => {
    const [x, y] = win.getPosition();
    return { x, y };
  })();
  const x = Math.round(origin.x + Number(step.dx || 0));
  const y = Math.round(origin.y + Number(step.dy || 0));
  win.setPosition(x, y);
  if (isPrimary(win)) noteBounds({ x, y, width: liveBounds?.width, height: liveBounds?.height, maximized: false });
  else if (moneyWindows.has(win)) rememberSlotBounds(win);
  return { x, y };
});

/** Set the window to an exact size, used when the whole watchlist is shown. */
ipcMain.handle("window-size", (event, size = {}) => {
  const win = moneyWindowOf(event.sender);
  if (!win || win.isDestroyed() || win.isMaximized()) return null;
  const bounds = win.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(area.width, Math.max(WINDOW_MIN.width, Math.round(Number(size.width) || bounds.width)));
  const height = Math.min(area.height, Math.max(WINDOW_MIN.height, Math.round(Number(size.height) || bounds.height)));
  const next = {
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    width,
    height,
  };
  win.setBounds(next);
  if (isPrimary(win)) return noteBounds({ ...next, maximized: false });
  rememberSlotBounds(win);
  return { ...next, maximized: false };
});

ipcMain.handle("list-fonts", () => listSystemFonts());

ipcMain.handle("fetch-url", async (_event, url, options = {}) => {
  const response = await net.fetch(url, { headers: options.headers || {} });
  return { ok: response.ok, status: response.status, text: await response.text() };
});

/**
 * Each window reads the same settings file but sees its own board and its own
 * rectangle in it, so the page code never has to know which window it is in.
 */
ipcMain.handle("read-settings", (event) => {
  const stored = readJson(settingsFile());
  const win = moneyWindowOf(event.sender);
  const slot = slotOf(win);
  if (!stored || !slot || slot === MAIN_SLOT) {
    if (stored) delete stored[WINDOW_LIST_FIELD];
    return stored;
  }
  const entry = readSlots().find((item) => item.id === slot);
  const view = sharedSettings(stored);
  view.defaultBoard = entry?.board || sanitizeBoard(null);
  if (!win.isDestroyed()) {
    const bounds = win.getBounds();
    view.windowSize = { width: bounds.width, height: bounds.height };
    view.windowPosition = { x: bounds.x, y: bounds.y };
  }
  view.windowMaximized = false;
  return view;
});

/** Tell the other windows about a shared change - a theme, a font, a language. */
function shareSettings(fromWin, settings) {
  const shared = sharedSettings(settings);
  for (const win of liveWindows()) {
    if (win === fromWin) continue;
    win.webContents.send("settings-changed", shared);
  }
}

ipcMain.handle("write-settings", (event, data) => {
  const incoming = data && typeof data === "object" ? { ...data } : {};
  delete incoming[WINDOW_LIST_FIELD];
  const win = moneyWindowOf(event.sender);
  const stored = readJson(settingsFile()) || {};
  const slots = sanitizeWindowSlots(stored[WINDOW_LIST_FIELD]);
  const slot = slotOf(win);
  if (slot && slot !== MAIN_SLOT) {
    // An extra window writes the shared part over the file and its board into its slot.
    const next = { ...stored, ...sharedSettings(incoming) };
    for (const field of WINDOW_FIELDS) if (stored[field] !== undefined) next[field] = stored[field];
    next[WINDOW_LIST_FIELD] = slots.map((entry) => (entry.id === slot ? { ...entry, board: sanitizeBoard(incoming.defaultBoard) } : entry));
    writeSettingsFile(next);
    shareSettings(win, next);
    return true;
  }
  incoming[WINDOW_LIST_FIELD] = slots;
  const placement = currentPlacement();
  if (placement) {
    writeSettingsFile(stampWindowPlacement(incoming, placement));
  } else {
    if (!incoming.windowSize && stored.windowSize) incoming.windowSize = stored.windowSize;
    if (!incoming.windowPosition && stored.windowPosition) incoming.windowPosition = stored.windowPosition;
    if (incoming.windowMaximized == null && stored.windowMaximized != null) incoming.windowMaximized = stored.windowMaximized;
    writeSettingsFile(incoming);
  }
  shareSettings(win, incoming);
  return true;
});

ipcMain.handle("open-file", async (event, opts = {}) => {
  const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const result = await dialog.showOpenDialog(parent, {
    defaultPath: opts.startDir || undefined,
    filters: [{ name: "MyMoney", extensions: ["mymoney"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  return { path: filePath, directory: path.dirname(filePath), text: fs.readFileSync(filePath, "utf8") };
});

ipcMain.handle("save-file", async (event, opts = {}) => {
  const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const result = await dialog.showSaveDialog(parent, {
    defaultPath: opts.startDir ? path.join(opts.startDir, opts.suggestedName || "market.mymoney") : opts.suggestedName,
    filters: [{ name: "MyMoney", extensions: ["mymoney", "json"] }],
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

ipcMain.handle("window-control", (event, action) => {
  const win = moneyWindowOf(event.sender);
  if (!win || win.isDestroyed()) return;
  if (action === "minimize") win.minimize();
  if (action === "maximize") win.isMaximized() ? win.unmaximize() : win.maximize();
  if (action === "hide" || action === "close") {
    hideMoneyWindow(win);
    return;
  }
  sendWindowState(win);
});

ipcMain.handle("window-bounds", (event) => {
  const win = moneyWindowOf(event.sender);
  if (isPrimary(win)) return currentPlacement();
  if (!win || win.isDestroyed()) return null;
  return boundsReply(win);
});

/** Which window the page is: the first one cannot be removed, the others can. */
ipcMain.handle("window-boot", (event) => {
  const win = moneyWindowOf(event.sender);
  return { slot: slotOf(win) || MAIN_SLOT, primary: isPrimary(win), canAddWindow: readSlots().length < MAX_EXTRA_WINDOWS };
});

ipcMain.handle("new-window", () => Boolean(openNewWindow()));

ipcMain.handle("remove-window", (event) => removeMoneyWindow(moneyWindowOf(event.sender)));

ipcMain.handle("confirm-quit", () => quitApp());

/**
 * Windows and macOS keep the "start with the system" flag themselves, so the
 * settings file only remembers what the reader asked for. A packaged build
 * registers its own executable; a dev run registers Electron with the project.
 */
ipcMain.handle("set-auto-start", (_event, on) => {
  const openAtLogin = Boolean(on);
  const options = { openAtLogin, openAsHidden: false };
  if (!app.isPackaged) {
    options.path = process.execPath;
    options.args = [path.resolve(process.argv[1] || __dirname)];
  }
  app.setLoginItemSettings(options);
  return app.getLoginItemSettings(options).openAtLogin;
});

ipcMain.handle("get-auto-start", () => {
  const options = app.isPackaged ? {} : { path: process.execPath, args: [path.resolve(process.argv[1] || __dirname)] };
  return app.getLoginItemSettings(options).openAtLogin;
});

ipcMain.handle("clipboard-write", (_event, text) => clipboard.writeText(String(text ?? "")));
ipcMain.handle("clipboard-read", () => clipboard.readText());

ipcMain.handle("begin-popup", (event, spec) => {
  const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const owner = moneyWindowOf(event.sender);
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
    if (owner) windowOwners.set(contentsId, owner);
    win.on("closed", () => {
      contentsToPopup.delete(contentsId);
      windowOwners.delete(contentsId);
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
  }, ownerKey(owner));
  return started;
});

/** A popup that measured its own page asks for exactly that much window. */
ipcMain.handle("resize-popup", (event, size = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return null;
  const bounds = win.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(area.width, Math.max(240, Math.round(Number(size.width) || bounds.width)));
  const height = Math.min(area.height, Math.max(160, Math.round(Number(size.height) || bounds.height)));
  win.setBounds({
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    width,
    height,
  });
  return { width, height };
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
      font: payload.font && typeof payload.font === "object" ? payload.font : null,
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
  const owner = moneyWindowOf(event.sender);
  if (owner && !owner.isDestroyed()) owner.webContents.send("popup-immediate", { ...message, popupId });
});

ipcMain.handle("show-menu", (event, payload) => {
  const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const owner = moneyWindowOf(event.sender);
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
  const menuContentsId = win.webContents.id;
  menuSpecs.set(menuContentsId, payload);
  if (owner) windowOwners.set(menuContentsId, owner);
  win.on("closed", () => {
    windowOwners.delete(menuContentsId);
    menuSpecs.delete(menuContentsId);
  });
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
  const owner = moneyWindowOf(event.sender);
  if (id && owner && !owner.isDestroyed()) {
    if (win && win !== owner) revealMoneyWindow(owner);
    owner.webContents.send("menu-command", id);
  }
  if (win && !moneyWindows.has(win) && !win.isDestroyed()) win.close();
});
