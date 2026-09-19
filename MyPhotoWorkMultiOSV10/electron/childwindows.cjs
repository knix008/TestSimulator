// Menu popups and dialogs as real OS windows.
//
// Two problems are solved by the same mechanism. A frameless BrowserWindow
// clips its own HTML, so a long menu (the Layer menu runs to ~27 rows) cannot
// spill past the app window; and an in-page dialog cannot be dragged out of the
// way. Both become child windows that load the same bundle with a hash route —
// `#menu=` or `#dialog=` — so they can be positioned anywhere on the desktop
// while still being owned by, and torn down with, the main window.
//
// Those routes carry no name. Creating a BrowserWindow is cheap; starting the
// renderer behind it is not — the bundle is parsed, React mounts and the popup
// chunk is fetched, and paying that on every click is what made popups feel
// slow. A nameless route makes every popup window interchangeable, so the main
// process can hand one its identity over IPC. Two things follow: a dismissed
// popup is hidden and put back in a pool instead of destroyed, and the pool can
// be filled in the background before the user clicks anything.
const { BrowserWindow, ipcMain, screen, app } = require('electron')
const path = require('node:path')

/** @type {Map<string, BrowserWindow>} One window per dialog name, so a button can only ever open one. */
const dialogWindows = new Map()
/** @type {{ win: BrowserWindow, openerId: number } | null} Only one menu is ever open. */
let menuWindow = null
let mainWindow = null

/** @type {BrowserWindow[]} Loaded and hidden, waiting to be given an identity. */
const spareDialogs = []
/** How many to keep ready. Two covers a dialog opened on top of another. */
const SPARE_TARGET = 2
/** Past this a recycled window is destroyed rather than kept around. */
const SPARE_LIMIT = 3
/** Set while the app tears down, so popups stop being recycled and go away. */
let shuttingDown = false
let warmTimer = null
/** Distinguishes one opening from the next, so a reused window remounts. */
let openSequence = 0

