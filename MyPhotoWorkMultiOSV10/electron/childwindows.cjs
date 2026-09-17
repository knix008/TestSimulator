// Menu popups and dialogs as real OS windows.
//
// Two problems are solved by the same mechanism. A frameless BrowserWindow
// clips its own HTML, so a long menu (the Layer menu runs to ~27 rows) cannot
// spill past the app window; and an in-page dialog cannot be dragged out of the
// way. Both become child windows that load the same bundle with a hash route —
// `#menu=<id>` or `#dialog=<name>` — so they can be positioned anywhere on the
// desktop while still being owned by, and torn down with, the main window.
const { BrowserWindow, ipcMain, screen, app } = require('electron')
const path = require('node:path')

/** @type {Map<string, BrowserWindow>} One window per dialog name, so a button can only ever open one. */
const dialogWindows = new Map()
/** @type {{ win: BrowserWindow, openerId: number } | null} Only one menu is ever open. */
let menuWindow = null
let mainWindow = null

const DIALOG_SPECS = {
  // Wider than the old in-page panel so each row fits label + control on one
  // line, and fixed: the layout is designed for exactly this size.
  settings: { width: 720, height: 640, resizable: false },
  about: { width: 460, height: 470, resizable: false },
  helpGuide: { width: 660, height: 620, resizable: false },
  error: { width: 620, height: 420, minWidth: 420, minHeight: 280 },
  unsaved: { width: 460, height: 210, resizable: false },
  new: { width: 520, height: 470, minWidth: 420, minHeight: 380 },
  export: { width: 440, height: 250, resizable: false },
  imageSize: { width: 420, height: 230, resizable: false },
  canvasSize: { width: 420, height: 230, resizable: false },
  text: { width: 460, height: 300, minWidth: 380, minHeight: 240 },
  brightness: { width: 440, height: 240, resizable: false },
  hue: { width: 440, height: 280, resizable: false },
  blur: { width: 420, height: 200, resizable: false },
  sharpen: { width: 420, height: 200, resizable: false },
  feather: { width: 420, height: 200, resizable: false },
  cameraRaw: { width: 460, height: 300, resizable: false },
  filterGallery: { width: 560, height: 520, minWidth: 420, minHeight: 360 },
  curves: { width: 420, height: 560, minWidth: 360, minHeight: 460 },
  levels: { width: 460, height: 460, minWidth: 380, minHeight: 380 },
}

const DEFAULT_SPEC = { width: 480, height: 360, minWidth: 320, minHeight: 200 }

function isDev() {
  return !app.isPackaged
}

function routeTarget(hash) {
  if (isDev()) {
    return { url: `http://127.0.0.1:5173/#${hash}` }
  }
  return { file: path.join(__dirname, '..', 'dist', 'index.html'), hash }
}

/**
 * Loads a popup's route. Unpackaged we prefer the dev server, but fall back to
 * the built bundle when it is not running — otherwise every popup would open
 * blank while the main window, started earlier, still looked fine.
 */
function load(win, hash) {
  const target = routeTarget(hash)
  const file = path.join(__dirname, '..', 'dist', 'index.html')
  if (target.url) {
    win.loadURL(target.url).catch(() => {
      if (!win.isDestroyed()) win.loadFile(file, { hash }).catch(() => {})
    })
  } else {
    win.loadFile(target.file, { hash: target.hash })
  }
}

function iconPath() {
  return path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
}

function preloadPath() {
  return path.join(__dirname, 'preload.cjs')
}

/* ------------------------------------------------------------------ menus */

function closeMenuWindow() {
  const current = menuWindow
  menuWindow = null
  if (current && !current.win.isDestroyed()) {
    current.win.close()
  }
}

/**
 * Opens the dropdown for `payload.menu` at `anchor` (screen coordinates).
 * The window starts small and is resized once the renderer reports how tall the
 * list actually is, so it fits its contents exactly and can overhang the app.
 */
