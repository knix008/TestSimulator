// Menus and dialogs as real OS windows.
//
// Two requirements are met by the same mechanism. A frameless BrowserWindow
// clips its own HTML, so a long menu — the File menu with ten recent files, or
// the twenty-three theme swatches — cannot spill past the app window; and every
// dialog has to be independent of the main window, fixed in size and free of
// inner scrollbars, yet must disappear when the app quits.
//
// So both load the same bundle with a query route (`?popup=menu`, `?popup=dialog`)
// in their own window, positioned anywhere on the desktop, owned by the main
// window and torn down with it.
//
// Those routes carry no name. Creating a BrowserWindow is cheap; starting the
// renderer behind it is not — the bundle is parsed and React mounts — and paying
// that on every click is what makes popups feel slow. A nameless route makes
// every popup window interchangeable, so the main process can hand one its
// identity over IPC, keep dismissed windows in a pool, and fill the pool in the
// background before the user clicks anything.
'use strict';

const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');

/** One window per dialog name, so a button can never open a second copy. */
const dialogWindows = new Map();
/** Only one menu is ever open. */
let menuWindow = null;
let mainWindow = null;

/** Loaded and hidden, waiting to be given an identity. */
const spareDialogs = [];
const SPARE_TARGET = 2;
const SPARE_LIMIT = 3;
let shuttingDown = false;
let warmTimer = null;
/** Distinguishes one opening from the next, so a reused window remounts. */
let openSequence = 0;

// No popup is resizable and none scrolls. A `fixed` popup keeps exactly this
// size — its content is laid out to fit (tabs, a scaled page preview) — while
// the others take the height of their content once, when they open.
const DIALOG_SPECS = {
  settings: { width: 840, height: 700, fixed: true },
  about: { width: 580, height: 520 },
  error: { width: 660, height: 460 },
  unsaved: { width: 520, height: 240 },
  progress: { width: 470, height: 210 },
  print: { width: 980, height: 730, fixed: true },
  properties: { width: 620, height: 560, fixed: true },
  prompt: { width: 560, height: 260 },
  note: { width: 560, height: 320 },
  shortcuts: { width: 740, height: 600, fixed: true },
};

const DEFAULT_SPEC = { width: 520, height: 380 };

let devUrl = '';
let bundleUrl = '';

/** Told by main.js where the renderer lives, so this file has no opinion. */
function configure({ dev, bundle, main }) {
  if (dev !== undefined) devUrl = dev;
  if (bundle !== undefined) bundleUrl = bundle;
  if (main !== undefined) mainWindow = main;
}

function setMainWindow(win) {
  mainWindow = win;
}

function targetUrl(route) {
  const base = devUrl || bundleUrl;
  return `${base}?popup=${route}`;
}

function load(win, route) {
  const url = targetUrl(route);
  win.loadURL(url).catch(() => {
    // Unpackaged runs prefer the dev server but must still work without it.
    if (!win.isDestroyed() && bundleUrl && url !== `${bundleUrl}?popup=${route}`) {
      win.loadURL(`${bundleUrl}?popup=${route}`).catch(() => {});
    }
  });
}

function preloadPath() {
  return path.join(__dirname, 'preload.js');
}