const DIALOG_SPECS = {
  // Wider than the old in-page panel so each row fits label + control on one
  // line, and fixed: the layout is designed for exactly this size.
  settings: { width: 620, height: 760, resizable: true, minWidth: 560 },
  about: { width: 560, height: 470, resizable: false },
  helpGuide: { width: 660, height: 620, resizable: false },
  error: { width: 620, height: 420, minWidth: 420 },
  unsaved: { width: 460, height: 210, resizable: false },
  new: { width: 520, height: 470, minWidth: 420 },
  export: { width: 440, height: 290, resizable: false },
  // Fixed, and tall enough for the preview sheet, the three controls and the
  // buttons together: this window must never scroll.
  print: { width: 560, height: 760, resizable: false },
  imageInfo: { width: 540, height: 680, minWidth: 380 },
  fill: { width: 440, height: 250, resizable: false },
  stroke: { width: 440, height: 290, resizable: false },
  selectModify: { width: 420, height: 200, resizable: false },
  colorRange: { width: 440, height: 230, resizable: false },
  channelMixer: { width: 460, height: 430, resizable: false },
  selectiveColor: { width: 460, height: 400, resizable: false },
  gradientMap: { width: 440, height: 240, resizable: false },
  replaceColor: { width: 440, height: 270, resizable: false },
  saveSelection: { width: 420, height: 200, resizable: false },
  loadSelection: { width: 440, height: 260, resizable: false },
  skew: { width: 420, height: 230, resizable: false },
  distort: { width: 460, height: 330, resizable: false },
  perspective: { width: 420, height: 200, resizable: false },
  warp: { width: 440, height: 330, resizable: false },
  contentScale: { width: 420, height: 240, resizable: false },
  colorProfile: { width: 460, height: 300, resizable: false },
  threeD: { width: 460, height: 460, resizable: false },
  imageSize: { width: 420, height: 230, resizable: false },
  canvasSize: { width: 420, height: 230, resizable: false },
  text: { width: 480, height: 720, minWidth: 380 },
  brightness: { width: 440, height: 240, resizable: false },
  hue: { width: 440, height: 280, resizable: false },
  blur: { width: 420, height: 200, resizable: false },
  sharpen: { width: 420, height: 200, resizable: false },
  feather: { width: 420, height: 200, resizable: false },
  cameraRaw: { width: 460, height: 300, resizable: false },
  filterGallery: { width: 780, height: 392, resizable: false, minWidth: 780 },
  curves: { width: 420, height: 560, minWidth: 360 },
  levels: { width: 460, height: 460, minWidth: 380 },
  // Added for Photoshop parity.
  filterParams: { width: 440, height: 330, resizable: false },
  adjustment: { width: 460, height: 520, minWidth: 380 },
  lut: { width: 440, height: 300, resizable: false },
  hdrToning: { width: 440, height: 380, resizable: false },
  matchColor: { width: 440, height: 380, resizable: false },
  applyImage: { width: 440, height: 340, resizable: false },
  calculations: { width: 480, height: 520, minWidth: 400 },
  rotateArbitrary: { width: 420, height: 230, resizable: false },
  newGuide: { width: 420, height: 230, resizable: false },
  guideLayout: { width: 440, height: 250, resizable: false },
  selectAndMask: { width: 460, height: 520, minWidth: 380 },
  lensCorrection: { width: 440, height: 300, resizable: false },
  blurGallery: { width: 440, height: 320, resizable: false },
  customFilter: { width: 460, height: 420, resizable: false },
  layerStyle: { width: 760, height: 620, minWidth: 620 },
  gradientEditor: { width: 520, height: 640, minWidth: 420 },
  neural: { width: 440, height: 330, resizable: false },
  neuralModels: { width: 640, height: 560, resizable: true },
  note: { width: 420, height: 240, resizable: false },
  findReplace: { width: 420, height: 270, resizable: false },
  exportAs: { width: 440, height: 330, resizable: false },
  openRecent: { width: 560, height: 420, minWidth: 420 },
  keyboardShortcuts: { width: 460, height: 620, minWidth: 380 },
  contactSheet: { width: 440, height: 230, resizable: false },
  fitImage: { width: 440, height: 230, resizable: false },
  photomerge: { width: 440, height: 240, resizable: false },
  fade: { width: 420, height: 240, resizable: false },
  skyReplace: { width: 440, height: 320, resizable: false },
  perspectiveWarp: { width: 460, height: 380, resizable: false },
  duotone: { width: 440, height: 240, resizable: false },
  indexed: { width: 420, height: 240, resizable: false },
  checkSpelling: { width: 460, height: 360, minWidth: 380 },
  vanishingPoint: { width: 440, height: 200, resizable: false },
  adaptiveWideAngle: { width: 440, height: 320, resizable: false },
  statistics: { width: 420, height: 230, resizable: false },
  namePrompt: { width: 420, height: 180, resizable: false },
  imageProcessor: { width: 440, height: 240, resizable: false },
  transformSelection: { width: 440, height: 300, resizable: false },
}

const DEFAULT_SPEC = { width: 480, height: 360, minWidth: 320 }

function isDev() {
  return !app.isPackaged
}

/**
 * The built bundle is served on the app's own `app://` scheme rather than
 * from `file://`, because a scheme handler can send response headers and a
 * file cannot: the cross-origin isolation headers are what let the renderer
 * use SharedArrayBuffer, which ONNX Runtime needs to run a model on more
 * than one core. `registerBundleScheme` below serves `dist/` on it.
 */
const BUNDLE_HOST = 'bundle'
const distDir = path.join(__dirname, '..', 'dist')

function bundleUrl(hash = '') {
  return `app://${BUNDLE_HOST}/index.html${hash ? `#${hash}` : ''}`
}

/** Called before the app is ready: makes `app://` behave like https. */
function registerBundleScheme() {
  const { protocol } = require('electron')
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  ])
}

