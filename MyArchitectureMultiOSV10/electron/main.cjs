// MyArchitecture desktop shell.
//
// The renderer is the same set of ES modules the web build serves: index.html
// at the project root, loaded with loadFile in development and when packaged
// (there is no bundler step). Everything the page needs from the operating
// system goes through the small IPC surface exposed by preload.cjs as
// window.myarch.
const { app, BrowserWindow, dialog, ipcMain, shell, nativeImage, screen } = require('electron')
const fs = require('fs')
const path = require('path')

const APP_NAME = 'MyArchitecture'
const APP_VERSION = (() => {
  try { return require(path.join(__dirname, '..', 'package.json')).version } catch { return '10.0.0' }
})()
const APP_TITLE = `${APP_NAME} ${APP_VERSION.replace(/\.0$/, '')}`
const MIN_WIDTH = 1024
const MIN_HEIGHT = 700
const TITLEBAR_HEIGHT = 38
const DARK_BACKGROUND = '#15181e'

app.setName(APP_NAME)
// %APPDATA%\MyArchitecture (Windows), ~/Library/Application Support/MyArchitecture,
// ~/.config/MyArchitecture. --user-data-dir on the command line wins (used by
// tests and CDP driving, so a test run never touches the real settings).
const userData = app.commandLine.hasSwitch('user-data-dir')
  ? path.resolve(app.commandLine.getSwitchValue('user-data-dir'))
  : path.join(app.getPath('appData'), APP_NAME)
app.setPath('userData', userData)
fs.mkdirSync(userData, { recursive: true })

// Only one MyArchitecture runs at a time (per user-data directory). A second launch
// hands its arguments to the running one (see `second-instance`) and exits.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

const settingsFile = path.join(app.getPath('userData'), 'settings.json')

// Every extension the installer can associate with MyArchitecture; keep in sync
// with FILE_TYPES in scripts/create-installer.mjs.
const SUPPORTED_EXTENSIONS = ['myarch', 'dxf', 'dwg', 'ifc', 'svg', 'obj', 'stl', 'ply', 'glb', 'gltf', 'fbx', 'dae', '3mf', '3ds', 'wrl', 'amf']

let mainWindow = null
let allowClose = false
let pendingOpenPath = null

function fileFromArgv(argv) {
  return (argv || [])
    .slice(1)
    .filter((argument) => typeof argument === 'string' && !argument.startsWith('-'))
    .find((argument) => SUPPORTED_EXTENSIONS.includes(path.extname(argument).slice(1).toLowerCase()))
}

function sendOpenPath(filePath) {
  if (!filePath) return
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('open-path', filePath)
    return
  }
  pendingOpenPath = filePath
}

function iconPath() {
  const candidates = [
    path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    path.join(__dirname, '..', 'assets', 'icon.png'),
    path.join(process.resourcesPath || '', 'icon.ico')
  ]
  return candidates.find((file) => fs.existsSync(file))
}

/** sample/ next to the app in development, resources/sample when packaged. */
function samplesDir() {
  const candidates = [
    app.isPackaged ? path.join(process.resourcesPath, 'sample') : null,
    path.join(__dirname, '..', 'sample'),
    path.join(process.resourcesPath || '', 'sample')
  ].filter(Boolean)
  return candidates.find((dir) => fs.existsSync(dir)) || candidates[0]
}

function isSafeUrl(url) {
  return /^(https?:|mailto:)/i.test(String(url || ''))
}