function iconPath() {
  return path.join(__dirname, '..', 'build', 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
}

/* ------------------------------------------------------------------ menus */

function ensureMenuWindow() {
  if (menuWindow && !menuWindow.win.isDestroyed()) return menuWindow.win;

  const win = new BrowserWindow({
    width: 260,
    height: 90,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    // Deliberately not a child window: on some platforms a child is clamped
    // inside its parent, which is the very clipping this escapes.
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  menuWindow = { win, openerId: -1 };
  win.__menuMessage = null;

  win.on('blur', () => {
    if (menuWindow && menuWindow.win === win) hideMenuWindow();
  });
  win.on('close', (event) => {
    // Dismissing a menu hides it; only the app quitting really closes it.
    if (shuttingDown) return;
    event.preventDefault();
    hideMenuWindow();
  });
  win.on('closed', () => {
    if (menuWindow && menuWindow.win === win) menuWindow = null;
  });

  load(win, 'menu');
  return win;
}

function hideMenuWindow() {
  const current = menuWindow;
  if (!current || current.win.isDestroyed()) return;
  current.openerId = -1;
  current.win.__menuMessage = null;
  if (current.win.isVisible()) current.win.hide();
  // Emptied, so the next menu never flashes the previous one's rows.
  current.win.webContents.send('menu:payload', null);
}

/**
 * Shows `payload.menu` at `anchor` (screen coordinates). The window stays
 * hidden until the renderer reports how tall the list actually is, so it fits
 * its contents exactly and may overhang the app.
 */
function openMenuWindow(payload, anchor, opener) {
  const parent = opener && !opener.isDestroyed() ? opener : mainWindow;
  const win = ensureMenuWindow();
  if (win.isVisible()) win.hide();
  openSequence += 1;
  const message = { ...payload, anchor, openId: openSequence };
  win.__menuMessage = message;
  menuWindow.openerId = parent && !parent.isDestroyed() ? parent.id : -1;
  win.webContents.send('menu:payload', message);
  return true;
}

/** Fits the popup to its content and keeps it on the anchor's display. */
function sizeMenuWindow(win, size) {
  if (!win || win.isDestroyed()) return;
  const message = win.__menuMessage;
  // A dismissed menu must not be put back on screen by a late measurement
  // arriving from its own renderer.
  if (!message) return;
  const anchor = message.anchor || { x: 0, y: 0, width: 0, height: 0 };
  const display = screen.getDisplayNearestPoint({ x: Math.round(anchor.x), y: Math.round(anchor.y) });
  const area = display.workArea;
  const width = Math.max(180, Math.min(Math.ceil(size.width), area.width - 20));
  const height = Math.max(40, Math.min(Math.ceil(size.height), area.height - 20));

  let x = Math.round(anchor.x);
  let y = Math.round(anchor.y);
  if (x + width > area.x + area.width) x = area.x + area.width - width;
  if (x < area.x) x = area.x;
  if (y + height > area.y + area.height) {
    const above = Math.round(anchor.y - (anchor.height || 0) - height);
    y = above >= area.y ? above : Math.max(area.y, area.y + area.height - height);
  }
  if (y < area.y) y = area.y;

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
    minHeight: 140,
    modal: false,
    movable: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    frame: false,
    backgroundColor: '#1d2027',
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

  win.once('ready-to-show', () => { win.__ready = true; });
  win.on('close', (event) => {
    // The X button, Escape and Alt+F4 all arrive here. A popup in use goes back
    // to the pool instead of being destroyed, so reopening it is instant.
    if (shuttingDown || !win.__dialogName) return;
    event.preventDefault();
    recycleDialogWindow(win);
  });
  win.on('closed', () => {
    releaseDialogWindow(win);
    const index = spareDialogs.indexOf(win);
    if (index >= 0) spareDialogs.splice(index, 1);
  });

  load(win, 'dialog');
  return win;
}

/** Refills the pool, off the critical path of the click that emptied it. */
function warmDialogPool() {
  if (shuttingDown || warmTimer) return;
  warmTimer = setTimeout(() => {
    warmTimer = null;
    if (shuttingDown) return;
    while (spareDialogs.length < SPARE_TARGET) spareDialogs.push(createDialogWindow());
  }, 400);
  if (typeof warmTimer.unref === 'function') warmTimer.unref();
}

function takeSpareDialog() {
  while (spareDialogs.length > 0) {
    const win = spareDialogs.pop();
    if (win && !win.isDestroyed()) return win;
  }
  return createDialogWindow();
}

/** Gives a pooled window the size and place its dialog asks for. */
function applyDialogSpec(win, name, parent) {
  const spec = DIALOG_SPECS[name] || DEFAULT_SPEC;
  // Windows pins a non-resizable window to its current size, so the flag has to
  // come off before the bounds are set and go back on afterwards.
  win.setResizable(true);
  win.setMinimumSize(Math.min(spec.width, 320), 140);
  const bounds = { width: spec.width, height: spec.height };
  if (parent && !parent.isDestroyed()) {
    const pb = parent.getBounds();
    bounds.x = Math.round(pb.x + (pb.width - spec.width) / 2);
    bounds.y = Math.round(pb.y + (pb.height - spec.height) / 2);
    // Owned by the main window, so quitting tears every dialog down with it —
    // while the dialog itself stays freely movable anywhere on the desktop.
    win.setParentWindow(parent);
  }
  win.setBounds(bounds);
  win.setResizable(false);
  win.setMaximizable(false);
}

/**
 * Opens `name` in its own window. An already-open dialog is reused: it takes
 * the fresh payload, is raised and focused.
 */
function openDialogWindow(name, payload, opener) {
  const parent = opener && !opener.isDestroyed() ? opener : mainWindow;
  openSequence += 1;
  const message = { name, payload, openId: openSequence };

  const existing = dialogWindows.get(name);
  if (existing && !existing.isDestroyed()) {
    existing.__dialogMessage = message;
    existing.webContents.send('dialog:payload', message);
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
  win.webContents.send('dialog:payload', message);

  const reveal = () => {
    if (win.isDestroyed() || win.__dialogName !== name) return;
    win.show();
    win.focus();
  };
  if (win.__ready) reveal();
  else win.once('ready-to-show', reveal);

  warmDialogPool();
  return true;
}

/**
 * Fits a dialog window to the height its content actually needs, so no popup
 * has empty space under its buttons or a scrollbar of its own. A `fixed` dialog
 * keeps its spec size whatever its content reports.
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
  const height = Math.min(Math.max(Math.ceil(size.height), 140), area.height - 40);
  if (Math.abs(current.width - width) < 2 && Math.abs(current.height - height) < 2) return;

  // Grow around the middle so the window does not appear to crawl down-screen.
  let x = Math.round(current.x + (current.width - width) / 2);
  let y = Math.round(current.y + (current.height - height) / 2);
  x = Math.min(Math.max(x, area.x), area.x + area.width - width);
  y = Math.min(Math.max(y, area.y), area.y + area.height - height);

  const wasResizable = win.isResizable();
  if (!wasResizable) win.setResizable(true);
  win.setBounds({ x, y, width, height });
  if (!wasResizable) win.setResizable(false);
}

/** Takes a popup out of the open set and tells its opener it has gone. */
function releaseDialogWindow(win) {
  const name = win.__dialogName;
  win.__dialogName = null;
  win.__dialogMessage = null;
  if (!name) return;
  if (dialogWindows.get(name) === win) dialogWindows.delete(name);
  const owner = win.__ownerId >= 0 ? BrowserWindow.fromId(win.__ownerId) : mainWindow;
  if (owner && !owner.isDestroyed()) owner.webContents.send('dialog:closed', name);
}

/** Hides a dialog and puts its window back in the pool. */
function recycleDialogWindow(win) {
  if (!win || win.isDestroyed()) return;
  releaseDialogWindow(win);
  win.hide();
  // Emptying the renderer frees the dialog's DOM and gives the next dialog a
  // clean slate; the window, and the warm renderer behind it, stay.
  win.webContents.send('dialog:payload', { name: null, payload: null, openId: 0 });
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
  for (const win of [...dialogWindows.values()]) {
    if (!win.isDestroyed()) recycleDialogWindow(win);
  }
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
  for (const win of [...dialogWindows.values(), ...spareDialogs]) {
    if (!win.isDestroyed()) win.destroy();
  }
  dialogWindows.clear();
  spareDialogs.length = 0;
}

/** Starts the popup renderers while the user is still reading. */
function warmChildWindows() {
  if (shuttingDown) return;
  ensureMenuWindow();
  warmDialogPool();
}

function isDialogOpen(name) {
  const win = dialogWindows.get(name);
  return !!(win && !win.isDestroyed() && win.isVisible());
}

/* -------------------------------------------------------------------- ipc */

function registerChildWindowHandlers() {
  ipcMain.handle('menu:open', (event, payload, anchor) =>
    openMenuWindow(payload, anchor, BrowserWindow.fromWebContents(event.sender)));

  ipcMain.handle('menu:close', () => { hideMenuWindow(); });

  ipcMain.handle('menu:payload', (event) =>
    BrowserWindow.fromWebContents(event.sender)?.__menuMessage ?? null);

  ipcMain.handle('menu:size', (event, size) => {
    sizeMenuWindow(BrowserWindow.fromWebContents(event.sender), size);
  });

  ipcMain.handle('menu:choose', (event, commandId) => {
    const current = menuWindow;
    const opener = current && current.openerId >= 0 ? BrowserWindow.fromId(current.openerId) : mainWindow;
    hideMenuWindow();
    if (opener && !opener.isDestroyed()) {
      opener.webContents.send('menu:chosen', commandId);
      opener.focus();
    }
    void event;
  });

  ipcMain.handle('dialog:open', (event, name, payload) =>
    openDialogWindow(name, payload, BrowserWindow.fromWebContents(event.sender)));

  ipcMain.handle('dialog:payload', (event) =>
    BrowserWindow.fromWebContents(event.sender)?.__dialogMessage ?? null);

  ipcMain.handle('dialog:result', (event, name, result) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const owner = win && win.__ownerId >= 0 ? BrowserWindow.fromId(win.__ownerId) : mainWindow;
    if (owner && !owner.isDestroyed()) owner.webContents.send('dialog:result', { name, result });
  });

  ipcMain.handle('dialog:close', (event, name) => {
    if (name) {
      closeDialogWindow(name);
      return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) recycleDialogWindow(win);
  });

  ipcMain.handle('dialog:close-all', () => { closeAllDialogWindows(); });

  ipcMain.handle('dialog:size', (event, size) => {
    sizeDialogWindow(BrowserWindow.fromWebContents(event.sender), size);
  });
}

module.exports = {
  configure,
  setMainWindow,
  registerChildWindowHandlers,
  openDialogWindow,
  closeDialogWindow,
  closeAllDialogWindows,
  closeAllChildWindows,
  warmChildWindows,
  isDialogOpen,
  dialogWindows,
  DIALOG_SPECS,
  getMenuWindow: () => (menuWindow && !menuWindow.win.isDestroyed() ? menuWindow.win : null),
  __test: { sizeMenuWindow, applyDialogSpec },
};