function openMenuWindow(payload, anchor, opener) {
  closeMenuWindow()
  const parent = opener && !opener.isDestroyed() ? opener : mainWindow
  const win = new BrowserWindow({
    x: Math.round(anchor.x),
    y: Math.round(anchor.y),
    width: 240,
    height: 80,
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
    focusable: true,
    show: false,
    // Not `parent`: a child window is clamped inside its parent on some
    // platforms, which is the very clipping we are trying to escape.
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  menuWindow = { win, openerId: parent && !parent.isDestroyed() ? parent.id : -1 }
  win.__menuPayload = { ...payload, anchor }

  win.on('blur', () => {
    // Clicking anywhere else dismisses the menu, as a native one would.
    if (menuWindow && menuWindow.win === win) closeMenuWindow()
  })
  win.on('closed', () => {
    if (menuWindow && menuWindow.win === win) menuWindow = null
  })

  load(win, `menu=${encodeURIComponent(payload.menu)}`)
  return true
}

/** Fits the popup to its content and keeps it on the anchor's display. */
function sizeMenuWindow(win, size) {
  if (!win || win.isDestroyed()) return
  const payload = win.__menuPayload
  const anchor = payload?.anchor ?? { x: 0, y: 0, width: 0, height: 0 }
  const width = Math.max(180, Math.ceil(size.width))
  const height = Math.max(40, Math.ceil(size.height))
  const display = screen.getDisplayNearestPoint({ x: Math.round(anchor.x), y: Math.round(anchor.y) })
  const area = display.workArea

  let x = Math.round(anchor.x)
  let y = Math.round(anchor.y)
  // Keep the popup on screen, flipping above the anchor when it would run off
  // the bottom — it may still overhang the app window, which is the point.
  if (x + width > area.x + area.width) x = area.x + area.width - width
  if (x < area.x) x = area.x
  if (y + height > area.y + area.height) {
    const above = Math.round(anchor.y - anchor.height - height)
    y = above >= area.y ? above : Math.max(area.y, area.y + area.height - height)
  }
  win.setBounds({ x, y, width, height })
  if (!win.isVisible()) {
    win.showInactive()
    win.focus()
  }
}

/* ---------------------------------------------------------------- dialogs */

function closeAllDialogWindows() {
  for (const win of dialogWindows.values()) {
    if (!win.isDestroyed()) win.destroy()
  }
  dialogWindows.clear()
}

function closeAllChildWindows() {
  closeMenuWindow()
  closeAllDialogWindows()
}

/**
 * Opens `name` as its own window. If it is already open the existing window is
 * reused: it takes the fresh payload, is raised and focused. One button press
 * can therefore never produce a second copy.
 */
function openDialogWindow(name, payload, opener) {
  const existing = dialogWindows.get(name)
  if (existing && !existing.isDestroyed()) {
    existing.webContents.send('dialog:payload', payload)
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    existing.moveTop()
    return true
  }

  const spec = DIALOG_SPECS[name] ?? DEFAULT_SPEC
  const parent = opener && !opener.isDestroyed() ? opener : mainWindow
  let bounds = { width: spec.width, height: spec.height }
  if (parent && !parent.isDestroyed()) {
    const pb = parent.getBounds()
    bounds = {
      ...bounds,
      x: Math.round(pb.x + (pb.width - spec.width) / 2),
      y: Math.round(pb.y + (pb.height - spec.height) / 2),
    }
  }

  const win = new BrowserWindow({
    ...bounds,
    minWidth: spec.minWidth ?? Math.min(spec.width, 320),
    minHeight: spec.minHeight ?? Math.min(spec.height, 180),
    // Owned by the main window, so closing the app tears every dialog down too,
    // but still freely movable anywhere on the desktop.
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    modal: false,
    movable: true,
    resizable: spec.resizable !== false,
    minimizable: false,
    maximizable: spec.resizable !== false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    frame: false,
    backgroundColor: payload?.background ?? '#11161d',
    icon: iconPath(),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.__dialogPayload = payload
  win.__dialogName = name
  dialogWindows.set(name, win)

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })
  win.on('closed', () => {
    if (dialogWindows.get(name) === win) dialogWindows.delete(name)
    const owner = parent && !parent.isDestroyed() ? parent : mainWindow
    if (owner && !owner.isDestroyed()) {
      owner.webContents.send('dialog:closed', name)
    }
  })

  load(win, `dialog=${encodeURIComponent(name)}`)
  return true
}

function closeDialogWindow(name) {
  const win = dialogWindows.get(name)
  if (win && !win.isDestroyed()) win.close()
}

/* -------------------------------------------------------------------- ipc */

function registerChildWindowHandlers() {
  ipcMain.handle('menu:open', (event, payload, anchor) =>
    openMenuWindow(payload, anchor, BrowserWindow.fromWebContents(event.sender)))

  ipcMain.handle('menu:close', () => {
    closeMenuWindow()
  })

  ipcMain.handle('menu:payload', (event) => BrowserWindow.fromWebContents(event.sender)?.__menuPayload ?? null)

  ipcMain.handle('menu:size', (event, size) => {
    sizeMenuWindow(BrowserWindow.fromWebContents(event.sender), size)
  })

  ipcMain.handle('menu:choose', (event, commandId) => {
    const current = menuWindow
    const opener = current && current.openerId >= 0 ? BrowserWindow.fromId(current.openerId) : mainWindow
    closeMenuWindow()
    if (opener && !opener.isDestroyed()) {
      opener.webContents.send('menu:chosen', commandId)
      opener.focus()
    }
    // `event` is the popup itself; it is already closing.
    void event
  })

  ipcMain.handle('dialog:open', (event, name, payload) =>
    openDialogWindow(name, payload, BrowserWindow.fromWebContents(event.sender)))

  ipcMain.handle('dialog:payload', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win ? { name: win.__dialogName, payload: win.__dialogPayload } : null
  })

  ipcMain.handle('dialog:result', (event, name, result) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const owner = win?.getParentWindow() ?? mainWindow
    if (owner && !owner.isDestroyed()) {
      owner.webContents.send('dialog:result', { name, result })
    }
  })

  ipcMain.handle('dialog:close', (event, name) => {
    if (name) {
      closeDialogWindow(name)
      return
    }
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle('dialog:close-all', () => {
    closeAllDialogWindows()
  })
}

function setMainWindow(win) {
  mainWindow = win
}

module.exports = {
  registerChildWindowHandlers,
  setMainWindow,
  openDialogWindow,
  closeDialogWindow,
  closeAllChildWindows,
  closeAllDialogWindows,
  closeMenuWindow,
  dialogWindows,
  DIALOG_SPECS,
}