function createWindow() {
  const icon = iconPath()
  const chrome = process.platform === 'darwin'
    ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 12 } }
    : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#1c2028', symbolColor: '#e3e6ec', height: TITLEBAR_HEIGHT } }
  // Start at 1440×900, but never larger than the screen's work area.
  const area = screen.getPrimaryDisplay().workAreaSize
  mainWindow = new BrowserWindow({
    width: Math.min(1440, area.width),
    height: Math.min(900, area.height),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: APP_TITLE,
    icon,
    show: false,
    backgroundColor: DARK_BACKGROUND,
    autoHideMenuBar: true,
    ...chrome,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })
  if (icon) mainWindow.setIcon(nativeImage.createFromPath(icon))
  mainWindow.setMenuBarVisibility(false)
  mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show())
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'))

  // A file dropped anywhere in the window is for the document to open; it must
  // never replace the app with the file itself. Links leave for the browser.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url === mainWindow.webContents.getURL()) return
    event.preventDefault()
    if (isSafeUrl(url)) shell.openExternal(url)
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-finish-load', () => {
    const initial = pendingOpenPath || fileFromArgv(process.argv)
    pendingOpenPath = null
    if (initial) mainWindow.webContents.send('open-path', initial)
  })

  // The renderer decides about unsaved changes and answers with confirm-close.
  mainWindow.on('close', (event) => {
    if (allowClose) return
    event.preventDefault()
    mainWindow.webContents.send('request-close')
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  // The status bar's resize grip hides while the window is maximized or full screen.
  const sendState = () => mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.send('window-state', { maximized: mainWindow.isMaximized() || mainWindow.isFullScreen() })
  for (const ev of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) mainWindow.on(ev, sendState)
}

// Resize grip in the status bar: the page reads the size when a drag starts and
// sets the new size while it moves (the window's minimum size still applies).
ipcMain.handle('window-size', (event) => {
  const win = windowOf(event)
  if (!win || win.isDestroyed()) return null
  const [width, height] = win.getSize()
  const b = win.getBounds()
  const area = screen.getDisplayMatching(b).workArea
  return { width, height, x: b.x, y: b.y, area, maximized: win.isMaximized() || win.isFullScreen() }
})
ipcMain.on('window-resize', (event, width, height) => {
  const win = windowOf(event)
  if (!win || win.isDestroyed() || win.isMaximized() || win.isFullScreen()) return
  const w = Math.round(Number(width)), h = Math.round(Number(height))
  if (!Number.isFinite(w) || !Number.isFinite(h)) return
  const [minW, minH] = win.getMinimumSize()
  win.setSize(Math.max(minW, w), Math.max(minH, h))
})

app.whenReady().then(createWindow)
app.on('second-instance', (_event, argv) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  }
  sendOpenPath(fileFromArgv(argv))
})
// macOS hands over documents through this event instead of argv.
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  sendOpenPath(filePath)
})
app.on('activate', () => {
  if (!mainWindow && app.isReady()) createWindow()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/* ─────────────────────────────── IPC ─────────────────────────────── */

function errorText(error) {
  return String(error && error.message ? error.message : error)
}

// Binary reads (3D models, images, DXF in any code page) travel as base64.
function readFilePayload(filePath, binary = false) {
  if (binary) return { content: fs.readFileSync(filePath).toString('base64'), encoding: 'base64' }
  return { content: fs.readFileSync(filePath, 'utf8'), encoding: 'utf8' }
}

function windowOf(event) {
  return BrowserWindow.fromWebContents(event.sender) || mainWindow
}

ipcMain.handle('get-version', () => APP_VERSION)

ipcMain.handle('load-settings', async () => {
  try {
    return JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
  } catch {
    return null
  }
})
ipcMain.handle('save-settings', async (_event, settings) => {
  fs.writeFileSync(settingsFile, JSON.stringify(settings ?? {}, null, 2))
  return true
})

// Automated GUI tests set MYARCH_FAKE_DIALOGS to a folder: save dialogs then
// write there under the suggested name, open dialogs read MYARCH_OPEN_FILE
// (or cancel), and printing writes a PDF there — no window ever blocks a run.
const FAKE_DIALOGS = process.env.MYARCH_FAKE_DIALOGS || ''
const fakeSavePath = (defaultPath, fallback) => {
  fs.mkdirSync(FAKE_DIALOGS, { recursive: true })
  return path.join(FAKE_DIALOGS, path.basename(defaultPath || fallback))
}

ipcMain.handle('open-file', async (event, opts = {}) => {
  if (FAKE_DIALOGS) {
    const want = process.env.MYARCH_OPEN_FILE
    if (!want || !fs.existsSync(want)) return { canceled: true }
    return { canceled: false, filePath: want, ...readFilePayload(want, !!opts.binary) }
  }
  const result = await dialog.showOpenDialog(windowOf(event), {
    title: opts.title,
    defaultPath: opts.defaultPath || undefined,
    filters: opts.filters,
    properties: opts.multi ? ['openFile', 'multiSelections'] : ['openFile']
  })
  if (result.canceled || !result.filePaths[0]) return { canceled: true }
  if (opts.multi) return { canceled: false, files: result.filePaths.map((filePath) => ({ filePath, ...readFilePayload(filePath, !!opts.binary) })) }
  const filePath = result.filePaths[0]
  return { canceled: false, filePath, ...readFilePayload(filePath, !!opts.binary) }
})

ipcMain.handle('read-path', async (_event, filePath, opts = {}) => {
  try {
    return { ok: true, filePath, ...readFilePayload(String(filePath), !!(opts && opts.binary)) }
  } catch (error) {
    return { ok: false, error: errorText(error) }
  }
})

// contentBase64 carries binary exports (zip, png, glb, pdf); content is text.
function payloadBuffer(opts) {
  if (typeof opts.contentBase64 === 'string') return Buffer.from(opts.contentBase64, 'base64')
  return Buffer.from(String(opts.content ?? ''), 'utf8')
}

ipcMain.handle('save-file', async (event, opts = {}) => {
  if (FAKE_DIALOGS) {
    const filePath = fakeSavePath(opts.defaultPath, 'export.bin')
    fs.writeFileSync(filePath, payloadBuffer(opts))
    return { canceled: false, filePath }
  }
  const result = await dialog.showSaveDialog(windowOf(event), {
    title: opts.title,
    defaultPath: opts.defaultPath || undefined,
    filters: opts.filters
  })
  if (result.canceled || !result.filePath) return { canceled: true }
  fs.writeFileSync(result.filePath, payloadBuffer(opts))
  return { canceled: false, filePath: result.filePath }
})

// Ctrl+S on a document that already has a path: write it back, no dialog.
ipcMain.handle('write-file', async (_event, opts = {}) => {
  const filePath = String(opts.filePath || '')
  if (!filePath) return { ok: false, error: 'no path' }
  try {
    fs.writeFileSync(filePath, payloadBuffer(opts))
    return { ok: true, filePath }
  } catch (error) {
    return { ok: false, error: errorText(error) }
  }
})

// The renderer lays out .print-area sheets itself; this only opens the
// system print dialog for the current window.
ipcMain.handle('print', async (event) => {
  const win = windowOf(event)
  if (!win) return false
  if (FAKE_DIALOGS) {
    const data = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })
    fs.writeFileSync(fakeSavePath('print.pdf'), data)
    return true
  }
  return new Promise((resolve) => {
    win.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
      resolve(success ? true : { ok: false, error: reason })
    })
  })
})

