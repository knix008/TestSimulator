// Menus and dialogs as real OS windows.
//
// Two requirements are met by one mechanism. A menu has to be able to spill past the
// app window — a File menu with ten recent files is taller than a small window, and
// clipping it or splitting it into columns is exactly what we are told not to do. And
// every dialog has to be independent of the main window, fixed size, scroll-free, yet
// go away when the app does.
//
// Both become their own BrowserWindow loading the same bundle on a hash route
// (`#menu=` / `#dialog=`), so they can sit anywhere on the desktop while still being
// owned by the main window. The routes carry no name: creating a window is cheap but
// starting a renderer behind it is not, so popups are pooled, handed an identity over
// IPC, and hidden rather than destroyed when dismissed.
const { BrowserWindow, ipcMain, screen } = require("electron");
const path = require("node:path");

/** @type {Map<string, BrowserWindow>} One window per dialog name: a button cannot open two. */
const dialogWindows = new Map();
/** @type {{ win: BrowserWindow, openerId: number } | null} Only ever one menu. */
let menuWindow = null;
let mainWindow = null;
/** Base URL of the app's own server; set by main.cjs once it is listening. */
let baseUrl = "";
/** The current theme's panel colour, so a popup never flashes — or edges — in navy. */
let dialogBackground = "#f5f6f8";

/** @type {BrowserWindow[]} Loaded and hidden, waiting to be given an identity. */
const spareDialogs = [];
const SPARE_TARGET = 2;
const SPARE_LIMIT = 3;
let shuttingDown = false;
let warmTimer = null;
/** Distinguishes one opening from the next, so a reused window remounts. */
let openSequence = 0;

// No popup is resizable and none scrolls: each one's content is laid out to fit, with
// tabs where there is too much for a single column. `fixed` keeps exactly this size;
// the others take the height their content reports once, when they open.
const DIALOG_SPECS = {
  settings: { width: 760, height: 640, fixed: true },
  about: { width: 560, height: 440, fixed: true },
  print: { width: 1000, height: 760, fixed: true },
  error: { width: 660, height: 440, fixed: true },
  progress: { width: 480, height: 200 },
  unsaved: { width: 520, height: 230 },
  recent: { width: 680, height: 480, fixed: true },
  confirm: { width: 500, height: 220 },
  prompt: { width: 560, height: 220 },
  text: { width: 460, height: 190 },
  remote: { width: 520, height: 420, fixed: true },
};

const DEFAULT_SPEC = { width: 520, height: 360 };

function setBaseUrl(url) {
  baseUrl = url.replace(/\/+$/, "");
}

/** Called whenever the theme changes, so a pooled window matches the app. */
function setDialogBackground(color) {
  if (typeof color !== "string" || !color) return;
  dialogBackground = color;
  for (const win of [...dialogWindows.values(), ...spareDialogs]) {
    if (!win.isDestroyed()) win.setBackgroundColor(color);
  }
}

function routeUrl(hash) {
  return `${baseUrl}/#${hash}`;
}

function load(win, hash) {
  win.loadURL(routeUrl(hash)).catch(() => {
    /* the server is gone; the window will be torn down with the app */
  });
}

function iconPath() {
  return path.join(__dirname, "..", "build", process.platform === "win32" ? "icon.ico" : "icon.png");
}

function preloadPath() {
  return path.join(__dirname, "preload.cjs");
}

/* ------------------------------------------------------------------ menus */