/** Called once the app is ready: `app://bundle/<path>` is `dist/<path>`, with the isolation headers. */
function serveBundle() {
  const { protocol, net } = require('electron')
  const { pathToFileURL } = require('node:url')
  protocol.handle('app', async (request) => {
    const url = new URL(request.url)
    let pathname = decodeURIComponent(url.pathname)
    if (pathname === '/' || pathname === '') pathname = '/index.html'
    const file = path.normalize(path.join(distDir, pathname))
    if (url.host !== BUNDLE_HOST || !file.startsWith(distDir)) return new Response('not found', { status: 404 })
    const response = await net.fetch(pathToFileURL(file).href)
    const headers = new Headers(response.headers)
    headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    headers.set('Cross-Origin-Embedder-Policy', 'credentialless')
    if (file.endsWith('.wasm')) headers.set('Content-Type', 'application/wasm')
    return new Response(response.body, { status: response.status, headers })
  })
}

function routeTarget(hash) {
  if (isDev()) {
    return { url: `http://127.0.0.1:5173/#${hash}` }
  }
  return { url: bundleUrl(hash) }
}

/**
 * Loads a popup's route. Unpackaged we prefer the dev server, but fall back to
 * the built bundle when it is not running — otherwise every popup would open
 * blank while the main window, started earlier, still looked fine.
 */
function load(win, hash) {
  const target = routeTarget(hash)
  win.loadURL(target.url).catch(() => {
    if (!win.isDestroyed() && target.url !== bundleUrl(hash)) win.loadURL(bundleUrl(hash)).catch(() => {})
  })
}

function iconPath() {
  return path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
}

function preloadPath() {
  return path.join(__dirname, 'preload.cjs')
}

/* ------------------------------------------------------------------ menus */

/**
 * The one menu popup, created on first use and kept for the life of the app.
 *
 * It used to be created and destroyed per click, so every dropdown waited for a
 * renderer to start. Now it is told which menu to show and simply re-renders,
 * which means only the very first menu of a session is ever slow.
 */
