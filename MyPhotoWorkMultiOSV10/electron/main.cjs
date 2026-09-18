const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require('electron')
const fs = require('node:fs/promises')
const { spawn } = require('node:child_process')
const path = require('node:path')
const childWindows = require('./childwindows.cjs')

const isDev = !app.isPackaged
const appId = 'com.shkwon.myphotoworkmultios'
const runtimeIcon = path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
const currentWindowSize = { width: 1680, height: 940 }
// The toolbar row holds every command, the contextual actions and the colour
// controls on one line and never scrolls, so the window may not be made
// narrower than that row needs (measured at 1277px) or buttons would vanish.
const minimumWindowSize = { width: 1320, height: 720 }

if (process.platform === 'win32') {
  app.setAppUserModelId(appId)
}

// Chromium GPU/HTTP disk cache throws Access Denied (0x5) on Windows when two
// instances share the same userData folder, or when a leftover GPUCache lock
// remains. Isolate the unpackaged profile and skip the shader disk cache.
if (isDev) {
  app.setPath('userData', path.join(app.getPath('appData'), 'My Photo Work V1.0 Dev'))
}
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: currentWindowSize.width,
    height: currentWindowSize.height,
    minWidth: minimumWindowSize.width,
    minHeight: minimumWindowSize.height,
    title: 'My Photo Work V1.0',
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#11161d' : '#f4f7f5',
    icon: runtimeIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  childWindows.setMainWindow(mainWindow)

  mainWindow.on('close', (event) => {
    if (mainWindow.forceClose) {
      // Tear every popup down with the app, including the detached menu window
      // that is deliberately not parented to us.
      childWindows.closeAllChildWindows()
      return
    }
    event.preventDefault()
    mainWindow.webContents.send('window:close-request')
  })

  // A dialog left open while the document changes would show stale values.
  mainWindow.on('closed', () => childWindows.closeAllChildWindows())

  // Popups run in renderers of their own, and starting one is what used to make
  // the first click on a menu or a dialog feel slow. They are started here
  // instead, once the editor itself is on screen and the user is still reading
  // it, so the wait falls where nobody is waiting.
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      if (!mainWindow.isDestroyed()) childWindows.warmChildWindows()
    }, 1200).unref?.()
  })

  const bundle = path.join(__dirname, '..', 'dist', 'index.html')
  if (isDev) {
    // Prefer the dev server, but do not leave a blank window when it is not up.
    mainWindow.loadURL('http://127.0.0.1:5173').catch(() => {
      if (!mainWindow.isDestroyed()) mainWindow.loadFile(bundle)
    })
  } else {
    mainWindow.loadFile(bundle)
  }
}

function fileFilters() {
  return [
    { name: 'Photo Work and Images', extensions: ['mpw', 'png', 'jpg', 'jpeg', 'gif', 'tif', 'tiff', 'webp', 'avif', 'bmp', 'heic', 'heif', 'hif', 'dcm', 'dicom'] },
    { name: 'Photo Work Project', extensions: ['mpw'] },
    { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'tif', 'tiff', 'webp', 'avif', 'bmp', 'heic', 'heif', 'hif'] },
    { name: 'DICOM', extensions: ['dcm', 'dicom'] },
    { name: 'All Files', extensions: ['*'] },
  ]
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.mpw') return 'application/json'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.avif') return 'image/avif'
  if (ext === '.bmp') return 'image/bmp'
  if (ext === '.tif' || ext === '.tiff') return 'image/tiff'
  if (ext === '.heic') return 'image/heic'
  // Fujifilm cameras write HEIF stills as .hif.
  if (ext === '.heif' || ext === '.hif') return 'image/heif'
  if (ext === '.dcm' || ext === '.dicom') return 'application/dicom'
  return 'application/octet-stream'
}

ipcMain.handle('files:open', async (_event, options = {}) => {
  const result = await dialog.showOpenDialog({
    defaultPath: options.defaultPath,
    filters: fileFilters(),
    properties: ['openFile', 'multiSelections'],
  })
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, files: [] }
  }

  const files = await Promise.all(result.filePaths.map(async (filePath) => {
    const mime = mimeFor(filePath)
    if (mime === 'application/json' || path.extname(filePath).toLowerCase() === '.mpw') {
      return { path: filePath, name: path.basename(filePath), mime: 'application/json', text: await fs.readFile(filePath, 'utf8') }
    }
    const buffer = await fs.readFile(filePath)
    return { path: filePath, name: path.basename(filePath), mime, size: buffer.length, dataUrl: `data:${mime};base64,${buffer.toString('base64')}` }
  }))

  return { canceled: false, directory: path.dirname(result.filePaths[0]), files }
})

ipcMain.handle('files:save', async (_event, options = {}) => {
  const defaultPath = options.defaultDirectory ? path.join(options.defaultDirectory, options.fileName) : options.fileName
  const result = await dialog.showSaveDialog({
    defaultPath,
    filters: options.filters ?? [{ name: 'All Files', extensions: ['*'] }],
  })
  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  if (options.dataUrl) {
    const base64 = String(options.dataUrl).split(',')[1] ?? ''
    await fs.writeFile(result.filePath, Buffer.from(base64, 'base64'))
  } else {
    await fs.writeFile(result.filePath, options.text ?? '', 'utf8')
  }

  return { canceled: false, filePath: result.filePath, directory: path.dirname(result.filePath) }
})