function ensureMenuWindow() {
  if (menuWindow && !menuWindow.win.isDestroyed()) return menuWindow.win;

  const win = new BrowserWindow({
    width: 260,
    height: 80,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    // Deliberately not `parent`: a child window is clamped inside its parent on some
    // platforms, which is the clipping this window exists to escape.
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  menuWindow = { win, openerId: -1 };
  win.__menuMessage = null;

  win.on("blur", () => {
    if (menuWindow && menuWindow.win === win) hideMenuWindow();
  });
  win.on("close", (event) => {
    if (shuttingDown) return;
    event.preventDefault();
    hideMenuWindow();
  });
  win.on("closed", () => {
    if (menuWindow && menuWindow.win === win) menuWindow = null;
  });

  load(win, "menu=");
  return win;
}

function hideMenuWindow() {
  const current = menuWindow;
  if (!current || current.win.isDestroyed()) return;
  current.openerId = -1;
  current.win.__menuMessage = null;
  if (current.win.isVisible()) current.win.hide();
  current.win.webContents.send("menu:payload", null);
}

/**
 * Shows `payload.items` at `anchor` (screen coordinates). The window stays hidden
 * until the renderer reports how tall the list is, so it fits its contents exactly
 * and can overhang the app.
 */
function openMenuWindow(payload, anchor, opener) {
  const parent = opener && !opener.isDestroyed() ? opener : mainWindow;
  const win = ensureMenuWindow();
  if (win.isVisible()) win.hide();
  openSequence += 1;
  const message = { ...payload, anchor, openId: openSequence };
  win.__menuMessage = message;
  menuWindow.openerId = parent && !parent.isDestroyed() ? parent.id : -1;
  win.webContents.send("menu:payload", message);
  return true;
}

/** Fits the popup to its content and keeps it on the anchor's display. */
function sizeMenuWindow(win, size) {
  if (!win || win.isDestroyed()) return;
  const message = win.__menuMessage;
  // A dismissed menu must not be put back on screen by a late measurement.
  if (!message) return;
  const anchor = message.anchor || { x: 0, y: 0, width: 0, height: 0 };
  const width = Math.max(180, Math.ceil(size.width));
  const height = Math.max(36, Math.ceil(size.height));
  const display = screen.getDisplayNearestPoint({ x: Math.round(anchor.x), y: Math.round(anchor.y) });
  const area = display.workArea;

  let x = Math.round(anchor.x);
  let y = Math.round(anchor.y);
  if (x + width > area.x + area.width) x = area.x + area.width - width;
  if (x < area.x) x = area.x;
  // Flip above the anchor when it would run off the bottom. It may still overhang the
  // app window, which is the whole point.
  if (y + height > area.y + area.height) {
    const above = Math.round(anchor.y - anchor.height - height);
    y = above >= area.y ? above : Math.max(area.y, area.y + area.height - height);
  }
  win.setBounds({ x, y, width, height });
  if (!win.isVisible()) {
    win.showInactive();
    win.focus();
  }
}

/* ---------------------------------------------------------------- dialogs */

function createDialogWindow() {
  const win = new BrowserWindow({
    width: DEFAULT_SPEC.width,
    height: DEFAULT_SPEC.height,
    minWidth: 320,
    minHeight: 120,
    movable: true,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    frame: false,
    // Replaced with the theme's own colour as soon as a dialog opens; this is only
    // what shows for the frame or two before the renderer paints.
    backgroundColor: dialogBackground,
    icon: iconPath(),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.__dialogName = null;
  win.__dialogMessage = null;
  win.__ownerId = -1;
  win.__ready = false;

  win.once("ready-to-show", () => {
    win.__ready = true;
  });
  win.on("close", (event) => {
    // The X button, Escape and Alt+F4 all arrive here. A popup in use goes back to the
    // pool instead of being destroyed, so opening it again is instant.
    if (shuttingDown || !win.__dialogName) return;
    event.preventDefault();
    recycleDialogWindow(win);
  });
  win.on("closed", () => {
    releaseDialogWindow(win);
    const index = spareDialogs.indexOf(win);
    if (index >= 0) spareDialogs.splice(index, 1);
  });

  load(win, "dialog=");
  return win;
}

function warmDialogPool() {
  if (shuttingDown || warmTimer || !baseUrl) return;
  warmTimer = setTimeout(() => {
    warmTimer = null;
    if (shuttingDown) return;
    while (spareDialogs.length < SPARE_TARGET) spareDialogs.push(createDialogWindow());
  }, 400);
  if (typeof warmTimer.unref === "function") warmTimer.unref();
}

function takeSpareDialog() {
  while (spareDialogs.length > 0) {
    const win = spareDialogs.pop();
    if (win && !win.isDestroyed()) return win;
  }
  return createDialogWindow();
}

function applyDialogSpec(win, name, parent) {
  const spec = DIALOG_SPECS[name] || DEFAULT_SPEC;
  // Windows pins a non-resizable window to its current size, so the flag has to come
  // off before the bounds are set and go back on afterwards.
  win.setResizable(true);
  win.setMinimumSize(320, 120);
  const bounds = { width: spec.width, height: spec.height };
  if (parent && !parent.isDestroyed()) {
    const parentBounds = parent.getBounds();
    bounds.x = Math.round(parentBounds.x + (parentBounds.width - spec.width) / 2);
    bounds.y = Math.round(parentBounds.y + (parentBounds.height - spec.height) / 2);
    // Owned by the main window, so quitting tears every dialog down with it, while the
    // dialog itself stays freely movable anywhere on the desktop.
    win.setParentWindow(parent);
  }
  win.setBounds(bounds);
  win.setResizable(false);
  win.setMaximizable(false);
}

function openDialogWindow(name, payload, opener) {
  const parent = opener && !opener.isDestroyed() ? opener : mainWindow;
  openSequence += 1;
  const message = { name, payload, openId: openSequence };

  const existing = dialogWindows.get(name);
  if (existing && !existing.isDestroyed()) {
    existing.__dialogMessage = message;
    existing.webContents.send("dialog:payload", message);
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    existing.moveTop();
    return true;
  }

  const win = takeSpareDialog();
  win.__dialogName = name;
  win.__dialogMessage = message;
  win.__ownerId = parent && !parent.isDestroyed() ? parent.id : -1;
  dialogWindows.set(name, win);
  applyDialogSpec(win, name, parent);
  if (payload && payload.background) win.setBackgroundColor(payload.background);
  win.webContents.send("dialog:payload", message);

  const reveal = () => {
    if (win.isDestroyed() || win.__dialogName !== name) return;
    win.show();
    win.focus();
  };
  if (win.__ready) reveal();
  else win.once("ready-to-show", reveal);

  warmDialogPool();
  return true;
}

/**
 * Fits a dialog to the height its content needs.
 *
 * A `fixed` dialog ignores this: it was designed to a size and lays its content out to
 * fit, tabs and all. The rest take the height they report, clamped to the display.
 */
function sizeDialogWindow(win, size) {
  if (!win || win.isDestroyed() || !win.__dialogName) return;
  const spec = DIALOG_SPECS[win.__dialogName] || DEFAULT_SPEC;
  if (spec.fixed) return;

  const current = win.getBounds();
  const display = screen.getDisplayNearestPoint({ x: current.x, y: current.y });
  const area = display.workArea;
  const width = size.width
    ? Math.min(Math.max(Math.ceil(size.width), 320), area.width - 40)
    : current.width;
  const height = Math.min(Math.max(Math.ceil(size.height), 120), area.height - 40);
  if (Math.abs(current.width - width) < 2 && Math.abs(current.height - height) < 2) return;

  // Grow around the middle so the window does not appear to crawl down the screen.
  let x = Math.round(current.x + (current.width - width) / 2);
  let y = Math.round(current.y + (current.height - height) / 2);
  x = Math.min(Math.max(x, area.x), area.x + area.width - width);
  y = Math.min(Math.max(y, area.y), area.y + area.height - height);

  const wasResizable = win.isResizable();
  if (!wasResizable) win.setResizable(true);
  win.setBounds({ x, y, width, height });
  if (!wasResizable) win.setResizable(false);
}

function releaseDialogWindow(win) {
  const name = win.__dialogName;
  win.__dialogName = null;
  win.__dialogMessage = null;
  if (!name) return;
  if (dialogWindows.get(name) === win) dialogWindows.delete(name);
  const owner = win.__ownerId >= 0 ? BrowserWindow.fromId(win.__ownerId) : mainWindow;
  if (owner && !owner.isDestroyed()) owner.webContents.send("dialog:closed", name);
}

function recycleDialogWindow(win) {
  if (!win || win.isDestroyed()) return;
  releaseDialogWindow(win);
  win.hide();
  // Emptying the renderer frees the dialog's DOM and gives the next one a clean slate;
  // the window, and the warm renderer behind it, stay.
  win.webContents.send("dialog:payload", { name: null, payload: null, openId: 0 });
  win.setParentWindow(null);
  win.__ownerId = -1;
  if (shuttingDown || spareDialogs.length >= SPARE_LIMIT) {
    win.destroy();
    return;
  }
  spareDialogs.push(win);
}

function closeDialogWindow(name) {
  const win = dialogWindows.get(name);
  if (win && !win.isDestroyed()) recycleDialogWindow(win);
}

function closeAllDialogWindows() {
  for (const win of [...dialogWindows.values()]) if (!win.isDestroyed()) recycleDialogWindow(win);
  dialogWindows.clear();
}

/** Really tears everything down: the app is going away. */
function closeAllChildWindows() {
  shuttingDown = true;
  if (warmTimer) {
    clearTimeout(warmTimer);
    warmTimer = null;
  }
  const current = menuWindow;
  menuWindow = null;
  if (current && !current.win.isDestroyed()) current.win.destroy();
  for (const win of [...dialogWindows.values(), ...spareDialogs]) if (!win.isDestroyed()) win.destroy();
  dialogWindows.clear();
  spareDialogs.length = 0;
}

/** Starts the popup renderers while the user is still looking at the panes. */
function warmChildWindows() {
  if (shuttingDown || !baseUrl) return;
  ensureMenuWindow();
  warmDialogPool();
}

/**
 * Pushes new settings (theme, language, font) to every window but the one that made
 * the change — excluding the sender is what stops the main window and a dialog from
 * echoing an update back and forth forever.
 */
function broadcastSettings(settings, exceptId) {
  const targets = [...dialogWindows.values(), ...spareDialogs];
  if (menuWindow && !menuWindow.win.isDestroyed()) targets.push(menuWindow.win);
  if (mainWindow && !mainWindow.isDestroyed()) targets.push(mainWindow);
  for (const win of targets) {
    if (win.isDestroyed() || win.id === exceptId) continue;
    win.webContents.send("settings:changed", settings);
  }
}

/* -------------------------------------------------------------------- ipc */

function registerChildWindowHandlers() {
  ipcMain.handle("menu:open", (event, payload, anchor) =>
    openMenuWindow(payload, anchor, BrowserWindow.fromWebContents(event.sender)));

  ipcMain.handle("menu:close", () => {
    hideMenuWindow();
  });

  ipcMain.handle("menu:payload", (event) => BrowserWindow.fromWebContents(event.sender)?.__menuMessage ?? null);

  ipcMain.handle("menu:size", (event, size) => {
    sizeMenuWindow(BrowserWindow.fromWebContents(event.sender), size);
  });

  ipcMain.handle("menu:choose", (_event, commandId) => {
    const current = menuWindow;
    const opener = current && current.openerId >= 0 ? BrowserWindow.fromId(current.openerId) : mainWindow;
    hideMenuWindow();
    if (opener && !opener.isDestroyed()) {
      opener.webContents.send("menu:chosen", commandId);
      opener.focus();
    }
  });

  ipcMain.handle("dialog:open", (event, name, payload) =>
    openDialogWindow(name, payload, BrowserWindow.fromWebContents(event.sender)));

  ipcMain.handle("dialog:payload", (event) =>
    BrowserWindow.fromWebContents(event.sender)?.__dialogMessage ?? null);

  ipcMain.handle("dialog:result", (event, name, result) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const owner = win && win.__ownerId >= 0 ? BrowserWindow.fromId(win.__ownerId) : mainWindow;
    if (owner && !owner.isDestroyed()) owner.webContents.send("dialog:result", { name, result });
  });

  ipcMain.handle("dialog:close", (event, name) => {
    if (name) {
      closeDialogWindow(name);
      return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) recycleDialogWindow(win);
  });

  ipcMain.handle("dialog:close-all", () => {
    closeAllDialogWindows();
  });

  ipcMain.handle("dialog:size", (event, size) => {
    sizeDialogWindow(BrowserWindow.fromWebContents(event.sender), size);
  });
}

function setMainWindow(win) {
  mainWindow = win;
}

module.exports = {
  setBaseUrl,
  setDialogBackground,
  setMainWindow,
  registerChildWindowHandlers,
  openDialogWindow,
  closeDialogWindow,
  closeAllDialogWindows,
  closeAllChildWindows,
  closeMenuWindow: hideMenuWindow,
  warmChildWindows,
  broadcastSettings,
  dialogWindows,
  DIALOG_SPECS,
  getMenuWindow: () => (menuWindow && !menuWindow.win.isDestroyed() ? menuWindow.win : null),
  getDialogWindow: (name) => dialogWindows.get(name) || null,
};