function ensureMenuWindow() {
  if (menuWindow && !menuWindow.win.isDestroyed()) {
    return menuWindow.win
  }
  const win = new BrowserWindow({
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

  menuWindow = { win, openerId: -1 }
  win.__menuMessage = null

  win.on('blur', () => {
    // Clicking anywhere else dismisses the menu, as a native one would.
    if (menuWindow && menuWindow.win === win) hideMenuWindow()
  })
  win.on('close', (event) => {
    // Dismissing a menu hides it; only the app quitting really closes it.
    if (shuttingDown) return
    event.preventDefault()
    hideMenuWindow()
  })
  win.on('closed', () => {
    if (menuWindow && menuWindow.win === win) menuWindow = null
  })

  load(win, 'menu=')
  return win
}

/** Dismisses the menu without giving up its renderer. */
function hideMenuWindow() {
  const current = menuWindow
  if (!current || current.win.isDestroyed()) return
  current.openerId = -1
  current.win.__menuMessage = null
  if (current.win.isVisible()) current.win.hide()
  // Emptied, so the next menu never flashes the previous one's rows.
  current.win.webContents.send('menu:payload', null)
}

function closeMenuWindow() {
  hideMenuWindow()
}

/**
 * Shows the dropdown for `payload.menu` at `anchor` (screen coordinates).
 * The window stays hidden until the renderer reports how tall the list actually
 * is, so it fits its contents exactly and can overhang the app.
 */
function openMenuWindow(payload, anchor, opener) {
  const parent = opener && !opener.isDestroyed() ? opener : mainWindow
  const win = ensureMenuWindow()
  // Hidden while it re-renders: otherwise the outgoing menu would be seen for a
  // frame at the incoming menu's size and place.
  if (win.isVisible()) win.hide()
  openSequence += 1
  const message = { ...payload, anchor, openId: openSequence }
  win.__menuMessage = message
  menuWindow.openerId = parent && !parent.isDestroyed() ? parent.id : -1
  win.webContents.send('menu:payload', message)
  return true
}

/** Fits the popup to its content and keeps it on the anchor's display. */
function sizeMenuWindow(win, size) {
  if (!win || win.isDestroyed()) return
  const message = win.__menuMessage
  // A menu that has been dismissed must not be put back on screen by a late
  // measurement arriving from its own renderer.
  if (!message) return
  const anchor = message.anchor ?? { x: 0, y: 0, width: 0, height: 0 }
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

/** Builds one nameless popup window and starts its renderer loading. */
function createDialogWindow() {
  const win = new BrowserWindow({
    width: DEFAULT_SPEC.width,
    height: DEFAULT_SPEC.height,
    minWidth: 320,
    minHeight: 120,
    modal: false,
    movable: true,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    frame: false,
    backgroundColor: '#11161d',
    icon: iconPath(),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.__dialogName = null
  win.__dialogMessage = null
  win.__ownerId = -1
  win.__ready = false

  win.once('ready-to-show', () => { win.__ready = true })
  win.on('close', (event) => {
    // The X button, Escape and Alt+F4 all arrive here. A popup in use goes back
    // to the pool instead of being destroyed, so opening it again is instant.
    if (shuttingDown || !win.__dialogName) return
    event.preventDefault()
    recycleDialogWindow(win)
  })
  win.on('closed', () => {
    releaseDialogWindow(win)
    const index = spareDialogs.indexOf(win)
    if (index >= 0) spareDialogs.splice(index, 1)
  })

  load(win, 'dialog=')
  return win
}

/** Refills the pool, off the critical path of the click that emptied it. */
function warmDialogPool() {
  if (shuttingDown || warmTimer) return
  warmTimer = setTimeout(() => {
    warmTimer = null
    if (shuttingDown) return
    while (spareDialogs.length < SPARE_TARGET) {
      spareDialogs.push(createDialogWindow())
    }
  }, 400)
  if (typeof warmTimer.unref === 'function') warmTimer.unref()
}

function takeSpareDialog() {
  while (spareDialogs.length > 0) {
    const win = spareDialogs.pop()
    if (win && !win.isDestroyed()) return win
  }
  return createDialogWindow()
}

/** Gives a pooled window the size, limits and place its dialog asks for. */
function applyDialogSpec(win, name, parent) {
  const spec = DIALOG_SPECS[name] ?? DEFAULT_SPEC
  const resizable = spec.resizable !== false
  // Windows pins a non-resizable window to its current size, so the flag has to
  // come off before the bounds are set and go back on afterwards.
  win.setResizable(true)
  win.setMinimumSize(spec.minWidth ?? Math.min(spec.width, 320), 120)
  const bounds = { width: spec.width, height: spec.height }
  if (parent && !parent.isDestroyed()) {
    const pb = parent.getBounds()
    bounds.x = Math.round(pb.x + (pb.width - spec.width) / 2)
    bounds.y = Math.round(pb.y + (pb.height - spec.height) / 2)
    // Owned by the main window, so closing the app tears every dialog down too,
    // but still freely movable anywhere on the desktop.
    win.setParentWindow(parent)
  }
  win.setBounds(bounds)
  win.setResizable(resizable)
  win.setMaximizable(resizable)
}

/**
 * Opens `name` as its own window. If it is already open the existing window is
 * reused: it takes the fresh payload, is raised and focused. One button press
 * can therefore never produce a second copy.
 */
function openDialogWindow(name, payload, opener) {
  const parent = opener && !opener.isDestroyed() ? opener : mainWindow
  openSequence += 1
  const message = { name, payload, openId: openSequence }

  const existing = dialogWindows.get(name)
  if (existing && !existing.isDestroyed()) {
    existing.__dialogMessage = message
    existing.webContents.send('dialog:payload', message)
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    existing.moveTop()
    return true
  }

  const win = takeSpareDialog()
  win.__dialogName = name
  win.__dialogMessage = message
  win.__ownerId = parent && !parent.isDestroyed() ? parent.id : -1
  dialogWindows.set(name, win)
  applyDialogSpec(win, name, parent)
  if (payload && payload.background) {
    win.setBackgroundColor(payload.background)
  }
  // A warm window is listening; a cold one is not, and picks the message up
  // through the `dialog:payload` request it makes as soon as it mounts.
  win.webContents.send('dialog:payload', message)

  const reveal = () => {
    if (win.isDestroyed() || win.__dialogName !== name) return
    win.show()
    win.focus()
  }
  if (win.__ready) reveal()
  else win.once('ready-to-show', reveal)

  warmDialogPool()
  return true
}

/**
 * Fits a dialog window to the height its content actually needs.
 *
 * The hand-picked sizes could not keep up with the content: the hue dialog's
 * buttons sat 100px below the window edge while the text dialog had 130px of
 * dead space under them. The renderer measures itself and the window follows,
 * clamped to the display so a tall dialog scrolls instead of growing off screen.
 */
function sizeDialogWindow(win, size) {
  if (!win || win.isDestroyed() || !win.__dialogName) return
  const spec = DIALOG_SPECS[win.__dialogName] ?? DEFAULT_SPEC
  const display = screen.getDisplayNearestPoint({ x: win.getBounds().x, y: win.getBounds().y })
  const area = display.workArea

  // A width of 0 means "keep what you have"; only the height tracks the content.
  const current0 = win.getBounds()
  const width = size.width
    ? Math.min(Math.max(Math.ceil(size.width), spec.minWidth ?? 320), area.width - 40)
    : current0.width
  const height = Math.min(Math.max(Math.ceil(size.height), 120), area.height - 40)
  const current = win.getBounds()
  if (Math.abs(current.width - width) < 2 && Math.abs(current.height - height) < 2) {
    return
  }

  // Grow around the middle so the window does not appear to crawl down the screen.
  let x = Math.round(current.x + (current.width - width) / 2)
  let y = Math.round(current.y + (current.height - height) / 2)
  x = Math.min(Math.max(x, area.x), area.x + area.width - width)
  y = Math.min(Math.max(y, area.y), area.y + area.height - height)
  // Windows pins a non-resizable window to its creation size, so setBounds is
  // ignored when growing. The flag is lifted only for the call itself; the
  // dialog stays fixed as far as the user is concerned.
  const wasResizable = win.isResizable()
  if (!wasResizable) win.setResizable(true)
  win.setBounds({ x, y, width, height })
  if (!wasResizable) win.setResizable(false)
}

/** Takes a popup out of the open set and tells its opener it has gone. */
function releaseDialogWindow(win) {
  const name = win.__dialogName
  win.__dialogName = null
  win.__dialogMessage = null
  if (!name) return
  if (dialogWindows.get(name) === win) dialogWindows.delete(name)
  const owner = win.__ownerId >= 0 ? BrowserWindow.fromId(win.__ownerId) : mainWindow
  if (owner && !owner.isDestroyed()) {
    owner.webContents.send('dialog:closed', name)
  }
}

/** Hides a dialog and puts its window back in the pool. */
function recycleDialogWindow(win) {
  if (!win || win.isDestroyed()) return
  releaseDialogWindow(win)
  win.hide()
  // Emptying the renderer frees the dialog's DOM and gives the next dialog a
  // clean slate; the window, and the warm renderer behind it, stay.
  win.webContents.send('dialog:payload', { name: null, payload: null, openId: 0 })
  win.setParentWindow(null)
  win.__ownerId = -1
  if (shuttingDown || spareDialogs.length >= SPARE_LIMIT) {
    win.destroy()
    return
  }
  spareDialogs.push(win)
}

function closeDialogWindow(name) {
  const win = dialogWindows.get(name)
  if (win && !win.isDestroyed()) recycleDialogWindow(win)
}

function closeAllDialogWindows() {
  for (const win of [...dialogWindows.values()]) {
    if (!win.isDestroyed()) recycleDialogWindow(win)
  }
  dialogWindows.clear()
}

/** Really tears everything down: the app is going away. */
function closeAllChildWindows() {
  shuttingDown = true
  if (warmTimer) {
    clearTimeout(warmTimer)
    warmTimer = null
  }
  const current = menuWindow
  menuWindow = null
  if (current && !current.win.isDestroyed()) current.win.destroy()
  for (const win of [...dialogWindows.values(), ...spareDialogs]) {
    if (!win.isDestroyed()) win.destroy()
  }
  dialogWindows.clear()
  spareDialogs.length = 0
}

/**
 * Starts the popup renderers while the user is still looking at the editor, so
 * the first menu and the first dialog of a session open as fast as the rest.
 */
function warmChildWindows() {
  if (shuttingDown) return
  ensureMenuWindow()
  warmDialogPool()
}

/* -------------------------------------------------------------------- ipc */

function registerChildWindowHandlers() {
  ipcMain.handle('menu:open', (event, payload, anchor) =>
    openMenuWindow(payload, anchor, BrowserWindow.fromWebContents(event.sender)))

  ipcMain.handle('menu:close', () => {
    hideMenuWindow()
  })

  ipcMain.handle('menu:payload', (event) => BrowserWindow.fromWebContents(event.sender)?.__menuMessage ?? null)

  ipcMain.handle('menu:size', (event, size) => {
    sizeMenuWindow(BrowserWindow.fromWebContents(event.sender), size)
  })

  ipcMain.handle('menu:choose', (event, commandId) => {
    const current = menuWindow
    const opener = current && current.openerId >= 0 ? BrowserWindow.fromId(current.openerId) : mainWindow
    hideMenuWindow()
    if (opener && !opener.isDestroyed()) {
      opener.webContents.send('menu:chosen', commandId)
      opener.focus()
    }
    // `event` is the popup itself; it is already hidden.
    void event
  })

  ipcMain.handle('dialog:open', (event, name, payload) =>
    openDialogWindow(name, payload, BrowserWindow.fromWebContents(event.sender)))

  ipcMain.handle('dialog:payload', (event) =>
    BrowserWindow.fromWebContents(event.sender)?.__dialogMessage ?? null)

  ipcMain.handle('dialog:result', (event, name, result) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const owner = win && win.__ownerId >= 0 ? BrowserWindow.fromId(win.__ownerId) : mainWindow
    if (owner && !owner.isDestroyed()) {
      owner.webContents.send('dialog:result', { name, result })
    }
  })

  ipcMain.handle('dialog:close', (event, name) => {
    if (name) {
      closeDialogWindow(name)
      return
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) recycleDialogWindow(win)
  })

  ipcMain.handle('dialog:close-all', () => {
    closeAllDialogWindows()
  })

  ipcMain.handle('dialog:size', (event, size) => {
    sizeDialogWindow(BrowserWindow.fromWebContents(event.sender), size)
  })

  ipcMain.handle('dialog:error', (event, report) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const owner = win && win.__ownerId >= 0 ? BrowserWindow.fromId(win.__ownerId) : mainWindow
    if (owner && !owner.isDestroyed()) {
      owner.webContents.send('dialog:error', report)
      owner.focus()
    }
  })
}

function setMainWindow(win) {
  mainWindow = win
}

module.exports = {
  registerBundleScheme,
  serveBundle,
  bundleUrl,
  registerChildWindowHandlers,
  sizeDialogWindow,
  setMainWindow,
  openDialogWindow,
  closeDialogWindow,
  closeAllChildWindows,
  closeAllDialogWindows,
  closeMenuWindow,
  warmChildWindows,
  dialogWindows,
  DIALOG_SPECS,
}