// The system's default printer. Electron no longer reports it (PrinterInfo has
// no isDefault), so ask the OS: the Windows "Device" registry value, or CUPS.
function defaultPrinterName() {
  const { execFile } = require('child_process')
  const run = (cmd, args) => new Promise((resolve) => {
    execFile(cmd, args, { timeout: 3000, windowsHide: true, encoding: 'utf8' }, (error, stdout) => resolve(error ? '' : String(stdout || '')))
  })
  if (process.platform === 'win32') {
    return run('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows', '/v', 'Device'])
      .then((out) => { const m = out.match(/Device\s+REG_SZ\s+([^,\r\n]+)/); return m ? m[1].trim() : '' })
  }
  return run('lpstat', ['-d']).then((out) => { const m = out.match(/:\s*(\S.*)$/m); return m ? m[1].trim() : '' })
}

// The print window's printer list → [{name, displayName, isDefault}].
ipcMain.handle('list-printers', async (event) => {
  const win = windowOf(event)
  if (!win) return []
  try {
    const [list, def] = await Promise.all([win.webContents.getPrintersAsync(), defaultPrinterName().catch(() => '')])
    return list.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!(p.isDefault || (def && p.name === def)) }))
  } catch {
    return []
  }
})

// Print button of the print window: the sheets laid out in .print-area go
// straight to the chosen printer — silent, no second system dialog. Under
// MYARCH_FAKE_DIALOGS nothing reaches a printer: a PDF of the job and the
// options it would have used are written instead.
ipcMain.handle('print-sheets', async (event, opts = {}) => {
  const win = windowOf(event)
  if (!win) return { ok: false, error: 'no window' }
  const copies = Math.max(1, Math.min(99, Math.round(Number(opts.copies) || 1)))
  const pageSize = typeof opts.pageSize === 'string' || (opts.pageSize && opts.pageSize.width && opts.pageSize.height) ? opts.pageSize : 'A4'
  const options = {
    silent: true,
    deviceName: typeof opts.deviceName === 'string' && opts.deviceName ? opts.deviceName : undefined,
    copies,
    landscape: !!opts.landscape,
    pageSize,
    margins: { marginType: 'none' },
    color: opts.color !== false,
    printBackground: true
  }
  if (FAKE_DIALOGS) {
    try {
      const data = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } })
      fs.writeFileSync(fakeSavePath('print.pdf'), data)
      fs.writeFileSync(fakeSavePath('print-job.json'), JSON.stringify({ ...options, pages: opts.pages, paper: opts.paper, sheet: opts.sheet }, null, 2))
      return { ok: true, fake: true }
    } catch (error) {
      return { ok: false, error: errorText(error) }
    }
  }
  return new Promise((resolve) => {
    try {
      win.webContents.print(options, (success, reason) => resolve(success ? { ok: true } : { ok: false, error: reason || 'failed' }))
    } catch (error) {
      resolve({ ok: false, error: errorText(error) })
    }
  })
})