ipcMain.handle('files:write', async (_event, options = {}) => {
  if (!options.filePath) {
    return { canceled: true }
  }
  if (options.dataUrl) {
    const base64 = String(options.dataUrl).split(',')[1] ?? ''
    await fs.writeFile(options.filePath, Buffer.from(base64, 'base64'))
  } else {
    await fs.writeFile(options.filePath, options.text ?? '', 'utf8')
  }
  return { canceled: false, filePath: options.filePath }
})

/*
 * Printing.
 *
 * The app shows one print window: the preview, the printer, the orientation and
 * the number of copies together. Because those choices have already been made
 * there, the job is sent straight to the printer rather than through a second
 * system dialog that would ask for them again.
 */
/**
 * The name of the printer the operating system treats as the default.
 *
 * Chromium's own printer list does not carry it: `getPrintersAsync()` returns
 * `name`, `displayName`, `description` and `options` and nothing else, so
 * `isDefault` is always undefined and the print window would simply select
 * whichever printer the OS happened to list first. Each platform is asked the
 * question in its own way instead.
 */
function defaultPrinterName() {
  return new Promise((resolve) => {
    const done = (value) => resolve(typeof value === 'string' ? value.trim() : '')
    let command
    let args
    if (process.platform === 'win32') {
      // "Device"="<printer>,<driver>,<port>" under the per-user Windows key.
      command = 'reg'
      args = ['query', 'HKCU' + String.fromCharCode(92) + 'Software' + String.fromCharCode(92)
        + 'Microsoft' + String.fromCharCode(92) + 'Windows NT' + String.fromCharCode(92)
        + 'CurrentVersion' + String.fromCharCode(92) + 'Windows', '/v', 'Device']
    } else {
      // CUPS: "system default destination: <printer>".
      command = 'lpstat'
      args = ['-d']
    }
    let child
    try {
      child = spawn(command, args, { windowsHide: true })
    } catch {
      done('')
      return
    }
    let output = ''
    child.stdout?.on('data', (chunk) => { output += String(chunk) })
    child.on('error', () => done(''))
    child.on('close', () => {
      if (process.platform === 'win32') {
        const match = /Device\s+REG_SZ\s+(.+)/i.exec(output)
        done(match ? String(match[1]).split(',')[0] : '')
        return
      }
      const match = /:\s*(.+)\s*$/.exec(output.split('\n').find((line) => line.includes(':')) ?? '')
      done(match ? match[1] : '')
    })
    // A hung shell must not keep the print window waiting.
    setTimeout(() => { try { child.kill() } catch { /* already gone */ } done('') }, 2500)
  })
}

ipcMain.handle('print:printers', async (event) => {
  try {
    const [printers, preferred] = await Promise.all([
      event.sender.getPrintersAsync(),
      defaultPrinterName(),
    ])
    const list = printers.map((printer) => ({
      name: printer.name,
      displayName: printer.displayName || printer.name,
      isDefault: Boolean(printer.isDefault) || (preferred !== '' && printer.name === preferred),
    }))
    // The OS answer is authoritative, so nothing else may claim the flag.
    if (list.some((printer) => printer.isDefault && printer.name === preferred)) {
      for (const printer of list) printer.isDefault = printer.name === preferred
    }
    return list
  } catch {
    return []
  }
})

ipcMain.handle('print:job', async (_event, options = {}) => {
  // The page is loaded from a file rather than a data URL: a full-size photo
  // makes a data URL of several megabytes, which is not what those are for.
  const sheetPath = path.join(app.getPath('temp'), `myphotowork-print-${Date.now()}.html`)
  let sheet = null
  try {
    await fs.writeFile(sheetPath, String(options.html ?? ''), 'utf8')
    sheet = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    await sheet.loadFile(sheetPath)
    await new Promise((resolve, reject) => {
      sheet.webContents.print(
        {
          silent: true,
          deviceName: options.deviceName || undefined,
          landscape: Boolean(options.landscape),
          copies: Math.max(1, Number(options.copies) || 1),
          printBackground: true,
          // The page carries its own margin in CSS; this stops the printer
          // adding a second one on top of it.
          margins: { marginType: 'none' },
        },
        (success, reason) => (success ? resolve() : reject(new Error(reason || 'The printer refused the job'))),
      )
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, message: error.message }
  } finally {
    if (sheet && !sheet.isDestroyed()) {
      sheet.destroy()
    }
    await fs.rm(sheetPath, { force: true }).catch(() => {})
  }
})

ipcMain.handle('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.handle('window:toggle-maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) {
    return
  }
  if (window.isMaximized()) {
    window.unmaximize()
  } else {
    window.maximize()
  }
})

ipcMain.handle('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

ipcMain.handle('window:force-close', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (window) {
    window.forceClose = true
    window.close()
  }
})

function focusExistingWindow() {
  const window = BrowserWindow.getAllWindows()[0]
  if (!window) {
    return
  }
  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
}

if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    focusExistingWindow()
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    childWindows.registerChildWindowHandlers()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

app.on('before-quit', () => {
  childWindows.closeAllChildWindows()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