ipcMain.handle('print-to-pdf', async (event, opts = {}) => {
  const win = windowOf(event)
  if (!win) return { canceled: true }
  const result = FAKE_DIALOGS ? { canceled: false, filePath: fakeSavePath(opts.defaultPath, `${APP_NAME}.pdf`) } : await dialog.showSaveDialog(win, {
    title: opts.title || 'PDF',
    defaultPath: opts.defaultPath || `${APP_NAME}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (result.canceled || !result.filePath) return { canceled: true }
  try {
    const data = await win.webContents.printToPDF({
      pageSize: opts.pageSize || 'A4',
      landscape: !!opts.landscape,
      printBackground: true,
      preferCSSPageSize: true,
      // The sheets carry their own margins; the PDF page must not add more.
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    })
    fs.writeFileSync(result.filePath, data)
    return { canceled: false, filePath: result.filePath }
  } catch (error) {
    return { canceled: false, ok: false, error: errorText(error) }
  }
})

// Interface size (Settings → Appearance).
ipcMain.handle('set-zoom', (event, factor) => {
  const z = Math.max(0.75, Math.min(1.5, Number(factor) || 1))
  event.sender.setZoomFactor(z)
  return z
})

// The user manual opens in its own window (a document, with the program icon
// and its name in the title bar) instead of a popup inside the editor.
let manualWindow = null
ipcMain.handle('open-manual', async (_event, lang) => {
  const file = path.join(__dirname, '..', 'docs', lang === 'en' ? 'USERSGUIDE.en.html' : 'USERSGUIDE.ko.html')
  const title = lang === 'en' ? 'User manual — MyArchitecture 10.0' : '사용자 매뉴얼 — MyArchitecture 10.0'
  if (manualWindow && !manualWindow.isDestroyed()) {
    manualWindow.loadFile(file)
    manualWindow.setTitle(title)
    manualWindow.focus()
    return true
  }
  const icon = iconPath()
  manualWindow = new BrowserWindow({
    width: 1180, height: 860, minWidth: 720, minHeight: 520, title, icon, autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  })
  if (icon) manualWindow.setIcon(nativeImage.createFromPath(icon))
  manualWindow.setMenuBarVisibility(false)
  // Keep the window title fixed (the document would replace it with its own).
  manualWindow.on('page-title-updated', (e) => e.preventDefault())
  manualWindow.webContents.setWindowOpenHandler(({ url }) => { if (isSafeUrl(url)) shell.openExternal(url); return { action: 'deny' } })
  manualWindow.on('closed', () => { manualWindow = null })
  manualWindow.loadFile(file)
  return true
})

ipcMain.handle('open-external', async (_event, url) => {
  if (!isSafeUrl(url)) return false
  await shell.openExternal(url)
  return true
})

// The renderer measures its menu bar and toolbar and asks for a minimum that
// keeps every button reachable; never below the built-in floor.
ipcMain.handle('set-min-size', (event, width, height) => {
  const win = windowOf(event)
  if (!win || win.isDestroyed()) return false
  // Never ask for more than the screen the window is on can show.
  const area = screen.getDisplayMatching(win.getBounds()).workAreaSize
  const minWidth = Math.min(area.width - 16, Math.max(MIN_WIDTH, Math.min(2400, Math.round(Number(width) || MIN_WIDTH))))
  const minHeight = Math.min(area.height - 16, Math.max(MIN_HEIGHT, Math.min(1600, Math.round(Number(height) || MIN_HEIGHT))))
  const bounds = win.getBounds()
  const content = win.getContentBounds()
  const chromeWidth = Math.min(40, Math.max(0, bounds.width - content.width))
  const chromeHeight = Math.min(80, Math.max(0, bounds.height - content.height))
  win.setMinimumSize(minWidth + chromeWidth, minHeight + chromeHeight)
  if (content.width < minWidth || content.height < minHeight) {
    win.setContentSize(Math.max(content.width, minWidth), Math.max(content.height, minHeight))
    keepOnScreen(win)
  }
  return true
})

// A window that grew (bigger toolbar, larger interface size) must not run off
// the screen: slide it back into the work area, shrinking it only if needed.
function keepOnScreen(win) {
  if (!win || win.isDestroyed() || win.isMaximized() || win.isFullScreen()) return
  const b = win.getBounds()
  const a = screen.getDisplayMatching(b).workArea
  const width = Math.min(b.width, a.width)
  const height = Math.min(b.height, a.height)
  const x = Math.min(Math.max(b.x, a.x), a.x + a.width - width)
  const y = Math.min(Math.max(b.y, a.y), a.y + a.height - height)
  if (x !== b.x || y !== b.y || width !== b.width || height !== b.height) win.setBounds({ x, y, width, height })
}

// Theme colours for the caption buttons drawn by the OS (Windows/Linux only;
// macOS keeps its traffic lights).
ipcMain.handle('set-title-bar', (event, colors = {}) => {
  const win = windowOf(event)
  if (!win || win.isDestroyed() || process.platform === 'darwin') return false
  if (typeof win.setTitleBarOverlay !== 'function') return false
  const valid = (c) => typeof c === 'string' && /^#[0-9a-f]{3,8}$|^rgba?\(/i.test(c.trim())
  const overlay = { height: TITLEBAR_HEIGHT }
  if (valid(colors.color)) overlay.color = colors.color.trim()
  if (valid(colors.symbolColor)) overlay.symbolColor = colors.symbolColor.trim()
  try {
    win.setTitleBarOverlay(overlay)
    if (overlay.color) win.setBackgroundColor(overlay.color)
    return true
  } catch {
    return false
  }
})

const SAMPLE_NAME = /^[\w.-]+\.myarch$/

ipcMain.handle('list-samples', async () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(samplesDir(), 'index.json'), 'utf8'))
    if (Array.isArray(parsed)) return parsed
    if (parsed && Array.isArray(parsed.samples)) return parsed.samples
    return []
  } catch {
    return []
  }
})

ipcMain.handle('read-sample', async (_event, file) => {
  const name = String(file || '')
  if (!SAMPLE_NAME.test(name) || name.includes('..')) throw new Error(`invalid sample name: ${name}`)
  return fs.readFileSync(path.join(samplesDir(), name), 'utf8')
})

ipcMain.on('confirm-close', (_event, allow) => {
  if (allow && mainWindow && !mainWindow.isDestroyed()) {
    allowClose = true
    mainWindow.close()
  }
})
